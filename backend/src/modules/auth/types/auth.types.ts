export type UserRole = "USER" | "ISSUER" | "ADMIN";

export type AuthUser = {
  id: string;
  walletAddress: string;
  role: UserRole;
  createdAt: number;
  lastLoginAt: number;
};

export type LoginChallenge = {
  id: string;
  walletAddress: string;
  nonce: string;
  message: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
};

export type GenerateChallengeRequest = {
  walletAddress: string;
};

export type GenerateChallengeResponse = {
  challengeId: string;
  message: string;
  expiresAt: number;
};

export type LoginRequest = {
  walletAddress: string;
  challengeId: string;
  signature: string;
};

export type LoginResponse = {
  accessToken: string;
  expiresIn: number;
  user: {
    id: string;
    walletAddress: string;
    role: UserRole;
  };
};

export type JwtPayload = {
  sub: string;
  walletAddress: string;
  role: UserRole;
  iat?: number;
  exp?: number;
};