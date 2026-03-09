import type { Request, Response, NextFunction } from "express";
import { passportService } from "../services/passport.service";
import { resolvePassportObjAddrByProductId } from "../../../chains/luxpass/readers";
import { PrepareMintPassportRequestBody } from "../types/passport.types";

export async function prepareMintPassportHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const result = await passportService.prepareMintPassport({
      issuerWalletAddress: req.user.walletAddress,
      body: req.body as PrepareMintPassportRequestBody,
      imageFile: req.file
    });

    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({
      success: false,
    error: error instanceof Error ? error.message : "Failed to prepare mint passport payload"
    })
  };
}

export async function getPassportHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const passportObjectAddr = req.params.passportObjectAddr;
    const data = await passportService.getPassport(passportObjectAddr);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

// GET /api/passports/by-product/:productId
export async function getPassportByProductId(req, res, next) {
  try {
    const productId = req.params.productId; // "serial-124"
    const passportObjectAddr = await resolvePassportObjAddrByProductId(aptos, productId);
    res.json({ ok: true, passportObjectAddr });
  } catch (e) {
    next(e);
  }
}