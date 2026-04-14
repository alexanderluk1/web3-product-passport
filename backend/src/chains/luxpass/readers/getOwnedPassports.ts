import { IssuerProduct, PassportHistoryEntry } from "../../../modules/passport/types/passport.types";
import { MODULE_ADDRESS, REGISTRY_ADDRESS, STATUS_ACTIVE, STATUS_LISTING, STATUS_RETURNING, STATUS_REVOKED, STATUS_STORING, STATUS_SUSPENDED, STATUS_VERIFYING } from "../constants";

const FULLNODE_URL =
  process.env.APTOS_FULLNODE_URL || "https://fullnode.devnet.aptoslabs.com/v1";

const PASSPORT_MODULE_NAME = process.env.PASSPORT_MODULE_NAME || "passport";
const MINT_FUNCTION_NAMES = (
  process.env.PASSPORT_MINT_FUNCTIONS ||
  process.env.PASSPORT_MINT_FUNCTION ||
  "mint,mint_with_burn,mint_with_burn_lpt"
)
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const MINT_FUNCTION_NAME = process.env.PASSPORT_MINT_FUNCTION || "mint";
const MINTLIST_FUNCTION_NAME = process.env.PASSPORT_MINT_FUNCTION || "mint_listing";

type MintedEvent = {
  version?: string;
  transaction_version?: string;
  data?: {
    issuer?: string;
    owner?: string;
    passport?: string;
  };
};

type MintListedEvent = {
  version?: string;
  transaction_version?: string;
  data?: {
    passport?: string;
    issuer?: string;
    owner?: string;
    old_address?: string;
  };
}

export const PassportStatus = {
  ACTIVE: STATUS_ACTIVE,
  SUSPENDED: STATUS_SUSPENDED,
  REVOKED: STATUS_REVOKED,
  STORING: STATUS_STORING,
  VERIFYING: STATUS_VERIFYING,
  LISTING: STATUS_LISTING,
  RETURNING: STATUS_RETURNING,
} as const;

export type PassportStatusValue = (typeof PassportStatus)[keyof typeof PassportStatus];

function eventVersion(event: { version?: string; transaction_version?: string }): string {
  return String(event.version ?? event.transaction_version ?? "").trim();
}

// ----------------------
// Passport history entry types
// ----------------------

export type PassportEventKind =
  | "minted"
  | "mint_listed"
  | "transferred"
  | "status_changed"
  | "metadata_updated";

type ObjectCoreResource = {
  data?: {
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
    `${MODULE_ADDRESS}::${PASSPORT_MODULE_NAME}::${MINT_FUNCTION_NAME}`.toLowerCase() ||
    functionId.toLowerCase() ===
    `${MODULE_ADDRESS}::${PASSPORT_MODULE_NAME}::${MINTLIST_FUNCTION_NAME}`.toLowerCase()
  );
}

async function fetchTransactionByVersion(version: string): Promise<AptosUserTransaction | null> {
  const response = await fetch(`${FULLNODE_URL}/transactions/by_version/${version}`);

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as AptosUserTransaction;
}

async function fetchCurrentObjectOwner(objectAddress: string): Promise<string | null> {
  const response = await fetch(
    `${FULLNODE_URL}/accounts/${normalizeAddress(objectAddress)}/resource/0x1::object::ObjectCore`
  );

  if (!response.ok) {
    return null;
  }

  const resource = (await response.json()) as ObjectCoreResource;
  const owner = resource.data?.owner;
  if (!owner) {
    return null;
  }

  return normalizeAddress(String(owner));
}

