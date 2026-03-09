import { IssuerProduct } from "../../../modules/passport/types/passport.types";

const FULLNODE_URL =
  process.env.APTOS_FULLNODE_URL || "https://fullnode.devnet.aptoslabs.com/v1";

const MODULE_ADDRESS = (
  process.env.MODULE_ADDRESS ||
  process.env.LUXPASS_MODULE_ADDRESS ||
  ""
).trim();
const PASSPORT_MODULE_NAME = process.env.PASSPORT_MODULE_NAME || "passport";
const MINT_FUNCTION_NAME = process.env.PASSPORT_MINT_FUNCTION || "mint";

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function bytesLikeToString(value: unknown): string {
  if (Array.isArray(value)) {
    return String.fromCharCode(...value.map((n) => Number(n)));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const arr = Object.keys(record)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => Number(record[k]));
    return String.fromCharCode(...arr);
  }

  return String(value ?? "");
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return Boolean(value);
}

function toEpochMs(timestamp?: string): number | undefined {
  if (!timestamp) {
    return undefined;
  }

  const numeric = Number(timestamp);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  // Aptos typically returns microseconds; normalize to milliseconds.
  if (numeric >= 1e18) {
    return Math.floor(numeric / 1_000_000);
  }
  if (numeric >= 1e15) {
    return Math.floor(numeric / 1_000);
  }

  // seconds precision fallback
  if (numeric < 1e12) {
    return Math.floor(numeric * 1_000);
  }

  // already in milliseconds
  return Math.floor(numeric);
}

function isMintPayloadFunction(functionId?: string): boolean {
  if (!functionId) {
    return false;
  }

  return (
    functionId.toLowerCase() ===
    `${MODULE_ADDRESS}::${PASSPORT_MODULE_NAME}::${MINT_FUNCTION_NAME}`.toLowerCase()
  );
}

type AptosUserTransaction = {
  type: string;
  version: string;
  hash: string;
  success: boolean;
  timestamp?: string;
  payload?: {
    function?: string;
    arguments?: unknown[];
    function_arguments?: unknown[];
  };
};

export async function getIssuerMintedProducts(
  issuerAddress: string
): Promise<IssuerProduct[]> {
  if (!MODULE_ADDRESS) {
    throw new Error("MODULE_ADDRESS is not configured for minted-products reader.");
  }

  const normalizedIssuer = normalizeAddress(issuerAddress);

  const response = await fetch(
    `${FULLNODE_URL}/accounts/${normalizedIssuer}/transactions?limit=100`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch issuer transactions from Aptos: ${response.status}`);
  }

  const transactions = (await response.json()) as AptosUserTransaction[];

  const products: IssuerProduct[] = [];

  for (const tx of transactions) {
    if (!tx.success || tx.type !== "user_transaction") {
      continue;
    }

    if (!isMintPayloadFunction(tx.payload?.function)) {
      continue;
    }

    const args = tx.payload?.arguments ?? tx.payload?.function_arguments ?? [];

    if (args.length < 6) {
      continue;
    }

    const [
      registryAddressArg,
      ownerAddressArg,
      serialPlainArg,
      metadataUriArg,
      _metadataBytesArg,
      transferableArg,
    ] = args;

    products.push({
      transactionVersion: tx.version,
      transactionHash: tx.hash,
      issuerAddress: normalizedIssuer,
      registryAddress: normalizeAddress(String(registryAddressArg)),
      ownerAddress: normalizeAddress(String(ownerAddressArg)),
      serialNumber: bytesLikeToString(serialPlainArg),
      metadataUri: String(metadataUriArg),
      transferable: parseBoolean(transferableArg),
      mintedAt: toEpochMs(tx.timestamp),
    });
  }

  // newest first
  products.sort((a, b) => Number(b.transactionVersion) - Number(a.transactionVersion));

  return products;
}
