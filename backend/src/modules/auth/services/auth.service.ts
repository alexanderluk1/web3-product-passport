import crypto from "crypto";
import { markChallengeUsed } from "../stores/challengeStore";
import {
  AuthUser,
  GenerateChallengeResponse,
  LoginResponse,
  UserRole,
} from "../types/auth.types";
import { generateChallenge } from "../challenge/generateChallenge";
import { verifyChallenge } from "../challenge/verifyChallenge";
import { verifySignature } from "../signature/verifySignature";
import { issueToken } from "../token/issueToken";

const userStore = new Map<string, AuthUser>();

function normalizeWalletAddress(walletAddress: string): string {
  return walletAddress.trim().toLowerCase();
}

function determineRole(walletAddress: string): UserRole {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);

  const adminWallets = new Set<string>([
    "0xadminwalletreplace",
  ]);

  const issuerWallets = new Set<string>([
    "0xissuerwalletreplace",
  ]);

  if (adminWallets.has(normalizedWalletAddress)) {
    return "ADMIN";
  }

  if (issuerWallets.has(normalizedWalletAddress)) {
    return "ISSUER";
  }

  return "USER";
}

function findOrCreateUser(walletAddress: string): AuthUser {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  const existingUser = userStore.get(normalizedWalletAddress);

  if (existingUser) {
    existingUser.lastLoginAt = Date.now();
    userStore.set(normalizedWalletAddress, existingUser);
    return existingUser;
  }

  const now = Date.now();

  const newUser: AuthUser = {
    id: crypto.randomUUID(),
    walletAddress: normalizedWalletAddress,
    role: determineRole(normalizedWalletAddress),
    createdAt: now,
    lastLoginAt: now,
  };

  userStore.set(normalizedWalletAddress, newUser);

  return newUser;
}

export const authService = {
  async generateChallenge(walletAddress: string): Promise<GenerateChallengeResponse> {
    return generateChallenge(walletAddress);
  },

  async login(params: {
    walletAddress: string;
    challengeId: string;
    signature: string;
  }): Promise<LoginResponse> {
    const { walletAddress, challengeId, signature } = params;

    const challenge = await verifyChallenge(walletAddress, challengeId);

    const isValidSignature = await verifySignature({
      walletAddress,
      signature,
      challenge,
    });

    if (!isValidSignature) {
      throw new Error("Invalid signature.");
    }

    markChallengeUsed(challengeId);

    const user = findOrCreateUser(walletAddress);

    return issueToken(user);
  },
};