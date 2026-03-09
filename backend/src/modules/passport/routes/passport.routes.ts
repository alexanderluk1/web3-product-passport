import { Router } from "express";
import { createRequire } from "node:module";
import { getPassportHandler, prepareMintPassportHandler } from "../controllers/passport.controller";
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

passportRouter.get("/:passportObjectAddr", getPassportHandler);
passportRouter.post("/mint/prepare",
    requireAuth,
    requireRole("ISSUER", "ADMIN"),
    upload.single("image"),
    prepareMintPassportHandler
);
