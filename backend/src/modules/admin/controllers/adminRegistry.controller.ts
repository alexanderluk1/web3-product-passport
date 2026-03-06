import { Request, Response } from "express";
import { adminRegistryService } from "../services/adminRegistry.service";

export async function getRegistryStatusHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
    }

    const adminWalletAddress = req.user.walletAddress;

    const result = await adminRegistryService.getRegistryStatus(adminWalletAddress);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to retrieve registry status",
    });
  }
}