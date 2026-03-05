import { Router } from "express";
import { getPassportHandler } from "./passport.controller";

export const passportRouter = Router();

passportRouter.get("/:passportObjectAddr", getPassportHandler);