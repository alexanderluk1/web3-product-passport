import {
  PassportMetadata,
  PreparedMintPayload,
  PreparedTransferPayload,
  PreparedUpdateMetadataPayload,
  PreparedMintListPayload,
} from "../types/passport.types";
import { normalizeAddress } from "../../../utils/walletHelper";
import { validateRequiredString } from "../../../utils/processHelper";
import { makeAptosClient } from "../../../config/aptos";
import { resolvePassportObjAddrByProductId } from "../../../chains/luxpass/readers";
import {
  REGISTRY_ADDRESS,
  PASSPORT_TRANSFER_FN,
  PASSPORT_UPDATE_METADATA_FN,
  PASSPORT_MINTLIST_FN,
  STATUS_ACTIVE,
  STATUS_SUSPENDED,
  STATUS_REVOKED,
  STATUS_STORING,
  STATUS_VERIFYING,
  STATUS_LISTING,
  STATUS_RETURNING,
} from "../../../chains/luxpass/constants";
import { initRegistry as writeInitRegistry } from "../../../chains/luxpass/writers/initRegistry";

const aptos = makeAptosClient();

const MODULE_ADDRESS = process.env.MODULE_ADDRESS!;
const PASSPORT_MODULE_NAME = "passport";
const PASSPORT_MINT_FUNCTION = "mint";
const PASSPORT_INIT_PROBE_PRODUCT_ID = "__luxpass_passport_init_probe__";
const PRODUCT_CACHE_TTL_MS = 60 * 1000;

export const NORMALIZED_REGISTRY = normalizeAddress(REGISTRY_ADDRESS);

type TxMeta = {
  hash?: string;
  sender?: string;
  timestampMs?: number;
};

export function hasMoveAbortCode(error: unknown, code: number): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes(`abort code: ${code}`) ||
    message.includes(`abort_code: ${code}`) ||
    message.includes(`code ${code}`)
  );
}

export function isIndexNotInitializedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("e_index_not_initialized") || hasMoveAbortCode(error, 3);
}

export function isProductNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("e_product_not_found") || hasMoveAbortCode(error, 21);
}

export async function ensurePassportInfrastructureInitialized(): Promise<void> {
  try {
    await resolvePassportObjAddrByProductId(aptos, PASSPORT_INIT_PROBE_PRODUCT_ID);
    return;
  } catch (error) {
    if (isProductNotFoundError(error)) {
      // Passport index exists; probe ID does not.
      return;
    }

    if (!isIndexNotInitializedError(error)) {
      throw error;
    }
  }

  const initResult = await writeInitRegistry(aptos);
  if (!initResult.success) {
    throw new Error(
      `Failed to initialize passport infrastructure. ${initResult.vmStatus ?? ""}`.trim()
    );
  }
}

export function buildPassportMetadata(params: {
  productName: string;
  brand: string;
  category: string;
  serialNumber: string;
  manufacturingDate: string;
  materials: string[];
  countryOfOrigin: string;
  description: string;
  imageIpfsUri: string;
}): PassportMetadata {
  const {
    productName,
    brand,
    category,
    serialNumber,
    manufacturingDate,
    materials,
    countryOfOrigin,
    description,
    imageIpfsUri,
  } = params;

  return {
    name: productName,
    description,
    image: imageIpfsUri,
    brand,
    category,
    serialNumber,
    manufacturingDate,
    materials,
    countryOfOrigin,
    attributes: [
      { trait_type: "Brand", value: brand },
      { trait_type: "Category", value: category },
      { trait_type: "Serial Number", value: serialNumber },
      { trait_type: "Manufacturing Date", value: manufacturingDate },
      { trait_type: "Country of Origin", value: countryOfOrigin },
      { trait_type: "Materials", value: materials.join(", ") },
    ],
  };
}

export function buildMintPayload(params: {
  registryAddress: string;
  ownerAddress: string;
  serialPlainBytes: number[];
  metadataIpfsUri: string;
  metadataBytes: number[];
  transferable: boolean;
}): PreparedMintPayload {
  const {
    registryAddress,
    ownerAddress,
    serialPlainBytes,
    metadataIpfsUri,
    metadataBytes,
    transferable,
  } = params;

  return {
    function: `${MODULE_ADDRESS}::${PASSPORT_MODULE_NAME}::${PASSPORT_MINT_FUNCTION}`,
    functionArguments: [
      registryAddress,
      ownerAddress,
      serialPlainBytes,
      metadataIpfsUri,
      metadataBytes,
      transferable,
    ],
  };
}

export function buildTransferPayload(params: {
  passportObjectAddress: string;
  newOwnerAddress: string;
  registryAddress: string;
}): PreparedTransferPayload {
  return {
    function: PASSPORT_TRANSFER_FN,
    functionArguments: [
      params.passportObjectAddress,
      params.newOwnerAddress,
      params.registryAddress,
    ],
  };
}

