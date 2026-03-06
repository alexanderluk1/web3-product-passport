import { Router } from "express";
import {
  generateChallengeHandler,
  loginHandler,
  meHandler,
} from "../controllers/auth.controller";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

router.post("/challenge", generateChallengeHandler);
router.post("/login", loginHandler);
router.get("/me", requireAuth, meHandler);

export default router;