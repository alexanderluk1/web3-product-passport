import {
  GetPassportProvenanceResponse,
  GetOwnedPassportsResponse,
  GetProductByIdResponse,
  GetIssuerProductsResponse,
  PassportProvenanceEvent,
  PassportMetadata,
  PrepareMintPassportRequestBody,
  PrepareMintPassportResponse,
  PreparedMintPayload,
  PrepareTransferRequestBody,
  PrepareTransferResponse,
  PreparedTransferPayload,
  RecordTransferRequestBody,
  RecordTransferResponse,
  PrepareUpdateMetadataRequestBody,
  PrepareSetStatusRequestBody,
  PreparedSetStatusPayload,
  PrepareSetStatusResponse,
  RecordSetStatusRequestBody,
  PreparedUpdateMetadataPayload,
  PrepareUpdateMetadataResponse,
  RecordUpdateMetadataRequestBody,
  RecordUpdateMetadataResponse,
  PreparedListPassportPayload,
  PrepareListPassportRequestBody,
  PrepareListPassportResponse,
  RecordListPassportRequestBody,
  RecordListPassportResponse,
} from "../types/passport.types";
import { normalizeAddress, validateWalletAddress } from "../../../utils/walletHelper";
import {
  parseMaterials,
  validateImageFile,
  validateRequiredString,
} from "../../../utils/processHelper";
import { uploadImageToPinata, uploadMetadataToPinata } from "../../../utils/pinataHelper";
import { makeAptosClient } from "../../../config/aptos";
import {
  getPassport,
  getPassportOwner,
  resolvePassportObjAddrByProductId,
} from "../../../chains/luxpass/readers";
import { getIssuerMintedProducts } from "../../../chains/luxpass/readers/getIssuerMintedProducts";
import { getOwnedPassports as getOwnedPassportsFromChain } from "../../../chains/luxpass/readers/getOwnedPassports";
//import { REGISTRY_ADDRESS, PASSPORT_TRANSFER_FN, PASSPORT_SET_STATUS_FN, PASSPORT_UPDATE_METADATA_FN } from "../../../chains/luxpass/constants";
import {
  REGISTRY_ADDRESS,
  PASSPORT_SET_STATUS_FN,
  PASSPORT_UPDATE_METADATA_FN,
  PASSPORT_LIST_FN,
  STATUS_ACTIVE,
  STATUS_SUSPENDED,
  STATUS_REVOKED,
  STATUS_LISTING,
} from "../../../chains/luxpass/constants";
import { initRegistry as writeInitRegistry } from "../../../chains/luxpass/writers/initRegistry";
import {
  getIssuerProductsFromStore,
  saveIssuerProductsToStore,
  clearIssuerProductsFromStore,
} from "../store/productStore";

const aptos = makeAptosClient();
const FULLNODE_URL =
  process.env.APTOS_FULLNODE_URL || "https://fullnode.devnet.aptoslabs.com/v1";

const MODULE_ADDRESS = process.env.MODULE_ADDRESS!;
const PASSPORT_MODULE_NAME = "passport";
const PASSPORT_MINT_FUNCTION = "mint";
const PASSPORT_INIT_PROBE_PRODUCT_ID = "__luxpass_passport_init_probe__";
const PRODUCT_CACHE_TTL_MS = 60 * 1000;

type MintedEventRecord = {
  version?: string;
  transaction_version?: string;
  data?: {
    issuer?: string;
    owner?: string;
    passport?: string;
  };
};

type TransferEventRecord = {
  version?: string;
  transaction_version?: string;
  data?: {
    from?: string;
    to?: string;
    passport?: string;
    object?: string;
  };
};

type TxMeta = {
  hash?: string;
  sender?: string;
  timestampMs?: number;
};

function hasMoveAbortCode(error: unknown, code: number): boolean {
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

function isIndexNotInitializedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("e_index_not_initialized") || hasMoveAbortCode(error, 3);
}

function isProductNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("e_product_not_found") || hasMoveAbortCode(error, 21);
}

async function ensurePassportInfrastructureInitialized(): Promise<void> {
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

function buildPassportMetadata(params: {
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

function buildMintPayload(params: {
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

function buildTransferPayload(params: {
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

export function buildSetStatusPayload(params: {
  passportObjectAddress: string;
  newStatus: number;
}): PreparedSetStatusPayload {
  return {
    function: PASSPORT_SET_STATUS_FN,
    functionArguments: [
      params.passportObjectAddress,
      REGISTRY_ADDRESS,
      params.newStatus,
    ],
  };
}

export function buildUpdateMetadataPayload(params: {
  passportObjectAddress: string;
  metadataIpfsUri: string;
  metadataBytes: number[];
}): PreparedUpdateMetadataPayload {
  return {
    function: PASSPORT_UPDATE_METADATA_FN,
    functionArguments: [
      params.passportObjectAddress,
      REGISTRY_ADDRESS,
      params.metadataIpfsUri,
      params.metadataBytes,
    ],
  };
}

export function buildPassportListPayload(params: {
  passportObjectAddress: string;
}): PreparedListPassportPayload {
  return {
    function: PASSPORT_LIST_FN,
    functionArguments: [
      params.passportObjectAddress,
      REGISTRY_ADDRESS,
    ],
  };
}

function isValidStatus(status: number): boolean {
  return [STATUS_ACTIVE, STATUS_SUSPENDED, STATUS_REVOKED, STATUS_LISTING].includes(status);
}

function isCacheFresh(syncedAt: number): boolean {
  return Date.now() - syncedAt < PRODUCT_CACHE_TTL_MS;
}

function parseTransferable(value: unknown): boolean {
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

function getEventVersion(event: { version?: string; transaction_version?: string }): string {
  return String(event.version ?? event.transaction_version ?? "").trim();
}

async function fetchTxMetaByVersion(version: string): Promise<TxMeta> {
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

function decodeProductIdInput(productId: string): string {
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

function toUtf8Hex(value: string): string {
  return `0x${Buffer.from(value, "utf8").toString("hex")}`;
}

export const passportService = {
  async getPassport(passportObjectAddr: string) {
    return getPassport(aptos, passportObjectAddr);
  },

  async prepareMintPassport(params: {
    issuerWalletAddress: string;
    body: PrepareMintPassportRequestBody;
    imageFile?: Express.Multer.File;
  }): Promise<PrepareMintPassportResponse> {
    const { issuerWalletAddress, body, imageFile } = params;

    validateWalletAddress(issuerWalletAddress, "issuer wallet address");
    validateWalletAddress(body.ownerAddress, "owner address");
    validateImageFile(imageFile);

    const productName = validateRequiredString(body.productName, "productName");
    const brand = validateRequiredString(body.brand, "brand");
    const category = validateRequiredString(body.category, "category");
    const serialNumber = validateRequiredString(body.serialNumber, "serialNumber");
    const manufacturingDate = validateRequiredString(
      body.manufacturingDate,
      "manufacturingDate"
    );
    const countryOfOrigin = validateRequiredString(
      body.countryOfOrigin,
      "countryOfOrigin"
    );
    const description = validateRequiredString(body.description, "description");
    const materials = parseMaterials(body.materials);

    if (materials.length === 0) {
      throw new Error("At least one material is required.");
    }

    const normalizedOwnerAddress = normalizeAddress(body.ownerAddress);
    const normalizedRegistryAddress = normalizeAddress(REGISTRY_ADDRESS);
    const serialPlainBytes = Array.from(Buffer.from(serialNumber, "utf8"));
    const transferable = parseTransferable(body.transferable);

    // Ensure one-time on-chain passport resources exist before mint payload is used.
    await ensurePassportInfrastructureInitialized();

    const imageUpload = await uploadImageToPinata(imageFile);

    const metadata = buildPassportMetadata({
      productName,
      brand,
      category,
      serialNumber,
      manufacturingDate,
      materials,
      countryOfOrigin,
      description,
      imageIpfsUri: imageUpload.ipfsUri,
    });

    const metadataUpload = await uploadMetadataToPinata(metadata);
    // Keep hash bytes aligned with uploaded JSON payload formatting.
    const metadataJson = JSON.stringify(metadata, null, 2);
    const metadataBytes = Array.from(Buffer.from(metadataJson, "utf8"));

    const payload = buildMintPayload({
      registryAddress: normalizedRegistryAddress,
      ownerAddress: normalizedOwnerAddress,
      metadataIpfsUri: metadataUpload.ipfsUri,
      serialPlainBytes,
      metadataBytes,
      transferable,
    });

    return {
      success: true,
      imageCid: imageUpload.cid,
      imageIpfsUri: imageUpload.ipfsUri,
      metadataCid: metadataUpload.cid,
      metadataIpfsUri: metadataUpload.ipfsUri,
      metadata,
      payload,
    };
  },

  async getIssuerProducts(issuerWalletAddress: string): Promise<GetIssuerProductsResponse> {
    validateWalletAddress(issuerWalletAddress, "issuer wallet address");
    const normalizedIssuerAddress = normalizeAddress(issuerWalletAddress);

    const cached = getIssuerProductsFromStore(normalizedIssuerAddress);

    if (cached && cached.products.length > 0 && isCacheFresh(cached.syncedAt)) {
      return {
        source: "cache",
        syncedAt: cached.syncedAt,
        products: cached.products,
      };
    }

    const products = await getIssuerMintedProducts(normalizedIssuerAddress);
    const saved = saveIssuerProductsToStore(normalizedIssuerAddress, products);

    return {
      source: "chain",
      syncedAt: saved.syncedAt,
      products: saved.products,
    };
  },

  async getOwnedPassports(ownerWalletAddress: string): Promise<GetOwnedPassportsResponse> {
    validateWalletAddress(ownerWalletAddress, "owner wallet address");
    const normalizedOwnerAddress = normalizeAddress(ownerWalletAddress);
    const products = await getOwnedPassportsFromChain(normalizedOwnerAddress);

    return {
      source: "chain",
      syncedAt: Date.now(),
      products,
    };
  },

  async prepareTransferPassport(params: {
    callerWalletAddress: string;
    body: PrepareTransferRequestBody;
  }): Promise<PrepareTransferResponse> {
    const { callerWalletAddress, body } = params;

    validateWalletAddress(body.passportObjectAddress, "passport object address");
    validateWalletAddress(body.newOwnerAddress, "new owner address");

    const normalizedPassportAddr = normalizeAddress(body.passportObjectAddress);
    const normalizedNewOwner = normalizeAddress(body.newOwnerAddress);
    const normalizedCaller = normalizeAddress(callerWalletAddress);
    const normalizedRegistry = normalizeAddress(REGISTRY_ADDRESS);

    let passport: Awaited<ReturnType<typeof getPassport>>;
    try {
      passport = await getPassport(aptos, normalizedPassportAddr);
    } catch {
      return {
        success: false,
        error:
          "Invalid passportObjectAddress. Use the passport object's address (products[].passportObjectAddr), not a transaction hash.",
      };
    }

    if (!passport.transferable) {
      return { success: false, error: "This passport is not transferable." };
    }

    const onChainOwner = await getPassportOwner(normalizedPassportAddr);
    if (normalizeAddress(onChainOwner) !== normalizedCaller) {
      return { success: false, error: "You are not the owner of this passport." };
    }

    const payload = buildTransferPayload({
      passportObjectAddress: normalizedPassportAddr,
      newOwnerAddress: normalizedNewOwner,
      registryAddress: normalizedRegistry,
    });

    return { success: true, payload };
  },

  async recordTransferPassport(params: {
    body: RecordTransferRequestBody;
  }): Promise<RecordTransferResponse> {
    const { body } = params;

    if (!body.txHash || typeof body.txHash !== "string" || !body.txHash.startsWith("0x")) {
      return { success: false, error: "Invalid transaction hash." };
    }

    const response = await fetch(
      `${FULLNODE_URL}/transactions/by_hash/${body.txHash}`
    );

    if (!response.ok) {
      return { success: false, error: "Transaction not found on chain." };
    }

    const tx = (await response.json()) as {
      type: string;
      success: boolean;
      payload?: { function?: string };
    };

    if (tx.type !== "user_transaction") {
      return { success: false, error: "Transaction is not a user transaction." };
    }

    if (!tx.success) {
      return { success: false, error: "Transaction did not succeed on chain." };
    }

    const fnName = tx.payload?.function?.toLowerCase() ?? "";
    if (fnName !== PASSPORT_TRANSFER_FN.toLowerCase()) {
      return { success: false, error: "Transaction is not a transfer transaction." };
    }

    // Invalidate issuer product cache (best-effort)
    try {
      const passport = await getPassport(aptos, normalizeAddress(body.passportObjectAddress));
      clearIssuerProductsFromStore(passport.issuer);
    } catch {
      // best-effort
    }

    return { success: true, message: "Transfer recorded successfully." };
  },

  async getProductProvenance(productId: string): Promise<GetPassportProvenanceResponse> {
    const productIdPlain = decodeProductIdInput(productId);
    const productIdHex = toUtf8Hex(productIdPlain);
    const passportObjectAddr = normalizeAddress(
      await resolvePassportObjAddrByProductId(aptos, productIdPlain)
    );

    const mintedEventsResponse = await fetch(
      `${FULLNODE_URL}/accounts/${normalizeAddress(
        REGISTRY_ADDRESS
      )}/events/${MODULE_ADDRESS}::passport::PassportEvents/minted?limit=1000`
    );

    if (!mintedEventsResponse.ok) {
      throw new Error(
        `Failed to fetch mint events from Aptos: ${mintedEventsResponse.status}`
      );
    }

    const mintedEvents = (await mintedEventsResponse.json()) as MintedEventRecord[];
    const matchedMintEvent = mintedEvents.find(
      (event) =>
        normalizeAddress(String(event.data?.passport ?? "")) === passportObjectAddr
    );

    const transferEventsResponse = await fetch(
      `${FULLNODE_URL}/accounts/${normalizeAddress(
        REGISTRY_ADDRESS
      )}/events/${MODULE_ADDRESS}::passport::PassportEvents/transferred?limit=1000`
    );

    let transferEvents: TransferEventRecord[] = [];
    if (transferEventsResponse.ok) {
      transferEvents = (await transferEventsResponse.json()) as TransferEventRecord[];
    } else if (transferEventsResponse.status !== 404) {
      throw new Error(
        `Failed to fetch transfer events from Aptos: ${transferEventsResponse.status}`
      );
    }

    const matchedTransferEvents = transferEvents.filter((event) => {
      const passportFromEvent = normalizeAddress(
        String(event.data?.passport ?? event.data?.object ?? "")
      );
      return passportFromEvent === passportObjectAddr;
    });

    const versions = new Set<string>();

    if (matchedMintEvent) {
      const mintVersion = getEventVersion(matchedMintEvent);
      if (mintVersion) {
        versions.add(mintVersion);
      }
    }

    for (const event of matchedTransferEvents) {
      const version = getEventVersion(event);
      if (version) {
        versions.add(version);
      }
    }

    const txMetaByVersion = new Map<string, TxMeta>(
      await Promise.all(
        Array.from(versions).map(async (version): Promise<[string, TxMeta]> => {
          return [version, await fetchTxMetaByVersion(version)];
        })
      )
    );

    const events: PassportProvenanceEvent[] = [];

    if (matchedMintEvent) {
      const transactionVersion = getEventVersion(matchedMintEvent);

      if (transactionVersion) {
        const txMeta = txMetaByVersion.get(transactionVersion);
        const mintedTo = matchedMintEvent.data?.owner
          ? normalizeAddress(String(matchedMintEvent.data.owner))
          : undefined;
        const mintedBy = matchedMintEvent.data?.issuer
          ? normalizeAddress(String(matchedMintEvent.data.issuer))
          : txMeta?.sender
          ? normalizeAddress(txMeta.sender)
          : undefined;

        events.push({
          type: "MINTED",
          passportObjectAddr,
          toAddress: mintedTo,
          actorAddress: mintedBy,
          transactionVersion,
          transactionHash: txMeta?.hash,
          at: txMeta?.timestampMs,
        });
      }
    }

    for (const transferEvent of matchedTransferEvents) {
      const transactionVersion = getEventVersion(transferEvent);
      if (!transactionVersion) {
        continue;
      }

      const txMeta = txMetaByVersion.get(transactionVersion);
      const fromAddress = transferEvent.data?.from
        ? normalizeAddress(String(transferEvent.data.from))
        : undefined;
      const toAddress = transferEvent.data?.to
        ? normalizeAddress(String(transferEvent.data.to))
        : undefined;

      events.push({
        type: "TRANSFERRED",
        passportObjectAddr,
        fromAddress,
        toAddress,
        actorAddress: txMeta?.sender ? normalizeAddress(txMeta.sender) : undefined,
        transactionVersion,
        transactionHash: txMeta?.hash,
        at: txMeta?.timestampMs,
      });
    }

    events.sort((a, b) => {
      const av = BigInt(a.transactionVersion);
      const bv = BigInt(b.transactionVersion);
      return av < bv ? -1 : av > bv ? 1 : 0;
    });

    return {
      passportObjectAddr,
      serialNumber: productIdHex,
      serialNumberPlain: productIdPlain,
      events,
    };
  },

  async getProductById(productId: string): Promise<GetProductByIdResponse> {
    const productIdPlain = decodeProductIdInput(productId);
    const productIdHex = toUtf8Hex(productIdPlain);

    const passportObjectAddr = await resolvePassportObjAddrByProductId(aptos, productIdPlain);
    const passport = await getPassport(aptos, passportObjectAddr);
    const issuerAddress = normalizeAddress(passport.issuer);
    const registryAddress = normalizeAddress(REGISTRY_ADDRESS);

    // Pull a larger history window when querying a specific product.
    const issuerProducts = await getIssuerMintedProducts(issuerAddress, 500);
    const matchingProduct = issuerProducts.find((product) => {
      const serialHex = toUtf8Hex(product.serialNumber).toLowerCase();
      return (
        product.serialNumber === productIdPlain ||
        serialHex === productIdHex.toLowerCase()
      );
    });

    const createdAtSecs = Number(passport.createdAtSecs);
    const mintedAtFallback = Number.isFinite(createdAtSecs)
      ? Math.floor(createdAtSecs * 1_000)
      : undefined;

    return {
      passportObjectAddr: normalizeAddress(passportObjectAddr),
      issuerAddress,
      ownerAddress: matchingProduct?.ownerAddress,
      registryAddress,
      serialNumber: productIdHex,
      serialNumberPlain: productIdPlain,
      metadataUri: matchingProduct?.metadataUri ?? passport.metadataUri,
      transferable: matchingProduct?.transferable ?? passport.transferable,
      transactionHash: matchingProduct?.transactionHash,
      transactionVersion: matchingProduct?.transactionVersion,
      mintedAt: matchingProduct?.mintedAt ?? mintedAtFallback,
      status: passport.status,
    };
  },
};

export const passportListingService = {
  // Builds the transaction payload and does validation for setting passport status, would then return it to frontend to sign
  // Returns success = true/false, payload is passport address and new status if success, error message if false
  async prepareSetStatus(params: {
    callerWalletAddress: string;
    callerRole: "ADMIN" | "ISSUER";
    body: PrepareSetStatusRequestBody;
  }): Promise<PrepareSetStatusResponse>{
    const { callerWalletAddress, callerRole, body } = params;

    validateWalletAddress(body.passportObjectAddress, "passport object address");

    if (!isValidStatus(body.newStatus)) {
      return { success: false, error: `Invalid status value: ${body.newStatus}.` };
    }

    const normalizedPassportAddr = normalizeAddress(body.passportObjectAddress);

    let passport: Awaited<ReturnType<typeof getPassport>>;
    try {
      passport = await getPassport(aptos, normalizedPassportAddr);
    } catch {
      return {
        success: false,
        error: "Passport not found. Check the passport object address.",
      };
    }

    // Check that caller is Admin if trying to set LISTING status
    if (
      (body.newStatus === STATUS_LISTING) &&
      callerRole !== "ADMIN"
    ) {
      return {
        success: false,
        error: "Only Admin can set LISTING status.",
      };
    }

    // Issuer blocked while passport is listed — Admin must cancel the listing status first
    if (passport.status === STATUS_LISTING && callerRole !== "ADMIN") {
      return {
        success: false,
        error: "Passport is currently listed. Admin must clear the listing before status can be changed.",
      };
    }

    // Issuer can only act on passports they issued, same as on chain
    if (callerRole === "ISSUER") {
      if (normalizeAddress(passport.issuer) !== normalizeAddress(callerWalletAddress)) {
        return {
          success: false,
          error: "You are not the issuer of this passport.",
        };
      }
    }

    const payload = buildSetStatusPayload({
      passportObjectAddress: normalizedPassportAddr,
      newStatus: body.newStatus,
    });

    return { success: true, payload };
  }

  // Used to verify that the transaction for set status was successful and then update any off-chain state in the website
  async recordSetStatus(params: {
    body: RecordSetStatusRequestBody;
  }): Promise<RecordSetStatusResponse> {
    const { body } = params;

    if (!body.txHash || typeof body.txHash !== "string" || !body.txHash.startsWith("0x")) {
      return { success: false, error: "Invalid transaction hash." };
    }

    validateWalletAddress(body.passportObjectAddress, "passport object address");

    const response = await fetch(`${FULLNODE_URL}/transactions/by_hash/${body.txHash}`);

    if (!response.ok) {
      return { success: false, error: "Transaction not found on chain." };
    }

    const tx = (await response.json()) as {
      type: string;
      success: boolean;
      payload?: { function?: string };
    };

    if (tx.type !== "user_transaction") {
      return { success: false, error: "Transaction is not a user transaction." };
    }

    if (!tx.success) {
      return { success: false, error: "Transaction did not succeed on chain." };
    }

    const fnName = tx.payload?.function?.toLowerCase() ?? "";
    if (fnName !== PASSPORT_SET_STATUS_FN.toLowerCase()) {
      return { success: false, error: "Transaction is not a set_status transaction." };
    }

    // Remove cached product data for user, to ensure updated status is reflected on frontend.
    // Imaging something similar would result for admins as issuers
    try {
      const passport = await getPassport(aptos, normalizeAddress(body.passportObjectAddress));
      // Placeholder will get back to this later for individual users
      clearIssuerProductsFromStore(passport.issuer);
    } catch {
      // even if it fails cache would be cleared eventually, should log this somewhere though for debugging
    }

    return { success: true, message: "Status update recorded successfully." };
  },

  // Builds transaction payload and does validation for updating passport metadata (Only for Admin and Verifiers[Issuers for now])
  // returns payload on success, error message on failure
  async prepareUpdateMetadata(params: {
    callerWalletAddress: string;
    callerRole: "ADMIN" | "ISSUER";
    body: PrepareUpdateMetadataRequestBody;
    imageFile?: Express.Multer.File;
  }): Promise<PrepareUpdateMetadataResponse> {
    const { callerWalletAddress, callerRole, body, imageFile } = params;

    validateWalletAddress(body.passportObjectAddress, "passport object address");

    const normalizedPassportAddr = normalizeAddress(body.passportObjectAddress);

    let passport: Awaited<ReturnType<typeof getPassport>>;
    try {
      passport = await getPassport(aptos, normalizedPassportAddr);
    } catch {
      return {
        success: false,
        error: "Passport not found. Check the passport object address.",
      };
    }

    // Issuer can only update passports they issued
    if (callerRole === "ISSUER") {
      if (normalizeAddress(passport.issuer) !== normalizeAddress(callerWalletAddress)) {
        return {
          success: false,
          error: "You are not the issuer of this passport.",
        };
      }
    }

    const productName = validateRequiredString(body.productName, "productName");
    const brand = validateRequiredString(body.brand, "brand");
    const category = validateRequiredString(body.category, "category");
    const serialNumber = validateRequiredString(body.serialNumber, "serialNumber");
    const manufacturingDate = validateRequiredString(body.manufacturingDate, "manufacturingDate");
    const countryOfOrigin = validateRequiredString(body.countryOfOrigin, "countryOfOrigin");
    const description = validateRequiredString(body.description, "description");
    const materials = parseMaterials(body.materials);

    if (materials.length === 0) {
      throw new Error("At least one material is required.");
    }

    // If a new image is provided, upload it — otherwise reuse the existing metadata URI's image.
    let imageIpfsUri: string;
    if (imageFile) {
      validateImageFile(imageFile);
      const imageUpload = await uploadImageToPinata(imageFile);
      imageIpfsUri = imageUpload.ipfsUri;
    } else {
      // Fetch existing metadata to reuse the image URI
      try {
        const existingMetadataResponse = await fetch(passport.metadataUri);
        if (!existingMetadataResponse.ok) {
          return {
            success: false,
            error: "No existing metadata could be found.",
          };
        }
        const existingMetadata = (await existingMetadataResponse.json()) as { image?: string };
        if (existingMetadata.image) {
          imageIpfsUri = existingMetadata.image;
        }
      } catch {
        return {
          success: false,
          error: "No image provided and existing metadata could not be fetched.",
        };
      }
    }

    const metadata = {
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

    const metadataUpload = await uploadMetadataToPinata(metadata);
    const metadataJson = JSON.stringify(metadata, null, 2);
    const metadataBytes = Array.from(Buffer.from(metadataJson, "utf8"));

    const payload = buildUpdateMetadataPayload({
      passportObjectAddress: normalizedPassportAddr,
      metadataIpfsUri: metadataUpload.ipfsUri,
      metadataBytes,
    });

    return {
      success: true,
      metadataIpfsUri: metadataUpload.ipfsUri,
      payload,
    };
  },

  // Used to verify that the transaction for update metadata was successful and then update any off-chain state in the website
  async recordUpdateMetadata(params: {
    body: RecordUpdateMetadataRequestBody;
  }): Promise<RecordUpdateMetadataResponse> {
    const { body } = params;

    if (!body.txHash || typeof body.txHash !== "string" || !body.txHash.startsWith("0x")) {
      return { success: false, error: "Invalid transaction hash." };
    }

    validateWalletAddress(body.passportObjectAddress, "passport object address");

    const response = await fetch(`${FULLNODE_URL}/transactions/by_hash/${body.txHash}`);

    if (!response.ok) {
      return { success: false, error: "Transaction not found on chain." };
    }

    const tx = (await response.json()) as {
      type: string;
      success: boolean;
      payload?: { function?: string };
    };

    if (tx.type !== "user_transaction") {
      return { success: false, error: "Transaction is not a user transaction." };
    }

    if (!tx.success) {
      return { success: false, error: "Transaction did not succeed on chain." };
    }

    const fnName = tx.payload?.function?.toLowerCase() ?? "";
    if (fnName !== PASSPORT_UPDATE_METADATA_FN.toLowerCase()) {
      return { success: false, error: "Transaction is not an update_metadata transaction." };
    }

    // Invalidate product cached to fetch latest metadata on next retrieval.
    try {
      const passport = await getPassport(aptos, normalizeAddress(body.passportObjectAddress));
      clearIssuerProductsFromStore(passport.issuer);
    } catch {
      // best-effort — cache miss is not fatal
    }

    return { success: true, message: "Metadata update recorded successfully." };
  },

  async prepareListPassport(params: {
    callerWalletAddress: string;
    body: PrepareListPassportRequestBody;
  }): Promise<PrepareListPassportResponse>{
    const { callerWalletAddress, body } = params;

    validateWalletAddress(body.passportObjectAddress, "passport object address");

    const normalizedPassportAddr = normalizeAddress(body.passportObjectAddress);

    let passport: Awaited<ReturnType<typeof getPassport>>;
    try {
      passport = await getPassport(aptos, normalizedPassportAddr);
    } catch {
      return {
        success: false,
        error: "Passport not found. Check the passport object address.",
      };
    }

    if (!passport.transferable) {
      return { success: false, error: "This passport is not transferable." };
    }

    const onChainOwner = await getPassportOwner(normalizedPassportAddr);
    if (normalizeAddress(onChainOwner) !== normalizedCaller) {
      return { success: false, error: "You are not the owner of this passport." };
    }

    const payload = buildPassportListPayload({
      passportObjectAddress: normalizedPassportAddr,
    });

    return { success: true, payload };
  }

  // Used to verify that the transaction for list passport was successful and then update any off-chain state in the website
  async recordListPassport(params: {
    body: RecordListPassportRequestBody;
  }): Promise<RecordListPassportResponse> {
    const { body } = params;

    if (!body.txHash || typeof body.txHash !== "string" || !body.txHash.startsWith("0x")) {
      return { success: false, error: "Invalid transaction hash." };
    }

    validateWalletAddress(body.passportObjectAddress, "passport object address");

    const response = await fetch(`${FULLNODE_URL}/transactions/by_hash/${body.txHash}`);

    if (!response.ok) {
      return { success: false, error: "Transaction not found on chain." };
    }

    const tx = (await response.json()) as {
      type: string;
      success: boolean;
      payload?: { function?: string };
    };

    if (tx.type !== "user_transaction") {
      return { success: false, error: "Transaction is not a user transaction." };
    }

    if (!tx.success) {
      return { success: false, error: "Transaction did not succeed on chain." };
    }

    const fnName = tx.payload?.function?.toLowerCase() ?? "";
    if (fnName !== PASSPORT_LIST_FN.toLowerCase()) {
      return { success: false, error: "Transaction is not a list_passport transaction." };
    }

    // Remove cached product data for user, to ensure updated status is reflected on frontend.
    // Imaging something similar would result for admins as issuers
    try {
      const passport = await getPassport(aptos, normalizeAddress(body.passportObjectAddress));
      // Placeholder will get back to this later for individual users
      clearIssuerProductsFromStore(passport.issuer);
    } catch {
      // even if it fails cache would be cleared eventually, should log this somewhere though for debugging
    }

    return { success: true, message: "Listing Passport recorded successfully." };
  },

};

/*
  To do Marketplace:
    Add in service to allow admin to delist passport which would just be a set_status("active") transaction
    Add in service to allow user to request admin to delist passport
    Add in service to allow user to submit buyer address and get passport transferred to buyer
    Add in service to allow buyer to submit their shipping address to admin
    Add in service to allow buyer to notify that they have received product and have passport status restored to active
    Think about adding in multiple on-chain status types:
      Storing: after initial listing would be this status
      Verifying: after admin receives the product from seller
      Listing: after admin verifies product (mints new passport or verifies existing one)
      Sold: after passport is transferred to buyer (status until buyer confirms receipt of product)
      Active: passport returns to active status at end after buyer confirmation
*/
