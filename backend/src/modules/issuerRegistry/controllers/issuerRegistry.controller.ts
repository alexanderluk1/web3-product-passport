import { Request, Response } from "express";
import { issuerRegistryService } from "../services/issuerRegistry.service";

export async function registerIssuerHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
    }

    const { issuerAddress } = req.body;
    const adminWalletAddress = req.user.walletAddress;

    const result = await issuerRegistryService.registerIssuer(
      adminWalletAddress,
      issuerAddress
    );

    if (!result.success) {
      const statusCode =
        result.error === "Registry is not initialized."
          ? 400
          : result.error === "Authenticated admin wallet does not match backend signer wallet."
          ? 403
          : 500;

      return res.status(statusCode).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to register issuer.",
    });
  }
}