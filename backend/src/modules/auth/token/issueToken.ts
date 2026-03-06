import jwt from "jsonwebtoken";
import { AuthUser, LoginResponse } from "../types/auth.types";

const JWT_SECRET = process.env.JWT_SECRET || "replace-this-in-env";
const JWT_EXPIRES_IN_SECONDS = 60 * 60;

export async function issueToken(user: AuthUser): Promise<LoginResponse> {
  const accessToken = jwt.sign(
    {
      sub: user.id,
      walletAddress: user.walletAddress,
      role: user.role,
    },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN_SECONDS,
    }
  );

  return {
    accessToken,
    expiresIn: JWT_EXPIRES_IN_SECONDS,
    user: {
      id: user.id,
      walletAddress: user.walletAddress,
      role: user.role,
    },
  };
}