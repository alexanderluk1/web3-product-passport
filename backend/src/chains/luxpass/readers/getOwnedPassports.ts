import { IssuerProduct } from "../../../modules/passport/types/passport.types";
import { MODULE_ADDRESS, REGISTRY_ADDRESS } from "../constants";

const FULLNODE_URL =
  process.env.APTOS_FULLNODE_URL || "https://fullnode.devnet.aptoslabs.com/v1";

const PASSPORT_MODULE_NAME = process.env.PASSPORT_MODULE_NAME || "passport";
const MINT_FUNCTION_NAME = process.env.PASSPORT_MINT_FUNCTION || "mint";

type MintedEvent = {
  version?: string;
  transaction_version?: string;
  data?: {
    issuer?: string;
    owner?: string;
  };
};

type AptosUserTransaction = {
  type: string;
  version: string;
  hash: string;
  success: boolean;
  timestamp?: string;
  sender?: string;
  payload?: {
    function?: string;
    arguments?: unknown[];
    function_arguments?: unknown[];
  };
};

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

  if (numeric >= 1e18) {
    return Math.floor(numeric / 1_000_000);
  }
  if (numeric >= 1e15) {
    return Math.floor(numeric / 1_000);
  }
  if (numeric < 1e12) {
    return Math.floor(numeric * 1_000);
  }

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

async function fetchTransactionByVersion(version: string): Promise<AptosUserTransaction | null> {
  const response = await fetch(`${FULLNODE_URL}/transactions/by_version/${version}`);

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as AptosUserTransaction;
}

export async function getOwnedPassports(
  ownerAddress: string,
  limit = 200
): Promise<IssuerProduct[]> {
  if (!MODULE_ADDRESS) {
    throw new Error("MODULE_ADDRESS is not configured for owned-passports reader.");
  }

  if (!REGISTRY_ADDRESS) {
    throw new Error("REGISTRY_ADDRESS is not configured for owned-passports reader.");
  }

  const normalizedOwner = normalizeAddress(ownerAddress);
  const eventsStructTag = `${MODULE_ADDRESS}::${PASSPORT_MODULE_NAME}::PassportEvents`;

  const eventsResponse = await fetch(
    `${FULLNODE_URL}/accounts/${normalizeAddress(
      REGISTRY_ADDRESS
    )}/events/${eventsStructTag}/minted?limit=${limit}`
  );

  if (!eventsResponse.ok) {
    throw new Error(
      `Failed to fetch passport minted events from Aptos: ${eventsResponse.status}`
    );
  }

  const allEvents = (await eventsResponse.json()) as MintedEvent[];
  const ownerEvents = allEvents.filter(
    (event) => normalizeAddress(String(event.data?.owner ?? "")) === normalizedOwner
  );

  const txVersions = ownerEvents
    .map((event) => String(event.version ?? event.transaction_version ?? "").trim())
    .filter((version) => version.length > 0);

  const txs = await Promise.all(txVersions.map((version) => fetchTransactionByVersion(version)));

  const products: IssuerProduct[] = [];

  for (const tx of txs) {
    if (!tx || !tx.success || tx.type !== "user_transaction") {
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
      issuerAddress: normalizeAddress(String(tx.sender ?? "")),
      registryAddress: normalizeAddress(String(registryAddressArg)),
      ownerAddress: normalizeAddress(String(ownerAddressArg)),
      serialNumber: bytesLikeToString(serialPlainArg),
      metadataUri: String(metadataUriArg),
      transferable: parseBoolean(transferableArg),
      mintedAt: toEpochMs(tx.timestamp),
    });
  }

  products.sort((a, b) => Number(b.transactionVersion) - Number(a.transactionVersion));

  return products;
}
