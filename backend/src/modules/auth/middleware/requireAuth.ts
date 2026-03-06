import { NextFunction, Request, Response } from "express";
import { verifyToken } from "../token/verifyToken";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        walletAddress: string;
        role: "USER" | "ISSUER" | "ADMIN";
      };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authorization token is required.",
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const decoded = await verifyToken(token);

    req.user = {
      id: decoded.sub,
      walletAddress: decoded.walletAddress,
      role: decoded.role,
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      message: error instanceof Error ? error.message : "Unauthorized.",
    });
  }
}