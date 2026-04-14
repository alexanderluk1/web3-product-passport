import { Router } from "express";
import * as multerModule from "multer";
import {
  getOwnedPassportsHandler,
  getPassportProvenanceByProductIdHandler,
  getIssuerProductsHandler,
  getPassportByProductIdHandler,
  getPassportHandler,
  prepareMintPassportHandler,
  prepareMintPassportWithBurnHandler,
  prepareMintPassportWithBurnLptHandler,
  prepareTransferPassportHandler,
  prepareTransferPassportWithBurnHandler,
  prepareTransferPassportWithBurnLptHandler,
  recordTransferPassportHandler,
} from "../controllers/passport.controller";
import { requireAuth } from "../../auth/middleware/requireAuth";
import { requireRole } from "../../auth/middleware/requireRole";

export const passportRouter = Router();

const multer = (
  ((multerModule as unknown as { default?: unknown }).default ??
    multerModule) as unknown as typeof import("multer")
);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
});

passportRouter.post("/mint/prepare",
    requireAuth,
    requireRole("ISSUER", "ADMIN"),
    upload.single("image"),
    prepareMintPassportHandler
);
passportRouter.post("/mint-with-burn/prepare",
    requireAuth,
    requireRole("ISSUER", "ADMIN"),
    upload.single("image"),
    prepareMintPassportWithBurnHandler
);
passportRouter.post("/mint-with-burn-lpt/prepare",
    requireAuth,
    requireRole("ISSUER", "ADMIN"),
    upload.single("image"),
    prepareMintPassportWithBurnLptHandler
);
passportRouter.post("/transfer/prepare",
    requireAuth,
    prepareTransferPassportHandler
);
passportRouter.post("/transfer-with-burn/prepare",
    requireAuth,
    prepareTransferPassportWithBurnHandler
);
passportRouter.post("/transfer-with-burn-lpt/prepare",
    requireAuth,
    prepareTransferPassportWithBurnLptHandler
);
passportRouter.post("/transfer/record",
    requireAuth,
    recordTransferPassportHandler
);
passportRouter.get("/products",
    requireAuth,
    requireRole("ISSUER", "ADMIN"),
    getIssuerProductsHandler
);
passportRouter.get("/owned",
    requireAuth,
    getOwnedPassportsHandler
);
passportRouter.get("/by-product/:productId/provenance", getPassportProvenanceByProductIdHandler);
passportRouter.get("/by-product/:productId", getPassportByProductIdHandler);
passportRouter.get("/:passportObjectAddr", getPassportHandler);