async function fetchEvents<T>(eventField: string, limit: number): Promise<T[]> {
  if (!REGISTRY_ADDRESS) {
    throw new Error("REGISTRY_ADDRESS is not configured.");
  }
  const structTag = `${MODULE_ADDRESS}::${PASSPORT_MODULE_NAME}::PassportEvents`;
  const url = `${FULLNODE_URL}/accounts/${normalizeAddress(
    REGISTRY_ADDRESS
  )}/events/${structTag}/${eventField}?limit=${limit}`;
 
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${eventField} events from Aptos: ${response.status}`
    );
  }
  return (await response.json()) as T[];
}

export async function getOwnedPassports(
  ownerAddress: string,
  limit = 200
): Promise<IssuerProduct[]> {
  if (!MODULE_ADDRESS) {
    throw new Error(
      "MODULE_ADDRESS is not configured for owned-passports reader."
    );
  }
 
  if (!REGISTRY_ADDRESS) {
    throw new Error(
      "REGISTRY_ADDRESS is not configured for owned-passports reader."
    );
  }
 
  const normalizedOwner = normalizeAddress(ownerAddress);
 
  // --- 1. Fetch minted events ---
  const mintedEvents = await fetchEvents<MintedEvent>("minted", limit);
 
  // --- 2. Fetch mint_list events ---
  const mintListedEvents = await fetchEvents<MintListedEvent>("mint_list", limit);
 
  // --- 3. Combine all candidate passport addresses from both mint sources ---
  type CandidateSource =
    | { source: "minted"; event: MintedEvent }
    | { source: "mint_listed"; event: MintListedEvent };
 
  const candidates: CandidateSource[] = [
    ...mintedEvents.map(
      (e): CandidateSource => ({ source: "minted", event: e })
    ),
    ...mintListedEvents.map(
      (e): CandidateSource => ({ source: "mint_listed", event: e })
    ),
  ];
 
  // --- 4. Filter to passports currently owned by the requested address ---
  const ownershipChecks = await Promise.all(
    candidates.map(async (candidate) => {
      const passportObjectAddr = String(
        candidate.event.data?.passport ?? ""
      ).trim();
      if (!passportObjectAddr) return null;
 
      const currentOwner = await fetchCurrentObjectOwner(passportObjectAddr);
      if (!currentOwner || currentOwner !== normalizedOwner) return null;
 
      return { candidate, passportObjectAddr: normalizeAddress(passportObjectAddr), currentOwner };
    })
  );
 
  const matched = ownershipChecks.filter(
    (
      entry
    ): entry is {
      candidate: CandidateSource;
      passportObjectAddr: string;
      currentOwner: string;
    } => entry !== null
  );
 
  // --- 5. Fetch mint transactions ---
  const txs = await Promise.all(
    matched.map(({ candidate }) => {
      const version = eventVersion(candidate.event);
      return version ? fetchTransactionByVersion(version) : Promise.resolve(null);
    })
  );
 
  // --- 6. Assemble IssuerProduct records ---
  const products: IssuerProduct[] = [];
  const ownedPassportAddrs = new Set<string>();
 
  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i];
    const entry = matched[i];
    if (!entry || !tx || !tx.success || tx.type !== "user_transaction") continue;
    if (!isMintPayloadFunction(tx.payload?.function)) continue;
 
    const args =
      tx.payload?.arguments ?? tx.payload?.function_arguments ?? [];
 
    const { candidate, passportObjectAddr, currentOwner } = entry;
 
    if (candidate.source === "minted") {
      // mint(issuer, registry_addr, owner, serial_plain, metadata_uri, metadata_bytes, transferable)
      // args: [registryAddr, ownerAddr, serialPlain, metadataUri, metadataBytes, transferable]
      if (args.length < 6) continue;
 
      const [
        registryAddressArg,
        _ownerAddressArg,
        serialPlainArg,
        metadataUriArg,
        _metadataBytesArg,
        transferableArg,
      ] = args;

      products.push({
        passportObjectAddr,
        transactionVersion: tx.version,
        transactionHash: tx.hash,
        issuerAddress: normalizeAddress(String(tx.sender ?? "")),
        registryAddress: normalizeAddress(String(registryAddressArg)),
        ownerAddress: currentOwner,
        serialNumber: bytesLikeToString(serialPlainArg),
        metadataUri: String(metadataUriArg),
        transferable: parseBoolean(transferableArg),
        mintedAt: toEpochMs(tx.timestamp),
      });
    } else {
      // mint_listing(admin, registry_addr, owner, serial_plain, metadata_uri, metadata_bytes, placeholder_address)
      // args: [registryAddr, ownerAddr, serialPlain, metadataUri, metadataBytes, placeholderAddress]
      if (args.length < 6) continue;
 
      const [
        registryAddressArg,
        _ownerAddressArg,
        serialPlainArg,
        metadataUriArg,
        _metadataBytesArg,
        placeholderAddressArg,
      ] = args;

      products.push({
        passportObjectAddr,
        transactionVersion: tx.version,
        transactionHash: tx.hash,
        issuerAddress: normalizeAddress(String(tx.sender ?? "")),
        registryAddress: normalizeAddress(String(registryAddressArg)),
        ownerAddress: currentOwner,
        serialNumber: bytesLikeToString(serialPlainArg),
        metadataUri: String(metadataUriArg),
        transferable: true,
        mintedAt: toEpochMs(tx.timestamp),
      });
    }

    ownedPassportAddrs.add(passportObjectAddr);
  }

  products.sort(
    (a, b) =>
      Number(b.transactionVersion) - Number(a.transactionVersion)
  );

  return products;
}
