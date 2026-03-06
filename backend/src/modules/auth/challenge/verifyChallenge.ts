import { getChallengeById } from "../stores/challengeStore";
import { LoginChallenge } from "../types/auth.types";

function normalizeWalletAddress(walletAddress: string): string {
  return walletAddress.trim().toLowerCase();
}

export async function verifyChallenge(
  walletAddress: string,
  challengeId: string
): Promise<LoginChallenge> {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  const challenge = getChallengeById(challengeId);

  if (!challenge) {
    throw new Error("Challenge not found.");
  }

  if (challenge.walletAddress !== normalizedWalletAddress) {
    throw new Error("Challenge does not belong to this wallet.");
  }

  if (challenge.used) {
    throw new Error("Challenge has already been used.");
  }

  if (challenge.expiresAt <= Date.now()) {
    throw new Error("Challenge has expired.");
  }

  return challenge;
}