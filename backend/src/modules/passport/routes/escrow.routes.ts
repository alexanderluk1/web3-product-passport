import { Router } from "express";
import { requireAuth } from "../../auth/middleware/requireAuth";
import {
  getMarketplaceHandler,
  getEscrowListingHandler,
  prepareEscrowListingHandler,
  recordEscrowListingHandler,
  preparePurchaseHandler,
  recordPurchaseHandler,
  prepareCancelListingHandler,
  recordCancelListingHandler,
  updatePriceHandler,
  requestDeliveryHandler,
  getMyPurchasesHandler,
} from "../controllers/escrow.controller";

export const escrowRouter = Router();

// Public: marketplace browse
escrowRouter.get("/marketplace", getMarketplaceHandler);
escrowRouter.get("/listing/:passportObjectAddress", getEscrowListingHandler);

// Seller: create escrow listing (set price + transfer to escrow)
escrowRouter.post("/listing/prepare", requireAuth, prepareEscrowListingHandler);
escrowRouter.post("/listing/record", requireAuth, recordEscrowListingHandler);

// Seller: update price
escrowRouter.post("/price/update", requireAuth, updatePriceHandler);

// Buyer: purchase
escrowRouter.post("/purchase/prepare", requireAuth, preparePurchaseHandler);
escrowRouter.post("/purchase/record", requireAuth, recordPurchaseHandler);

// Seller: cancel listing
escrowRouter.post("/cancel/prepare", requireAuth, prepareCancelListingHandler);
escrowRouter.post("/cancel/record", requireAuth, recordCancelListingHandler);

// Buyer: request physical delivery
escrowRouter.post("/delivery/request", requireAuth, requestDeliveryHandler);

// Buyer: view my purchases
escrowRouter.get("/purchases/mine", requireAuth, getMyPurchasesHandler);
