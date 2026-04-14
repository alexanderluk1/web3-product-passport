import { LPT_MODULE_ADDRESS } from "../constants";
import { resolveStateAddress } from "./shared";

const FULLNODE_URL =
  process.env.APTOS_FULLNODE_URL || "https://fullnode.devnet.aptoslabs.com/v1";

const TIMESTAMP_FETCH_CONCURRENCY = 12;

/** Stable tags for UI colouring. */
const LPT_EVENT_SOURCES = [
  { field: "mint_events", tag: "LPT_MINT" },
  { field: "burn_events", tag: "LPT_BURN" },
  { field: "transfer_events", tag: "LPT_TRANSFER" },
  { field: "signup_events", tag: "LPT_SIGNUP_REWARD" },
  { field: "referral_events", tag: "LPT_REFERRAL_REWARD" },
  { field: "fiat_events", tag: "LPT_FIAT_CREDIT" },
  { field: "fee_events", tag: "LPT_PLATFORM_FEE" },
  { field: "passport_burn_events", tag: "LPT_PASSPORT_SERVICE" },
  { field: "subsidy_events", tag: "LPT_SUBSIDY" },
] as const;

type AptosEventRow = {
  version?: string;
  sequence_number?: string;
  type?: string;
  data?: Record<string, unknown>;
  transaction_version?: string;
};

type AptosTxByVersion = {
  timestamp?: string;
};

export type LptEventFeedItem = {
  tag: string;
  source: string;
  version: string;
  sequenceNumber: string;
  eventType: string | null;
  data: Record<string, unknown>;
  transactionVersion: string | null;
  /** ISO 8601 UTC, from transaction `timestamp` (microseconds) when available. */
  occurredAt: string | null;
};

/** Match Aptos account hex regardless of leading-zero padding after 0x. */
function normalizeAptosAddress(address: string): string {
  const normalized = address.trim().toLowerCase();
  if (!normalized.startsWith("0x")) {
    return normalized;
  }

  const hex = normalized.slice(2).replace(/^0+/, "");
  return `0x${hex || "0"}`;
}

function dataAddr(data: Record<string, unknown>, key: string): string {
  const raw = data[key];
  if (raw === undefined || raw === null) {
    return "";
  }
  const s = String(raw).trim();
  if (!s) {
    return "";
  }
  return normalizeAptosAddress(s);
}

/**
 * True when the authenticated wallet appears in event payload as a party
 * (sender, recipient, payer, etc.).
 */
export function eventInvolvesWallet(item: LptEventFeedItem, viewerNorm: string): boolean {
  if (!viewerNorm) {
    return false;
  }

  const d = item.data;

  switch (item.tag) {
    case "LPT_MINT":
      return dataAddr(d, "recipient") === viewerNorm;
    case "LPT_BURN":
      return dataAddr(d, "account") === viewerNorm;
    case "LPT_TRANSFER":
      return dataAddr(d, "from") === viewerNorm || dataAddr(d, "to") === viewerNorm;
    case "LPT_SIGNUP_REWARD":
      return dataAddr(d, "user") === viewerNorm;
    case "LPT_REFERRAL_REWARD":
      return dataAddr(d, "referrer") === viewerNorm || dataAddr(d, "referee") === viewerNorm;
    case "LPT_FIAT_CREDIT":
      return dataAddr(d, "buyer") === viewerNorm;
    case "LPT_PLATFORM_FEE":
      return dataAddr(d, "payer") === viewerNorm || dataAddr(d, "treasury") === viewerNorm;
    case "LPT_PASSPORT_SERVICE":
      return dataAddr(d, "issuer") === viewerNorm;
    case "LPT_SUBSIDY":
      return dataAddr(d, "account") === viewerNorm;
    default:
      return false;
  }
}

function safeBigInt(value: string): bigint {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return 0n;
  }
  return BigInt(trimmed);
}

function parsePositiveInt(value: unknown, fallback: number, max: number): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return Math.min(Math.floor(n), max);
}

