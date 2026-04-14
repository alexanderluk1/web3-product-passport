import { type Request, type Response, Router } from "express";
import { requireAuth } from "../../auth/middleware/requireAuth";
import { requireRole } from "../../auth/middleware/requireRole";
import {
  getStatusHandler,
  prepareInitHandler,
  prepareMintHandler,
  prepareTransferHandler,
  prepareBurnHandler,
  prepareClaimSignupHandler,
  prepareClaimReferralHandler,
  prepareCreditFiatHandler,
  prepareAptPurchaseHandler,
  completeAptPurchaseHandler,
  prepareDepositHandler,
  prepareAllocateHandler,
  preparePayFeeHandler,
  prepareBurnForServiceHandler,
  getBalanceHandler,
  getSupplyHandler,
  getPoolHandler,
  getAdminHandler,
  getRewardConfigHandler,
  getSignupClaimedHandler,
} from "../controllers/lpt.controller";
import { simulateLptHandler } from "../controllers/lpt.simcontrollers";

export const lptRouter = Router();

lptRouter.get("/", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "luxpass-token-api",
    routes: [
      "GET /api/tokens (this list)",
      "GET /api/tokens/status",
      "GET /api/tokens/balance/:ownerAddress",
      "GET /api/tokens/supply",
      "GET /api/tokens/pool",
      "GET /api/tokens/admin",
      "GET /api/tokens/reward-config",
      "GET /api/tokens/signup-claimed/:ownerAddress",
      "POST /api/tokens/init/prepare",
      "POST /api/tokens/mint/prepare",
      "POST /api/tokens/transfer/prepare",
      "POST /api/tokens/burn/prepare",
      "POST /api/tokens/claim-signup/prepare",
      "POST /api/tokens/claim-referral/prepare",
      "POST /api/tokens/credit-fiat/prepare",
      "POST /api/tokens/purchase-apt/prepare",
      "POST /api/tokens/purchase-apt/complete",
      "POST /api/tokens/deposit/prepare",
      "POST /api/tokens/allocate/prepare",
      "POST /api/tokens/pay-fee/prepare",
      "POST /api/tokens/burn-for-service/prepare",
      "POST /api/tokens/simulate",
    ],
  });
});

lptRouter.get("/status", getStatusHandler);

lptRouter.post("/init/prepare", requireAuth, requireRole("ADMIN"), prepareInitHandler);
lptRouter.post("/mint/prepare", requireAuth, requireRole("ADMIN"), prepareMintHandler);
lptRouter.post("/transfer/prepare", requireAuth, prepareTransferHandler);
lptRouter.post("/burn/prepare", requireAuth, prepareBurnHandler);
lptRouter.post("/claim-signup/prepare", requireAuth, prepareClaimSignupHandler);
lptRouter.post("/claim-referral/prepare", requireAuth, prepareClaimReferralHandler);
lptRouter.post("/credit-fiat/prepare", requireAuth, requireRole("ADMIN"), prepareCreditFiatHandler);
lptRouter.post("/purchase-apt/prepare", requireAuth, prepareAptPurchaseHandler);
lptRouter.post("/purchase-apt/complete", requireAuth, completeAptPurchaseHandler);
lptRouter.post("/deposit/prepare", requireAuth, prepareDepositHandler);
lptRouter.post("/allocate/prepare", requireAuth, requireRole("ADMIN"), prepareAllocateHandler);
lptRouter.post("/pay-fee/prepare", requireAuth, preparePayFeeHandler);
lptRouter.post("/burn-for-service/prepare", requireAuth, prepareBurnForServiceHandler);

lptRouter.post("/simulate", requireAuth, simulateLptHandler);

lptRouter.get("/balance/:ownerAddress", requireAuth, getBalanceHandler);
lptRouter.get("/supply", requireAuth, getSupplyHandler);
lptRouter.get("/pool", requireAuth, getPoolHandler);
lptRouter.get("/admin", requireAuth, getAdminHandler);
lptRouter.get("/reward-config", requireAuth, getRewardConfigHandler);
lptRouter.get("/signup-claimed/:ownerAddress", requireAuth, getSignupClaimedHandler);

export default lptRouter;
