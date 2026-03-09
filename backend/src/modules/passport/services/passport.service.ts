import {
  GetOwnedPassportsResponse,
  GetProductByIdResponse,
  GetIssuerProductsResponse,
  PassportMetadata,
  PrepareMintPassportRequestBody,
  PrepareMintPassportResponse,
  PreparedMintPayload,
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
  resolvePassportObjAddrByProductId,
} from "../../../chains/luxpass/readers";
import { getIssuerMintedProducts } from "../../../chains/luxpass/readers/getIssuerMintedProducts";
import { getOwnedPassports as getOwnedPassportsFromChain } from "../../../chains/luxpass/readers/getOwnedPassports";
import { REGISTRY_ADDRESS } from "../../../chains/luxpass/constants";
import { initRegistry as writeInitRegistry } from "../../../chains/luxpass/writers/initRegistry";
import {
  getIssuerProductsFromStore,
  saveIssuerProductsToStore,
} from "../store/productStore";

const aptos = makeAptosClient();

const MODULE_ADDRESS = process.env.MODULE_ADDRESS!;
const PASSPORT_MODULE_NAME = "passport";
const PASSPORT_MINT_FUNCTION = "mint";
const PASSPORT_INIT_PROBE_PRODUCT_ID = "__luxpass_passport_init_probe__";
const PRODUCT_CACHE_TTL_MS = 60 * 1000;

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