export function buildUpdateMetadataPayload(params: {
  passportObjectAddress: string;
  registryAddress: string;
  metadataIpfsUri: string;
  metadataBytes: number[];
}): PreparedUpdateMetadataPayload {
  return {
    function: PASSPORT_UPDATE_METADATA_FN,
    functionArguments: [
      params.passportObjectAddress,
      params.registryAddress,
      params.metadataIpfsUri,
      params.metadataBytes,
    ],
  };
}

export function buildMintListPayload(params: {
  registryAddress: string;
  ownerAddress: string;
  serialPlainBytes: number[];
  metadataIpfsUri: string;
  metadataBytes: number[];
  placeholderAddress: string;
}): PreparedMintListPayload {
  return {
    function: PASSPORT_MINTLIST_FN,
    functionArguments: [
      params.registryAddress,
      params.ownerAddress,
      params.serialPlainBytes,
      params.metadataIpfsUri,
      params.metadataBytes,
      params.placeholderAddress,
    ],
  };
}

export function isValidStatus(status: number): boolean {
  return [
    STATUS_ACTIVE,
    STATUS_SUSPENDED,
    STATUS_REVOKED,
    STATUS_STORING,
    STATUS_VERIFYING,
    STATUS_LISTING,
    STATUS_RETURNING,
  ].includes(status);
}

export function isMarketPlaceStatus(status: number): boolean {
  return [STATUS_STORING, STATUS_LISTING, STATUS_VERIFYING, STATUS_RETURNING].includes(status);
}

export function isCacheFresh(syncedAt: number): boolean {
  return Date.now() - syncedAt < PRODUCT_CACHE_TTL_MS;
}

export function parseTransferable(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
  }

  // Default behavior: transferable by default when omitted/invalid.
  return true;
}

export function toEpochMs(timestamp?: string): number | undefined {
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

export function getEventVersion(event: { version?: string; transaction_version?: string }): string {
  return String(event.version ?? event.transaction_version ?? "").trim();
}

export async function fetchTxMetaByVersion(version: string): Promise<TxMeta> {
  const FULLNODE_URL =
    process.env.APTOS_FULLNODE_URL || "https://fullnode.devnet.aptoslabs.com/v1";
  const response = await fetch(`${FULLNODE_URL}/transactions/by_version/${version}`);

  if (!response.ok) {
    return {};
  }

  const tx = (await response.json()) as {
    hash?: string;
    sender?: string;
    timestamp?: string;
  };

  return {
    hash: tx.hash,
    sender: tx.sender,
    timestampMs: toEpochMs(tx.timestamp),
  };
}

export function decodeProductIdInput(productId: string): string {
  const normalized = validateRequiredString(productId, "productId");

  if (/^0x[0-9a-fA-F]+$/.test(normalized) && normalized.length > 2) {
    const hex = normalized.slice(2);
    const padded = hex.length % 2 === 0 ? hex : `0${hex}`;

    try {
      const decoded = Buffer.from(padded, "hex").toString("utf8");
      if (decoded.trim()) {
        return decoded;
      }
    } catch {
      // fall back to raw input
    }
  }

  return normalized;
}

export function toUtf8Hex(value: string): string {
  return `0x${Buffer.from(value, "utf8").toString("hex")}`;
}

export function serializeMetadata(metadata: PassportMetadata): number[] {
  return Array.from(Buffer.from(JSON.stringify(metadata, null, 2), "utf8"));
}

export type AptosEvent = { type: string; data: Record<string, any> };
export type TxShape = {
  type: string;
  success: boolean;
  payload?: { function?: string };
  events?: AptosEvent[];
};
type TxValidationOk = { success: true; tx: TxShape };
type TxValidationFail = { success: false; error: string };

export async function validateRecordedTransaction(
  txHash: string,
  expectedFn: string | string[],
  mismatchErrorMessage?: string
): Promise<TxValidationOk | TxValidationFail> {
  if (!txHash || typeof txHash !== "string" || !txHash.startsWith("0x")) {
    return { success: false, error: "Invalid transaction hash." };
  }
  const APTOS_FULLNODE_URL =
    process.env.APTOS_FULLNODE_URL ?? "https://fullnode.devnet.aptoslabs.com/v1";
  const response = await fetch(`${APTOS_FULLNODE_URL}/transactions/by_hash/${txHash}`);
  if (!response.ok) {
    return { success: false, error: "Transaction not found on chain." };
  }
  const tx = (await response.json()) as TxShape;
  if (tx.type !== "user_transaction") {
    return { success: false, error: "Transaction is not a user transaction." };
  }
  if (!tx.success) {
    return { success: false, error: "Transaction did not succeed on chain." };
  }
  const fnName = tx.payload?.function?.toLowerCase() ?? "";
  const expectedFns = Array.isArray(expectedFn) ? expectedFn : [expectedFn];
  const matchesExpectedFn = expectedFns.some(
    (functionName) => fnName === functionName.toLowerCase()
  );
  if (!matchesExpectedFn) {
    return {
      success: false,
      error: mismatchErrorMessage ?? `Transaction is not a ${expectedFns.join(" or ")} transaction.`,
    };
  }
  return { success: true, tx };
}
