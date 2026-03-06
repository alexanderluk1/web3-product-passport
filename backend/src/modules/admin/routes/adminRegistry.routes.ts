import { Router } from "express";
import { getRegistryStatusHandler } from "../controllers/adminRegistry.controller";
import { requireAuth } from "../../auth/middleware/requireAuth";
import { requireRole } from "../../auth/middleware/requireRole";

const router = Router();

router.get(
  "/registry/status",
  requireAuth,
  requireRole("ADMIN"),
  getRegistryStatusHandler
);

export default router;