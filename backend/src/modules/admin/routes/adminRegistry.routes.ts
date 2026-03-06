import { Router } from "express";
import {
  getIssuersHandler,
  getRegistryStatusHandler,
  initRegistryHandler,
} from "../controllers/adminRegistry.controller";
import { requireAuth } from "../../auth/middleware/requireAuth";
import { requireRole } from "../../auth/middleware/requireRole";

const router = Router();

router.get(
  "/registry/status",
  requireAuth,
  requireRole("ADMIN"),
  getRegistryStatusHandler
);

router.post(
  "/registry/init",
  requireAuth,
  requireRole("ADMIN"),
  initRegistryHandler
);

router.get(
  "/issuers",
  requireAuth,
  requireRole("ADMIN"),
  getIssuersHandler
);

export default router;