async function fetchHandleEvents(
  stateAddress: string,
  eventsStructTag: string,
  field: string,
  limit: number
): Promise<AptosEventRow[]> {
  const url = `${FULLNODE_URL}/accounts/${stateAddress}/events/${eventsStructTag}/${field}?limit=${limit}`;
  const response = await fetch(url);
  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch LPT events (${field}) from Aptos: ${response.status}`);
  }
  return (await response.json()) as AptosEventRow[];
}

function toFeedItem(
  row: AptosEventRow,
  tag: string,
  source: string
): LptEventFeedItem {
  return {
    tag,
    source,
    version: String(row.version ?? ""),
    sequenceNumber: String(row.sequence_number ?? ""),
    eventType: typeof row.type === "string" ? row.type : null,
    data: row.data && typeof row.data === "object" ? row.data : {},
    transactionVersion:
      row.transaction_version !== undefined ? String(row.transaction_version) : null,
    occurredAt: null,
  };
}

function ledgerVersionForTimestamp(item: LptEventFeedItem): string {
  const v = item.transactionVersion?.trim() || item.version.trim();
  return /^\d+$/.test(v) ? v : "";
}

function timestampUsToIsoUtc(micros: string): string | null {
  if (!/^\d+$/.test(micros)) {
    return null;
  }
  const ms = Number(BigInt(micros) / 1000n);
  if (!Number.isFinite(ms)) {
    return null;
  }
  return new Date(ms).toISOString();
}

async function fetchTransactionTimestampUs(version: string): Promise<string | null> {
  if (!/^\d+$/.test(version)) {
    return null;
  }
  const response = await fetch(`${FULLNODE_URL}/transactions/by_version/${version}`);
  if (!response.ok) {
    return null;
  }
  const json = (await response.json()) as AptosTxByVersion;
  const ts = json.timestamp;
  return typeof ts === "string" && /^\d+$/.test(ts) ? ts : null;
}

async function attachOccurredAt(items: LptEventFeedItem[]): Promise<void> {
  const versions = [...new Set(items.map(ledgerVersionForTimestamp).filter(Boolean))];
  const versionToMicros = new Map<string, string>();

  for (let i = 0; i < versions.length; i += TIMESTAMP_FETCH_CONCURRENCY) {
    const chunk = versions.slice(i, i + TIMESTAMP_FETCH_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (ver) => {
        const micros = await fetchTransactionTimestampUs(ver);
        return { ver, micros };
      })
    );
    for (const { ver, micros } of results) {
      if (micros) {
        versionToMicros.set(ver, micros);
      }
    }
  }

  for (const item of items) {
    const ver = ledgerVersionForTimestamp(item);
    const micros = ver ? versionToMicros.get(ver) : undefined;
    item.occurredAt = micros ? timestampUsToIsoUtc(micros) : null;
  }
}

/**
 * Pulls the latest events from each LPTState handle, merges by ledger version (newest first).
 * When `walletAddress` is set, only events where that address is a counterparty are returned.
 */
export async function viewLptEventFeed(options: {
  perSourceLimit: number;
  maxItems: number;
  /** If set, results are restricted to events involving this address (canonical 0x… hex). */
  walletAddress?: string | null;
}): Promise<LptEventFeedItem[]> {
  const stateAddress = resolveStateAddress();
  const eventsStructTag = `${LPT_MODULE_ADDRESS}::lux_pass_token::LPTState`;
  const { perSourceLimit, maxItems, walletAddress } = options;

  const viewerNorm = walletAddress ? normalizeAptosAddress(walletAddress) : "";
  const scoped = Boolean(viewerNorm);

  const effectivePerSource = scoped
    ? Math.min(500, Math.max(perSourceLimit, Math.min(500, maxItems * 8)))
    : perSourceLimit;

  const batches = await Promise.all(
    LPT_EVENT_SOURCES.map(async ({ field, tag }) => {
      const rows = await fetchHandleEvents(stateAddress, eventsStructTag, field, effectivePerSource);
      return rows.map((row) => toFeedItem(row, tag, field));
    })
  );

  const merged = batches.flat();
  merged.sort((a, b) => {
    const va = safeBigInt(a.version);
    const vb = safeBigInt(b.version);
    if (va === vb) {
      return 0;
    }
    return va > vb ? -1 : 1;
  });

  let result = merged;
  if (scoped) {
    result = merged.filter((item) => eventInvolvesWallet(item, viewerNorm));
  }

  result = result.slice(0, maxItems);
  await attachOccurredAt(result);
  return result;
}

export function resolveLptEventFeedLimits(query: {
  limit?: unknown;
  perSource?: unknown;
}): { perSourceLimit: number; maxItems: number } {
  const maxItems = parsePositiveInt(query.limit, 100, 500);
  const perSourceLimit = parsePositiveInt(query.perSource, Math.min(100, maxItems * 2), 500);
  return { perSourceLimit, maxItems };
}
