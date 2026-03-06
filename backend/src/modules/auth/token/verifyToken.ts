import jwt from "jsonwebtoken";
import { JwtPayload } from "../types/auth.types";

const JWT_SECRET = process.env.JWT_SECRET || "replace-this-in-env";

export async function verifyToken(token: string): Promise<JwtPayload> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch {
    throw new Error("Invalid or expired token.");
  }
}