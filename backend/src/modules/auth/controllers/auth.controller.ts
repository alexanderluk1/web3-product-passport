import { Request, Response } from "express";
import { authService } from "../services/auth.service";

export async function generateChallengeHandler(req: Request, res: Response) {
  try {
    const { walletAddress } = req.body;

    const result = await authService.generateChallenge(walletAddress);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : "Failed to generate challenge.",
    });
  }
}

export async function loginHandler(req: Request, res: Response) {
  try {
    const { walletAddress, challengeId, signature } = req.body;

    const result = await authService.login({
      walletAddress,
      challengeId,
      signature,
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(401).json({
      message: error instanceof Error ? error.message : "Login failed.",
    });
  }
}

export async function meHandler(req: Request, res: Response) {
  try {
    return res.status(200).json({
      user: req.user,
    });
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to fetch current user.",
    });
  }
}