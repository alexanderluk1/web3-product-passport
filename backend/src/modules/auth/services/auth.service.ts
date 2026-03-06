import { generateLoginChallenge } from "../../auth/challenge/generateChallenge";
import { verifyStoredChallenge } from "../../auth/challenge/verifyChallenge";
import { verifyWalletSignature } from "../../auth/signature/verifySignature";
import { issueJwtToken } from "../../auth/token/issueToken";
import { findOrCreateUserByWallet } from "../../users/findOrCreateUserByWallet";

export const authService = {
  async generateChallenge(walletAddress: string) {
    return generateLoginChallenge(walletAddress);
  },

  async verifyChallenge(walletAddress: string, challengeId: string) {
    return verifyStoredChallenge(walletAddress, challengeId);
  },

  async verifySignature(params: {
    walletAddress: string;
    challengeId: string;
    signature: string;
  }) {
    return verifyWalletSignature(params);
  },

  async issueToken(walletAddress: string) {
    const user = await findOrCreateUserByWallet(walletAddress);
    return issueJwtToken(user);
  },
};