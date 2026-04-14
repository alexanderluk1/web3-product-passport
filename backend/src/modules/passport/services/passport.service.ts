import {
  GetPassportProvenanceResponse,
  GetOwnedPassportsResponse,
  GetProductByIdResponse,
  GetIssuerProductsResponse,
  PassportProvenanceEvent,
  PrepareMintPassportRequestBody,
  PrepareMintPassportResponse,
  PrepareTransferRequestBody,
  PrepareTransferResponse,
  RecordTransferRequestBody,
  RecordTransferResponse,
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
import {
  PASSPORT_TRANSFER_FN,
  STATUS_LISTING,
} from "../../../chains/luxpass/constants";
import {
  getIssuerProductsFromStore,
  saveIssuerProductsToStore,
  clearIssuerProductsFromStore,
} from "../store/productStore";
import { updateListingRequestOwner } from "../repository/listing_repository";
import {
  NORMALIZED_REGISTRY,
  buildMintPayload,
  buildTransferPayload,
  buildPassportMetadata,
  decodeProductIdInput,
  ensurePassportInfrastructureInitialized,
  fetchTxMetaByVersion,
  getEventVersion,
  isCacheFresh,
  parseTransferable,
  serializeMetadata,
  toUtf8Hex,
  validateRecordedTransaction,
} from "./passport.service.helpers";

const aptos = makeAptosClient();
const FULLNODE_URL =
  process.env.APTOS_FULLNODE_URL || "https://fullnode.devnet.aptoslabs.com/v1";

const MODULE_ADDRESS = process.env.MODULE_ADDRESS!;

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
    const metadataBytes = serializeMetadata(metadata);

    const payload = buildMintPayload({
      registryAddress: NORMALIZED_REGISTRY,
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
      registryAddress: NORMALIZED_REGISTRY,
    });

    return { success: true, payload };
  },

  async recordTransferPassport(params: {
    body: RecordTransferRequestBody;
  }): Promise<RecordTransferResponse> {
    const { body } = params;

    const validation = await validateRecordedTransaction(
      body.txHash,
      PASSPORT_TRANSFER_FN,
      "Transaction is not a transfer transaction."
    );
    if (!validation.success) return { success: false, error: validation.error };

    // Invalidate issuer product cache (best-effort)
    try {
      const normalizedPassportAddr = normalizeAddress(body.passportObjectAddress);
      const passport = await getPassport(aptos, normalizeAddress(body.passportObjectAddress));
      if (passport.status === STATUS_LISTING){
        await updateListingRequestOwner(normalizedPassportAddr, normalizeAddress(body.newOwnerAddress))
      }
      clearIssuerProductsFromStore(passport.issuer);
      // Log the owner change in listings if passport status is listed
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
      `${FULLNODE_URL}/accounts/${NORMALIZED_REGISTRY}/events/${MODULE_ADDRESS}::passport::PassportEvents/minted?limit=1000`
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
      `${FULLNODE_URL}/accounts/${NORMALIZED_REGISTRY}/events/${MODULE_ADDRESS}::passport::PassportEvents/transferred?limit=1000`
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
    const registryAddress = NORMALIZED_REGISTRY;

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

