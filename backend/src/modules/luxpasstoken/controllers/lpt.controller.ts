import type { Request, Response } from "express";
import { lptService } from "../services/lpt.service";
import type {
  CompleteAptPurchaseBody,
  PrepareAllocateBody,
  PrepareAmountBody,
  PrepareAptPurchaseBody,
  PrepareClaimReferralBody,
  PrepareCreditFiatBody,
  PrepareMintBody,
  PreparePayFeeBody,
  PrepareTransferBody,
} from "../types/lpt.types";

function handleError(res: Response, error: unknown, fallbackMessage: string) {
  return res.status(400).json({
    success: false,
    error: error instanceof Error ? error.message : fallbackMessage,
  });
}

export async function getStatusHandler(_req: Request, res: Response) {
  try {
    const { initialised, adminAddress } = await lptService.getStatus();
    return res.status(200).json({ initialised, adminAddress });
  } catch (error) {
    return res.status(500).json({
      initialised: false,
      adminAddress: null as string | null,
      error: error instanceof Error ? error.message : "Failed to read token status.",
    });
  }
}

export function getAptPurchaseRateHandler(_req: Request, res: Response) {
  try {
    const rate = lptService.getAptPurchaseRate();
    return res.status(200).json({ success: true, ...rate });
  } catch (error) {
    return handleError(res, error, "Failed to read APT purchase rate.");
  }
}

export async function prepareInitHandler(req: Request, res: Response) {
  try {
    const body = req.body as { signupRewardAmount?: unknown; referralRewardAmount?: unknown };
    const payload = lptService.prepareInit(body.signupRewardAmount, body.referralRewardAmount);
    return res.status(200).json({ success: true, payload });
  } catch (error) {
    return handleError(res, error, "Failed to prepare init payload.");
  }
}

export async function prepareMintHandler(req: Request, res: Response) {
  try {
    const body = req.body as PrepareMintBody;
    const payload = await lptService.prepareMint(body.recipientAddress, body.amount);
    return res.status(200).json({ success: true, payload });
  } catch (error) {
    return handleError(res, error, "Failed to prepare mint payload.");
  }
}

export async function prepareTransferHandler(req: Request, res: Response) {
  try {
    const body = req.body as PrepareTransferBody;
    const payload = await lptService.prepareTransfer(body.recipientAddress, body.amount);
    return res.status(200).json({ success: true, payload });
  } catch (error) {
    return handleError(res, error, "Failed to prepare transfer payload.");
  }
}

export async function prepareBurnHandler(req: Request, res: Response) {
  try {
    const body = req.body as PrepareAmountBody;
    const payload = await lptService.prepareBurn(body.amount);
    return res.status(200).json({ success: true, payload });
  } catch (error) {
    return handleError(res, error, "Failed to prepare burn payload.");
  }
}

export async function prepareClaimSignupHandler(_req: Request, res: Response) {
  try {
    const payload = await lptService.prepareClaimSignup();
    return res.status(200).json({ success: true, payload });
  } catch (error) {
    return handleError(res, error, "Failed to prepare claim signup payload.");
  }
}

export async function prepareClaimReferralHandler(req: Request, res: Response) {
  try {
    const body = req.body as PrepareClaimReferralBody;
    const payload = await lptService.prepareClaimReferral(body.referrerAddress);
    return res.status(200).json({ success: true, payload });
  } catch (error) {
    return handleError(res, error, "Failed to prepare claim referral payload.");
  }
}

export async function prepareCreditFiatHandler(req: Request, res: Response) {
  try {
    const body = req.body as PrepareCreditFiatBody;
    const payload = await lptService.prepareCreditFiat(body.buyerAddress, body.amount);
    return res.status(200).json({ success: true, payload });
  } catch (error) {
    return handleError(res, error, "Failed to prepare credit fiat payload.");
  }
}

export async function prepareAptPurchaseHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized.",
      });
    }

    const body = req.body as PrepareAptPurchaseBody;
    const result = await lptService.prepareAptPurchase(
      req.user.walletAddress,
      body.lptAmount
    );

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error, "Failed to prepare APT purchase payload.");
  }
}

export async function completeAptPurchaseHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized.",
      });
    }

    const body = req.body as CompleteAptPurchaseBody;
    const result = await lptService.completeAptPurchase(
      req.user.walletAddress,
      body.lptAmount,
      body.paymentTransactionHash
    );

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error, "Failed to complete APT purchase.");
  }
}

export async function prepareDepositHandler(req: Request, res: Response) {
  try {
    const body = req.body as PrepareAmountBody;
    const payload = await lptService.prepareDeposit(body.amount);
    return res.status(200).json({ success: true, payload });
  } catch (error) {
    return handleError(res, error, "Failed to prepare deposit payload.");
  }
}

export async function prepareAllocateHandler(req: Request, res: Response) {
  try {
    const body = req.body as PrepareAllocateBody;
    const payload = await lptService.prepareAllocate(body.recipientAddress, body.amount);
    return res.status(200).json({ success: true, payload });
  } catch (error) {
    return handleError(res, error, "Failed to prepare allocate payload.");
  }
}

export async function preparePayFeeHandler(req: Request, res: Response) {
  try {
    const body = req.body as PreparePayFeeBody;
    const payload = await lptService.preparePayFee(body.treasuryAddress, body.amount);
    return res.status(200).json({ success: true, payload });
  } catch (error) {
    return handleError(res, error, "Failed to prepare pay fee payload.");
  }
}

export async function prepareBurnForServiceHandler(req: Request, res: Response) {
  try {
    const body = req.body as PrepareAmountBody;
    const payload = await lptService.prepareBurnForService(body.amount);
    return res.status(200).json({ success: true, payload });
  } catch (error) {
    return handleError(res, error, "Failed to prepare burn for service payload.");
  }
}

export async function getBalanceHandler(req: Request, res: Response) {
  try {
    const ownerAddress = req.params.ownerAddress;
    const result = await lptService.getBalance(ownerAddress);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error, "Failed to fetch balance.");
  }
}

export async function getSupplyHandler(_req: Request, res: Response) {
  try {
    const result = await lptService.getSupply();
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error, "Failed to fetch total supply.");
  }
}

export async function getPoolHandler(_req: Request, res: Response) {
  try {
    const result = await lptService.getPool();
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error, "Failed to fetch subsidy pool.");
  }
}

export async function getAdminHandler(_req: Request, res: Response) {
  try {
    const result = await lptService.getAdmin();
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error, "Failed to fetch admin.");
  }
}

export async function getRewardConfigHandler(_req: Request, res: Response) {
  try {
    const result = await lptService.getRewardConfig();
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error, "Failed to fetch reward config.");
  }
}

export async function getSignupClaimedHandler(req: Request, res: Response) {
  try {
    const ownerAddress = req.params.ownerAddress;
    const result = await lptService.getSignupClaimed(ownerAddress);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error, "Failed to fetch signup reward status.");
  }
}

export async function getLptEventFeedHandler(req: Request, res: Response) {
  try {
    const wallet = req.user?.walletAddress;
    if (!wallet) {
      return res.status(401).json({ success: false, error: "Wallet address is missing from the session." });
    }
    const result = await lptService.getLptEventFeed({
      limit: req.query.limit,
      perSource: req.query.perSource,
      viewerWalletAddress: wallet,
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error, "Failed to fetch LPT event feed.");
  }
}
