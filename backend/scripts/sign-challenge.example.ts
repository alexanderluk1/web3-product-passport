/**
 * Template — copy to sign-challenge.ts (gitignored) and fill TEST_PRIVATE_KEY + CHALLENGE_MESSAGE.
 * First time: npm run sign:setup
 *
 * 1. POST /auth/challenge with walletAddress = printed "derived" address from npm run sign.
 * 2. Paste response "message" into CHALLENGE_MESSAGE.
 * 3. npm run sign → copy inner JSON string into POST /auth/login "signature".
 */
import "dotenv/config";
import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";

/** Paste test private key here (hex, with or without 0x). Used first; ignores .env if non-empty. */
const TEST_PRIVATE_KEY = "";

// --- Paste the exact "message" from /auth/challenge (full string, all lines). ---
const CHALLENGE_MESSAGE = `
Sign this message to log in to LuxPass.
Wallet: 0x...
Nonce: ...
ExpiresAt: ...
`.trim();

function main(): void {
  const keyHex =
    TEST_PRIVATE_KEY.trim() ||
    process.env.SIGN_PRIVATE_KEY?.trim() ||
    process.env.ADMIN_PRIVATE_KEY?.trim();
  if (!keyHex) {
    console.error(
      "Set TEST_PRIVATE_KEY in this file, or SIGN_PRIVATE_KEY / ADMIN_PRIVATE_KEY in .env."
    );
    process.exit(1);
  }

  if (!CHALLENGE_MESSAGE || CHALLENGE_MESSAGE.includes("0x...")) {
    console.error(
      "Set CHALLENGE_MESSAGE to the full \"message\" from /auth/challenge (replace placeholder)."
    );
    process.exit(1);
  }

  const privateKey = new Ed25519PrivateKey(keyHex);
  const account = Account.fromPrivateKey({ privateKey });
  const derivedAddress = account.accountAddress.toStringLong().toLowerCase();

  const walletLine = CHALLENGE_MESSAGE.match(/Wallet:\s*(0x[a-fA-F0-9]+)/i);
  const messageWallet = walletLine?.[1]?.toLowerCase();
  if (messageWallet && messageWallet !== derivedAddress) {
    console.error(
      "[sign] Wallet mismatch — usual cause of \"Invalid signature\".\n\n" +
        `  Message says Wallet: ${messageWallet}\n` +
        `  key derives account:     ${derivedAddress}\n\n` +
        "POST /auth/challenge with:\n" +
        `  { "walletAddress": "${derivedAddress}" }\n` +
        "Then paste the new \"message\" into CHALLENGE_MESSAGE and run again.\n"
    );
    process.exit(1);
  }

  console.log("[sign] Account for this key (use in /auth/challenge):", derivedAddress);
  console.log("[sign] Use challengeId from the SAME response as this message.\n");

  const signature = account.sign(CHALLENGE_MESSAGE);

  const payload = {
    publicKey: account.publicKey.toString(),
    signature: signature.toString(),
    message: CHALLENGE_MESSAGE,
  };

  console.log("Payload (object):\n");
  console.log(JSON.stringify(payload, null, 2));
  console.log("\n--- POST /auth/login body field \"signature\" (string value) ---\n");
  console.log(JSON.stringify(JSON.stringify(payload)));
  console.log();
}

main();
