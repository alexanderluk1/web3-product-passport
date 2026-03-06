import {
  AccountAddress,
  AnyPublicKey,
  Ed25519PublicKey,
  Ed25519Signature,
  Secp256k1PublicKey,
  Secp256k1Signature,
} from "@aptos-labs/ts-sdk";
import { LoginChallenge } from "../types/auth.types";

type VerifySignatureParams = {
  walletAddress: string;
  signature: string;
  challenge: LoginChallenge;
};

function normalizeWalletAddress(walletAddress: string): string {
  return AccountAddress.from(walletAddress).toStringLong().toLowerCase();
}

function getString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

type ParsedSignaturePayload = {
  publicKey: string;
  signatureHex: string;
  signatureType: string;
  signedMessage?: string;
  signedFullMessage?: string;
  claimedAddress?: string;
};

function parseSignaturePayload(rawSignature: string): ParsedSignaturePayload | null {
  let payload: unknown;

  try {
    payload = JSON.parse(rawSignature);
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const payloadObject = payload as Record<string, unknown>;
  const nestedSignature =
    payloadObject.signature && typeof payloadObject.signature === "object"
      ? (payloadObject.signature as Record<string, unknown>)
      : undefined;

  const publicKey = getString(
    payloadObject.publicKey ??
      payloadObject.public_key ??
      nestedSignature?.publicKey ??
      nestedSignature?.public_key
  );

  const signatureHex = getString(
    (typeof payloadObject.signature === "string" ? payloadObject.signature : undefined) ??
      nestedSignature?.signature ??
      nestedSignature?.sig
  );

  if (!publicKey || !signatureHex) {
    return null;
  }

  return {
    publicKey,
    signatureHex,
    signatureType:
      getString(
        payloadObject.type ??
          payloadObject.signatureType ??
          nestedSignature?.type ??
          nestedSignature?.signatureType
      )?.toLowerCase() ?? "ed25519_signature",
    signedMessage: getString(payloadObject.message),
    signedFullMessage: getString(payloadObject.fullMessage ?? payloadObject.full_message),
    claimedAddress: getString(
      payloadObject.address ?? payloadObject.accountAddress ?? payloadObject.account_address
    ),
  };
}

function normalizeDerivedAddress(address: AccountAddress): string {
  return address.toStringLong().toLowerCase();
}

function verifyEd25519Signature(params: {
  normalizedWalletAddress: string;
  publicKeyHex: string;
  signatureHex: string;
  messagesToVerify: string[];
}): boolean {
  const publicKey = new Ed25519PublicKey(params.publicKeyHex);
  const signature = new Ed25519Signature(params.signatureHex);
  const legacyAddress = normalizeDerivedAddress(publicKey.authKey().derivedAddress());
  const singleKeyAddress = normalizeDerivedAddress(new AnyPublicKey(publicKey).authKey().derivedAddress());

  if (
    params.normalizedWalletAddress !== legacyAddress &&
    params.normalizedWalletAddress !== singleKeyAddress
  ) {
    return false;
  }

  return params.messagesToVerify.some((message) =>
    publicKey.verifySignature({
      message,
      signature,
    })
  );
}

function verifySecp256k1Signature(params: {
  normalizedWalletAddress: string;
  publicKeyHex: string;
  signatureHex: string;
  messagesToVerify: string[];
}): boolean {
  const publicKey = new Secp256k1PublicKey(params.publicKeyHex);
  const signature = new Secp256k1Signature(params.signatureHex);
  const signerAddress = normalizeDerivedAddress(new AnyPublicKey(publicKey).authKey().derivedAddress());

  if (params.normalizedWalletAddress !== signerAddress) {
    return false;
  }

  return params.messagesToVerify.some((message) =>
    publicKey.verifySignature({
      message,
      signature,
    })
  );
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

  const parsedPayload = parseSignaturePayload(signature);
  if (!parsedPayload) {
    return false;
  }

  if (parsedPayload.claimedAddress) {
    const normalizedClaimedAddress = normalizeWalletAddress(parsedPayload.claimedAddress);
    if (normalizedClaimedAddress !== normalizedWalletAddress) {
      return false;
    }
  }

  if (parsedPayload.signedMessage && parsedPayload.signedMessage !== challenge.message) {
    return false;
  }

  if (parsedPayload.signedFullMessage && !parsedPayload.signedFullMessage.includes(challenge.message)) {
    return false;
  }

  const messagesToVerify = [
    parsedPayload.signedFullMessage,
    parsedPayload.signedMessage,
    challenge.message,
  ].filter((message): message is string => Boolean(message));

  try {
    if (parsedPayload.signatureType.includes("secp256k1")) {
      return verifySecp256k1Signature({
        normalizedWalletAddress,
        publicKeyHex: parsedPayload.publicKey,
        signatureHex: parsedPayload.signatureHex,
        messagesToVerify,
      });
    }

    return verifyEd25519Signature({
      normalizedWalletAddress,
      publicKeyHex: parsedPayload.publicKey,
      signatureHex: parsedPayload.signatureHex,
      messagesToVerify,
    });
  } catch {
    return false;
  }
}
