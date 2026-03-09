import { Router } from "express";
import { createRequire } from "node:module";
import {
  getOwnedPassportsHandler,
  getIssuerProductsHandler,
  getPassportByProductIdHandler,
  getPassportHandler,
  prepareMintPassportHandler,
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
passportRouter.get("/products",
    requireAuth,
    requireRole("ISSUER", "ADMIN"),
    getIssuerProductsHandler
);
passportRouter.get("/owned",
    requireAuth,
    getOwnedPassportsHandler
);
passportRouter.get("/by-product/:productId", getPassportByProductIdHandler);
passportRouter.get("/:passportObjectAddr", getPassportHandler);
