import {
  RequestDelistRequestBody,
  RequestDelistResponse,
  PrepareConfirmReceiptRequestBody,
  PrepareConfirmReceiptResponse,
  RecordConfirmReceiptRequestBody,
  RecordConfirmReceiptResponse,
  PrepareSetStatusResponse,
} from "../types/passport.types";
import { normalizeAddress, validateWalletAddress } from "../../../utils/walletHelper";
import { makeAptosClient } from "../../../config/aptos";
import { getPassport, getPassportOwner } from "../../../chains/luxpass/readers";
import {
  PASSPORT_DELIST_FN,
  STATUS_STORING,
  STATUS_LISTING,
  STATUS_RETURNING,
} from "../../../chains/luxpass/constants";
import { buildSetPassportStatusPayload } from "../../../chains/luxpass/writers/setPassportStatus";
import { buildDelistPassportPayload } from "../../../chains/luxpass/writers/delistPassport";
import {
  createDelistRequest,
  updateDelistRequestStatus,
  updateListingRequestStatus,
  getDelistRequest,
  getListingRequest,
  ListingRequestStatus,
  DelistRequestStatus,
} from "../repository/listing_repository";
import { NORMALIZED_REGISTRY, validateRecordedTransaction } from "./passport.service.helpers";

const aptos = makeAptosClient();

export const delistService = {
  async requestDelist(params: {
    callerWalletAddress: string;
    body: RequestDelistRequestBody;
  }): Promise<RequestDelistResponse> {
    const { callerWalletAddress, body } = params;

    validateWalletAddress(body.passportObjectAddress, "passport object address");

    const normalizedPassportAddr = normalizeAddress(body.passportObjectAddress);

    let passport: Awaited<ReturnType<typeof getPassport>>;
    try {
      passport = await getPassport(aptos, normalizedPassportAddr);
    } catch {
      return {
        success: false,
        error: "Passport not found. Check the passport object address.",
      };
    }

    if (passport.status !== STATUS_LISTING && passport.status !== STATUS_STORING) {
      return {
        success: false,
        error: "Passport is not currently being listed. Only listed passports can be delisted.",
      };
    }

    const normalizedCaller = normalizeAddress(callerWalletAddress);
    const onChainOwner = await getPassportOwner(normalizedPassportAddr);
    if (normalizeAddress(onChainOwner) !== normalizedCaller) {
      return { success: false, error: "You are not the owner of this passport." };
    }

    if (passport.status === STATUS_LISTING) {
      if (!body.addressLine1?.trim()) {
        return { success: false, error: "Address line 1 is required." };
      }
      if (!body.city?.trim()) {
        return { success: false, error: "City is required." };
      }
      if (!body.postalCode?.trim()) {
        return { success: false, error: "Postal code is required." };
      }
      if (!body.country?.trim()) {
        return { success: false, error: "Country is required." };
      }
    }

    try {
      await createDelistRequest({
        passportObjectAddress: normalizedPassportAddr,
        requesterAddress: normalizedCaller,
        addressLine1: body.addressLine1,
        addressLine2: body.addressLine2,
        city: body.city,
        state: body.state,
        postalCode: body.postalCode,
        country: body.country,
      });

      await updateListingRequestStatus(
        normalizedPassportAddr,
        "request_return" as ListingRequestStatus
      );
    } catch (error) {
      return { success: false, error: "Delist request failed to submit:" + error };
    }

    return {
      success: true,
      message: "Delist request submitted. Admin will review and delist your passport.",
    };
  },

  async prepareConfirmReceipt(params: {
    callerWalletAddress: string;
    body: PrepareConfirmReceiptRequestBody;
  }): Promise<PrepareConfirmReceiptResponse> {
    const { callerWalletAddress, body } = params;

    validateWalletAddress(body.passportObjectAddress, "passport object address");

    const normalizedPassportAddr = normalizeAddress(body.passportObjectAddress);
    const normalizedCaller = normalizeAddress(callerWalletAddress);

    let passport: Awaited<ReturnType<typeof getPassport>>;
    try {
      passport = await getPassport(aptos, normalizedPassportAddr);
    } catch {
      return {
        success: false,
        error: "Passport not found. Check the passport object address.",
      };
    }

    if (passport.status !== STATUS_RETURNING) {
      return {
        success: false,
        error: "Passport must be in RETURNING status to confirm receipt.",
      };
    }

    const onChainOwner = await getPassportOwner(normalizedPassportAddr);
    if (normalizeAddress(onChainOwner) !== normalizedCaller) {
      return { success: false, error: "You are not the owner of this passport." };
    }

    const payload = buildDelistPassportPayload({
      passportObjectAddress: normalizedPassportAddr,
      registryAddress: NORMALIZED_REGISTRY,
    });

    return { success: true, payload };
  },

  async recordConfirmReceipt(params: {
    body: RecordConfirmReceiptRequestBody;
  }): Promise<RecordConfirmReceiptResponse> {
    const { body } = params;

    validateWalletAddress(body.passportObjectAddress, "passport object address");

    const validation = await validateRecordedTransaction(
      body.txHash,
      PASSPORT_DELIST_FN,
      "Transaction is not a delist transaction."
    );
    if (!validation.success) return { success: false, error: validation.error };

    try {
      const normalizedAddress = normalizeAddress(body.passportObjectAddress);
      await updateDelistRequestStatus(normalizedAddress, "closed" as DelistRequestStatus);
      await updateListingRequestStatus(normalizedAddress, "returned" as ListingRequestStatus);
    } catch (err: any) {
      return {
        success: false,
        error: "Failed to update database after confirming receipt:" + err,
      };
    }

    return { success: true, message: "Receipt confirmed. Passport is now active." };
  },

  async markDelistProcessed(params: {
    callerRole: "ADMIN";
    passportObjectAddress: string;
  }): Promise<PrepareSetStatusResponse> {
    const { passportObjectAddress } = params;

    validateWalletAddress(passportObjectAddress, "passport object address");

    const normalizedPassportAddr = normalizeAddress(passportObjectAddress);

    const existing = await getDelistRequest(normalizedPassportAddr);
    if (!existing) {
      return { success: false, error: "No delist request found for this passport." };
    }

    if (existing.status !== "pending") {
      return { success: false, error: "Delist request has already been processed." };
    }

    try {
      const listing = await getListingRequest(normalizedPassportAddr);
      if (!listing) {
        return { success: false, error: "No listing request found for this passport." };
      }

      if (listing.status !== "request_return") {
        return {
          success: false,
          error: "Listing is not requesting a return:" + listing.status,
        };
      }

      const listed_owner = await getPassportOwner(normalizedPassportAddr);
      if (listed_owner !== listing.owner_address || listed_owner !== existing.requester_address) {
        return {
          success: false,
          error:
            "Owner mismatch:" +
            listed_owner +
            ", " +
            listing.owner_address +
            ", " +
            existing.requester_address,
        };
      }

      const payload = buildSetPassportStatusPayload({
        passportObjectAddress: normalizedPassportAddr,
        registryAddress: NORMALIZED_REGISTRY,
        newStatus: STATUS_RETURNING,
      });

      return { success: true, payload };
    } catch (error) {
      return { success: false, error: "Delist request failed to submit:" + error };
    }
  },
};
