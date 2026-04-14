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
  prepareSetStatusHandler,
  recordSetStatusHandler,
  prepareUpdateMetadataHandler,
  recordUpdateMetadataHandler,
  prepareListPassportHandler,
  recordListPassportHandler,
  requestDelistHandler,
  prepareConfirmReceiptHandler,
  recordConfirmReceiptHandler,
  approveDelistHandler,
  requestListingNoPassport,
  receiveNoPassportHandler,
  receivePassportHandler,
  verifyPassportHandler,
  prepareMintListPassportHandler,
  recordMintListPassportHandler,
  getListingByPassportAddressHandler,
  getListingByStatusHandler,
  getDelistingByPassportAddressHandler,
  getDelistingsByStatusHandler
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

passportRouter.post("/list/passport-prepare",
    requireAuth,
    prepareListPassportHandler
);

passportRouter.post("/list/passport-record",
    requireAuth,
    recordListPassportHandler
);

passportRouter.post("/list/no-passport-record",
    requireAuth,
    requestListingNoPassport
);

passportRouter.post("/receive/no-passport",
    requireAuth,
    requireRole("ADMIN"),
    receiveNoPassportHandler
)

passportRouter.post("/receive/passport",
    requireAuth,
    requireRole("ADMIN"),
    receivePassportHandler
)

// to Do verify no passport route: return new mint passport payload
// Then after that is recorded in database, , generate set status payload to listed (might create a new mint for buyer service)
// The set status record will handle the final database update for this
passportRouter.post("/verify/no-passport",
    requireAuth,
    requireRole("ADMIN"),
    upload.single("image"),
    prepareMintListPassportHandler
)

passportRouter.post("/verify/no-passport-record",
    requireAuth,
    recordMintListPassportHandler
)

passportRouter.post("/verify/passport",
    requireAuth,
    requireRole("ADMIN"),
    verifyPassportHandler
)

passportRouter.post("/delist/request",
    requireAuth,
    requestDelistHandler
);

passportRouter.post("/delist/approve",
    requireAuth,
    requireRole("ADMIN"),
    approveDelistHandler
)

passportRouter.post("/receipt/prepare",
    requireAuth,
    prepareConfirmReceiptHandler
);

passportRouter.post("/receipt/record",
    requireAuth,
    recordConfirmReceiptHandler
);

passportRouter.get("/listings/address/:passportObjectAddress", getListingByPassportAddressHandler);
passportRouter.get("/listings/status/:status", getListingByStatusHandler);

// De-listings
passportRouter.get("/de-listings/address/:passportObjectAddress", getDelistingByPassportAddressHandler);
passportRouter.get("/de-listings/status/:status", getDelistingsByStatusHandler);