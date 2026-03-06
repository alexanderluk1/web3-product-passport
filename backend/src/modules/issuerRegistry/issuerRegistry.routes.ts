import { Router } from "express";
import { registerIssuerHandler } from "../issuerRegistry/controllers/issuerRegistry.controller";
import { requireAuth } from "../auth/middleware/requireAuth";
import { requireRole } from "../auth/middleware/requireRole";

const router = Router();

router.post(
  "/issuers",
  requireAuth,
  requireRole("ADMIN"),
  registerIssuerHandler
);

export default router;