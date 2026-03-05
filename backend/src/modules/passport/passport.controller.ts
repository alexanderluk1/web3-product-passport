import type { Request, Response, NextFunction } from "express";
import { passportService } from "./passport.service";

export async function getPassportHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const passportObjectAddr = req.params.passportObjectAddr;
    const data = await passportService.getPassport(passportObjectAddr);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}