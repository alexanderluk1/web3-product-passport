import { Router } from "express";
import {
  getAllIssuersHandler,
  registerIssuerHandler,
} from "../controllers/issuerRegistry.controller";
import { requireAuth } from "../../auth/middleware/requireAuth";
import { requireRole } from "../../auth/middleware/requireRole";

const router = Router();

router.get(
  "/issuers",
  requireAuth,
  requireRole("ADMIN"),
  getAllIssuersHandler
);

router.post(
  "/issuers/register",
  requireAuth,
  requireRole("ADMIN"),
  registerIssuerHandler
);

router.post(
  "/issuers",
  requireAuth,
  requireRole("ADMIN"),
  registerIssuerHandler
);

export default router;
