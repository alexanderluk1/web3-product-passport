import { makeAptosClient } from "../../../config/aptos";
import { getPassport, getEscrowListing } from "../../../chains/luxpass/readers";
import { getPassportOwner } from "../../../chains/luxpass/readers/getPassportOwner";
import {
  buildEscrowCreateListingPayload,
  buildEscrowPurchasePayload,
  buildEscrowCancelListingPayload,
  buildEscrowUpdatePricePayload,
} from "../../../chains/luxpass/writers/escrowPayloadBuilders";
import {
  REGISTRY_ADDRESS,
  STATUS_LISTING,
  ESCROW_CREATE_LISTING_FN,
  ESCROW_PURCHASE_FN,
  ESCROW_CANCEL_LISTING_FN,
  ESCROW_PURCHASE_COMPLETED_EV,
} from "../../../chains/luxpass/constants";
import { normalizeAddress } from "../../../utils/walletHelper";
import {
  getListingRequest,
  getListedInEscrow,
  updateListingEscrowStatus,
  updateListingRequestStatus,
  updateListingRequestOwner,
} from "../repository/listing_repository";
import {
  createPurchaseOrder,
  getPurchaseOrder,
  getPurchaseOrdersByBuyer,
  updatePurchaseOrderDelivery,
} from "../repository/purchase_repository";
import { validateRecordedTransaction, NORMALIZED_REGISTRY } from "./passport.service.helpers";
import type { MarketplaceListing } from "../types/escrow.types";

const aptos = makeAptosClient();

