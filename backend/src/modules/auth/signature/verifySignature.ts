import { LoginChallenge } from "../types/auth.types";

type VerifySignatureParams = {
  walletAddress: string;
  signature: string;
  challenge: LoginChallenge;
};

function normalizeWalletAddress(walletAddress: string): string {
  return walletAddress.trim().toLowerCase();
}

export async function verifySignature({
  walletAddress,
  signature,
  challenge,
}: VerifySignatureParams): Promise<boolean> {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);

  if (!normalizedWalletAddress) {
    throw new Error("Wallet address is required.");
  }

  if (!signature) {
    throw new Error("Signature is required.");
  }

  if (!challenge?.message) {
    throw new Error("Challenge message is missing.");
  }

  /**
   * TODO:
   * Replace this with real Aptos signature verification.
   *
   * The exact implementation depends on:
   * - which Aptos wallet you use on the frontend
   * - how the frontend signs the message
   * - what signature payload shape is returned
   *
   * This placeholder only checks that the signature is non-empty.
   */
  const looksValid = typeof signature === "string" && signature.trim().length > 10;

  if (!looksValid) {
    return false;
  }

  return true;
}