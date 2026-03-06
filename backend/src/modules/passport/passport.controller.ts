import type { Request, Response, NextFunction } from "express";
import { passportService } from "./passport.service";
import { resolvePassportObjAddrByProductId } from "../../chains/luxpass/readers";

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