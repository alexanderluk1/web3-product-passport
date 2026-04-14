import type { Request, Response } from "express";
import { escrowService } from "../services/escrow.service";
import type {
  PrepareEscrowListingBody,
  RecordEscrowListingBody,
  PreparePurchaseBody,
  RecordPurchaseBody,
  PrepareCancelBody,
  RecordCancelBody,
  UpdatePriceBody,
  RequestDeliveryBody,
} from "../types/escrow.types";
import { getEscrowListing } from "../../../chains/luxpass/readers";
import { makeAptosClient } from "../../../config/aptos";
import { REGISTRY_ADDRESS } from "../../../chains/luxpass/constants";
import { normalizeAddress } from "../../../utils/walletHelper";

const aptos = makeAptosClient();
const ADMIN_ADDR = normalizeAddress(REGISTRY_ADDRESS);

// ── Marketplace browse (public) ──────────────────────────────────

export async function getMarketplaceHandler(_req: Request, res: Response) {
  try {
    const listings = await escrowService.getMarketplaceListings();
    return res.json({ success: true, payload: listings });
  } catch (error) {
    console.error("[escrow] getMarketplace error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch marketplace listings." });
  }
}

export async function getEscrowListingHandler(req: Request, res: Response) {
  try {
    const { passportObjectAddress } = req.params;
    if (!passportObjectAddress) {
      return res.status(400).json({ success: false, error: "Missing passportObjectAddress." });
    }
    const addr = Array.isArray(passportObjectAddress) ? passportObjectAddress[0] : passportObjectAddress;
    const listing = await getEscrowListing(aptos, ADMIN_ADDR, normalizeAddress(addr));
    if (!listing) {
      return res.status(404).json({ success: false, error: "Escrow listing not found." });
    }
    return res.json({ success: true, payload: listing });
  } catch (error) {
    console.error("[escrow] getListing error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch listing." });
  }
}

// ── Create escrow listing ────────────────────────────────────────

export async function prepareEscrowListingHandler(req: Request, res: Response) {
  try {
    const { passportObjectAddress, priceOctas } = req.body as PrepareEscrowListingBody;
    if (!passportObjectAddress || !priceOctas) {
      return res.status(400).json({ success: false, error: "Missing passportObjectAddress or priceOctas." });
    }
    const result = await escrowService.prepareCreateEscrowListing({
      callerWalletAddress: req.user!.walletAddress,
      passportObjectAddress,
      priceOctas,
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error("[escrow] prepareCreateListing error:", error);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
}

export async function recordEscrowListingHandler(req: Request, res: Response) {
  try {
    const { txHash, passportObjectAddress, priceOctas } = req.body as RecordEscrowListingBody;
    if (!txHash || !passportObjectAddress || !priceOctas) {
      return res.status(400).json({ success: false, error: "Missing required fields." });
    }
    const result = await escrowService.recordCreateEscrowListing({
      txHash,
      passportObjectAddress,
      priceOctas,
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error("[escrow] recordCreateListing error:", error);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
}

// ── Purchase ─────────────────────────────────────────────────────

export async function preparePurchaseHandler(req: Request, res: Response) {
  try {
    const { passportObjectAddress } = req.body as PreparePurchaseBody;
    if (!passportObjectAddress) {
      return res.status(400).json({ success: false, error: "Missing passportObjectAddress." });
    }
    const result = await escrowService.preparePurchase({
      callerWalletAddress: req.user!.walletAddress,
      passportObjectAddress,
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error("[escrow] preparePurchase error:", error);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
}

export async function preparePurchaseWithLptHandler(req: Request, res: Response) {
  try {
    const { passportObjectAddress } = req.body as PreparePurchaseBody;
    if (!passportObjectAddress) {
      return res.status(400).json({ success: false, error: "Missing passportObjectAddress." });
    }
    const result = await escrowService.preparePurchaseWithLpt({
      callerWalletAddress: req.user!.walletAddress,
      passportObjectAddress,
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error("[escrow] preparePurchaseWithLpt error:", error);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
}

export async function recordPurchaseHandler(req: Request, res: Response) {
  try {
    const { txHash, passportObjectAddress } = req.body as RecordPurchaseBody;
    if (!txHash || !passportObjectAddress) {
      return res.status(400).json({ success: false, error: "Missing required fields." });
    }
    const result = await escrowService.recordPurchase({
      txHash,
      passportObjectAddress,
      buyerAddress: req.user!.walletAddress,
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error("[escrow] recordPurchase error:", error);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
}

// ── Cancel listing ───────────────────────────────────────────────

export async function prepareCancelListingHandler(req: Request, res: Response) {
  try {
    const { passportObjectAddress } = req.body as PrepareCancelBody;
    if (!passportObjectAddress) {
      return res.status(400).json({ success: false, error: "Missing passportObjectAddress." });
    }
    const result = await escrowService.prepareCancelEscrowListing({
      callerWalletAddress: req.user!.walletAddress,
      passportObjectAddress,
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error("[escrow] prepareCancelListing error:", error);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
}

export async function recordCancelListingHandler(req: Request, res: Response) {
  try {
    const { txHash, passportObjectAddress } = req.body as RecordCancelBody;
    if (!txHash || !passportObjectAddress) {
      return res.status(400).json({ success: false, error: "Missing required fields." });
    }
    const result = await escrowService.recordCancelEscrowListing({
      txHash,
      passportObjectAddress,
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error("[escrow] recordCancelListing error:", error);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
}

// ── Update price ─────────────────────────────────────────────────

export async function updatePriceHandler(req: Request, res: Response) {
  try {
    const { passportObjectAddress, newPriceOctas } = req.body as UpdatePriceBody;
    if (!passportObjectAddress || !newPriceOctas) {
      return res.status(400).json({ success: false, error: "Missing required fields." });
    }
    const result = await escrowService.prepareUpdatePrice({
      callerWalletAddress: req.user!.walletAddress,
      passportObjectAddress,
      newPriceOctas,
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error("[escrow] updatePrice error:", error);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
}

// ── Delivery request ─────────────────────────────────────────────

export async function requestDeliveryHandler(req: Request, res: Response) {
  try {
    const body = req.body as RequestDeliveryBody;
    if (!body.passportObjectAddress || !body.addressLine1 || !body.city || !body.postalCode || !body.country) {
      return res.status(400).json({ success: false, error: "Missing required shipping fields." });
    }
    const result = await escrowService.requestDelivery({
      callerWalletAddress: req.user!.walletAddress,
      passportObjectAddress: body.passportObjectAddress,
      shippingAddress: {
        line1: body.addressLine1,
        line2: body.addressLine2,
        city: body.city,
        state: body.state,
        postalCode: body.postalCode,
        country: body.country,
      },
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error("[escrow] requestDelivery error:", error);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
}

// ── My purchases ─────────────────────────────────────────────────

export async function getMyPurchasesHandler(req: Request, res: Response) {
  try {
    const purchases = await escrowService.getMyPurchases(req.user!.walletAddress);
    return res.json({ success: true, payload: purchases });
  } catch (error) {
    console.error("[escrow] getMyPurchases error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch purchases." });
  }
}
