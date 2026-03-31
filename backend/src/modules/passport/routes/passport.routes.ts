import { Router } from "express";
import { createRequire } from "node:module";
import {
  getOwnedPassportsHandler,
  getPassportProvenanceByProductIdHandler,
  getIssuerProductsHandler,
  getPassportByProductIdHandler,
  getPassportHandler,
  prepareMintPassportHandler,
  prepareTransferPassportHandler,
  recordTransferPassportHandler,
  prepareSetStatusHandler,
  recordSetStatusHandler,
  prepareUpdateMetadataHandler,
  recordUpdateMetadataHandler,
  prepareListPassportHandler,
  recordListPassportHandler,
  requestDelistHandler,
  prepareSellPassportHandler,
  recordSellPassportHandler,
  prepareConfirmReceiptHandler,
  recordConfirmReceiptHandler,
} from "../controllers/passport.controller";
import { requireAuth } from "../../auth/middleware/requireAuth";
import { requireRole } from "../../auth/middleware/requireRole";

export const passportRouter = Router();
const require = createRequire(import.meta.url);
const multer = require("multer") as typeof import("multer");

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
passportRouter.post("/transfer/prepare",
    requireAuth,
    prepareTransferPassportHandler
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

// Marketplace routes
passportRouter.post("/status/prepare",
    requireAuth,
    requireRole("ADMIN","ISSUER"),
    prepareSetStatusHandler
)

passportRouter.post("/status/record",
    requireAuth,
    recordSetStatusHandler
);

passportRouter.post("/metadata/prepare",
    requireAuth,
    requireRole("ADMIN","ISSUER"),
    upload.single("image"),
    prepareUpdateMetadataHandler
);

passportRouter.post("/metadata/record",
    requireAuth,
    recordUpdateMetadataHandler
);

passportRouter.post("/list/prepare",
    requireAuth,
    prepareListPassportHandler
);

passportRouter.post("/list/record",
    requireAuth,
    recordListPassportHandler
);

passportRouter.post("/delist/request",
    requireAuth,
    requestDelistHandler
);

passportRouter.post("/sell/prepare",
    requireAuth,
    prepareSellPassportHandler
);

passportRouter.post("/sell/record",
    requireAuth,
    recordSellPassportHandler
);

passportRouter.post("/receipt/prepare",
    requireAuth,
    prepareConfirmReceiptHandler
);

passportRouter.post("/receipt/record",
    requireAuth,
    recordConfirmReceiptHandler
);