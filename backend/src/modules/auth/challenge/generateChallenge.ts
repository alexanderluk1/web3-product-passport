import crypto from "node:crypto";
import { GenerateChallengeResponse, LoginChallenge } from "../types/auth.types";
import { deleteExpiredChallenges, saveChallenge } from "../stores/challengeStore";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function normalizeWalletAddress(walletAddress: string): string {
  return walletAddress.trim().toLowerCase();
}

function validateWalletAddress(walletAddress: string): void {
  if (!walletAddress || typeof walletAddress !== "string") {
    throw new Error("Wallet address is required.");
  }

  if (!/^0x[a-fA-F0-9]+$/.test(walletAddress.trim())) {
    throw new Error("Invalid wallet address format.");
  }
}

function buildChallengeMessage(walletAddress: string, nonce: string, expiresAt: number): string {
  return [
    "Sign this message to log in to LuxPass.",
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `ExpiresAt: ${new Date(expiresAt).toISOString()}`,
  ].join("\n");
}

export async function generateChallenge(
  walletAddress: string
): Promise<GenerateChallengeResponse> {
  validateWalletAddress(walletAddress);
  deleteExpiredChallenges();

  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  const challengeId = crypto.randomUUID();
  const nonce = crypto.randomBytes(16).toString("hex");
  const now = Date.now();
  const expiresAt = now + CHALLENGE_TTL_MS;

  const message = buildChallengeMessage(normalizedWalletAddress, nonce, expiresAt);

  const challenge: LoginChallenge = {
    id: challengeId,
    walletAddress: normalizedWalletAddress,
    nonce,
    message,
    createdAt: now,
    expiresAt,
    used: false,
  };

  saveChallenge(challenge);

  return {
    challengeId,
    message,
    expiresAt,
  };
}