export const escrowService = {
  // ─── Seller: prepare create_listing tx ──────────────────────────
  async prepareCreateEscrowListing(params: {
    callerWalletAddress: string;
    passportObjectAddress: string;
    priceOctas: string;
  }) {
    const callerAddr = normalizeAddress(params.callerWalletAddress);
    const passportAddr = normalizeAddress(params.passportObjectAddress);
    const priceOctas = params.priceOctas;

    if (!priceOctas || BigInt(priceOctas) <= 0n) {
      return { success: false as const, error: "Price must be greater than 0." };
    }

    // Check passport on-chain
    const passport = await getPassport(aptos, passportAddr);
    if (!passport) {
      return { success: false as const, error: "Passport not found on chain." };
    }
    if (passport.status !== STATUS_LISTING) {
      return { success: false as const, error: "Passport must be in LISTING status." };
    }

    // Check ownership
    const owner = await getPassportOwner(passportAddr);
    if (normalizeAddress(owner) !== callerAddr) {
      return { success: false as const, error: "You are not the owner of this passport." };
    }

    // Check DB listing exists and is status=listed
    const listing = await getListingRequest(passportAddr);
    if (!listing || listing.status !== "listed") {
      return { success: false as const, error: "Listing not found or not in listed status." };
    }
    if (listing.in_escrow) {
      return { success: false as const, error: "Passport is already in escrow." };
    }

    const payload = buildEscrowCreateListingPayload({
      passportObjectAddress: passportAddr,
      adminAddress: NORMALIZED_REGISTRY,
      priceOctas,
    });

    return { success: true as const, payload };
  },

  // ─── Seller: record create_listing tx ───────────────────────────
  async recordCreateEscrowListing(params: {
    txHash: string;
    passportObjectAddress: string;
    priceOctas: string;
  }) {
    const passportAddr = normalizeAddress(params.passportObjectAddress);
    const result = await validateRecordedTransaction(params.txHash, ESCROW_CREATE_LISTING_FN);
    if (!result.success) {
      return { success: false as const, error: (result as { error: string }).error };
    }

    await updateListingEscrowStatus(passportAddr, true, params.priceOctas, params.txHash);
    return { success: true as const, message: "Escrow listing created successfully." };
  },

  // ─── Buyer: prepare purchase tx ─────────────────────────────────
  async preparePurchase(params: {
    callerWalletAddress: string;
    passportObjectAddress: string;
  }) {
    const buyerAddr = normalizeAddress(params.callerWalletAddress);
    const passportAddr = normalizeAddress(params.passportObjectAddress);

    // Check escrow listing on-chain
    const escrowListing = await getEscrowListing(aptos, NORMALIZED_REGISTRY, passportAddr);
    if (!escrowListing || !escrowListing.isActive) {
      return { success: false as const, error: "Escrow listing not found or inactive." };
    }

    if (normalizeAddress(escrowListing.seller) === buyerAddr) {
      return { success: false as const, error: "You cannot purchase your own listing." };
    }

    const payload = buildEscrowPurchasePayload({
      passportObjectAddress: passportAddr,
      adminAddress: NORMALIZED_REGISTRY,
    });

    return {
      success: true as const,
      payload,
      priceOctas: escrowListing.priceOctas,
    };
  },

  // ─── Buyer: record purchase tx ──────────────────────────────────
  async recordPurchase(params: {
    txHash: string;
    passportObjectAddress: string;
    buyerAddress: string;
  }) {
    const passportAddr = normalizeAddress(params.passportObjectAddress);
    const buyerAddr = normalizeAddress(params.buyerAddress);

    const result = await validateRecordedTransaction(params.txHash, ESCROW_PURCHASE_FN);
    if (!result.success) {
      return { success: false as const, error: (result as { error: string }).error };
    }

    // Extract PurchaseCompleted event to get seller + price
    const purchaseEvent = result.tx.events?.find(
      (e) => e.type.toLowerCase() === ESCROW_PURCHASE_COMPLETED_EV.toLowerCase(),
    );
    const seller = purchaseEvent?.data?.seller ?? "";
    const price = purchaseEvent?.data?.price_octas ?? "0";

    // Create purchase order
    await createPurchaseOrder({
      passportObjectAddress: passportAddr,
      buyerAddress: buyerAddr,
      sellerAddress: normalizeAddress(seller),
      priceOctas: String(price),
      purchaseTxHash: params.txHash,
    });

    // Update listing status to sold, escrow false
    await updateListingEscrowStatus(passportAddr, false);
    await updateListingRequestStatus(passportAddr, "sold");
    await updateListingRequestOwner(passportAddr, buyerAddr);

    return { success: true as const, message: "Purchase recorded successfully." };
  },

  // ─── Seller: prepare cancel_listing tx ──────────────────────────
  async prepareCancelEscrowListing(params: {
    callerWalletAddress: string;
    passportObjectAddress: string;
  }) {
    const callerAddr = normalizeAddress(params.callerWalletAddress);
    const passportAddr = normalizeAddress(params.passportObjectAddress);

    const escrowListing = await getEscrowListing(aptos, NORMALIZED_REGISTRY, passportAddr);
    if (!escrowListing || !escrowListing.isActive) {
      return { success: false as const, error: "Escrow listing not found or inactive." };
    }
    if (normalizeAddress(escrowListing.seller) !== callerAddr) {
      return { success: false as const, error: "Only the seller can cancel." };
    }

    const payload = buildEscrowCancelListingPayload({
      passportObjectAddress: passportAddr,
      adminAddress: NORMALIZED_REGISTRY,
    });

    return { success: true as const, payload };
  },

  // ─── Seller: record cancel_listing tx ───────────────────────────
  async recordCancelEscrowListing(params: {
    txHash: string;
    passportObjectAddress: string;
  }) {
    const passportAddr = normalizeAddress(params.passportObjectAddress);
    const result = await validateRecordedTransaction(params.txHash, ESCROW_CANCEL_LISTING_FN);
    if (!result.success) {
      return { success: false as const, error: (result as { error: string }).error };
    }

    await updateListingEscrowStatus(passportAddr, false, undefined, undefined);
    return { success: true as const, message: "Escrow listing cancelled." };
  },

  // ─── Seller: update price (on-chain) ────────────────────────────
  async prepareUpdatePrice(params: {
    callerWalletAddress: string;
    passportObjectAddress: string;
    newPriceOctas: string;
  }) {
    const callerAddr = normalizeAddress(params.callerWalletAddress);
    const passportAddr = normalizeAddress(params.passportObjectAddress);

    if (!params.newPriceOctas || BigInt(params.newPriceOctas) <= 0n) {
      return { success: false as const, error: "Price must be greater than 0." };
    }

    const escrowListing = await getEscrowListing(aptos, NORMALIZED_REGISTRY, passportAddr);
    if (!escrowListing || !escrowListing.isActive) {
      return { success: false as const, error: "Escrow listing not found or inactive." };
    }
    if (normalizeAddress(escrowListing.seller) !== callerAddr) {
      return { success: false as const, error: "Only the seller can update the price." };
    }

    const payload = buildEscrowUpdatePricePayload({
      passportObjectAddress: passportAddr,
      adminAddress: NORMALIZED_REGISTRY,
      newPriceOctas: params.newPriceOctas,
    });

    return { success: true as const, payload };
  },

  // ─── Buyer: request physical delivery after purchase ────────────
  async requestDelivery(params: {
    callerWalletAddress: string;
    passportObjectAddress: string;
    shippingAddress: {
      line1: string;
      line2?: string;
      city: string;
      state?: string;
      postalCode: string;
      country: string;
    };
  }) {
    const buyerAddr = normalizeAddress(params.callerWalletAddress);
    const passportAddr = normalizeAddress(params.passportObjectAddress);

    const order = await getPurchaseOrder(passportAddr);
    if (!order) {
      return { success: false as const, error: "No purchase order found." };
    }
    if (normalizeAddress(order.buyer_address) !== buyerAddr) {
      return { success: false as const, error: "You are not the buyer." };
    }
    if (order.status !== "completed") {
      return { success: false as const, error: `Cannot request delivery in ${order.status} status.` };
    }

    await updatePurchaseOrderDelivery(order.id, params.shippingAddress);
    return { success: true as const, message: "Delivery request submitted." };
  },

  // ─── Marketplace: public browse ─────────────────────────────────
  async getMarketplaceListings(): Promise<MarketplaceListing[]> {
    const listings = await getListedInEscrow();
    return listings.map((l) => ({
      passportObjectAddress: l.passport_object_address ?? "",
      ownerAddress: l.owner_address,
      priceOctas: l.price_octas ?? "0",
      inEscrow: l.in_escrow,
      productName: l.product_name,
      brand: l.brand,
      category: l.category,
      listedAt: l.updated_at?.toISOString() ?? "",
    }));
  },

  // ─── Buyer: my purchases ────────────────────────────────────────
  async getMyPurchases(buyerAddress: string) {
    return getPurchaseOrdersByBuyer(buyerAddress);
  },
};
