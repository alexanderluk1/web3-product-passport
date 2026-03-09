import {
  PassportMetadata,
  PrepareMintPassportRequestBody,
  PrepareMintPassportResponse,
  PreparedMintPayload
} from "../types/passport.types";
import {
  validateWalletAddress,
  normalizeAddress
} from "../../../utils/walletHelper"
import {
  validateImageFile,
  validateRequiredString,
  parseMaterials
} from "../../../utils/processHelper"

import {
  uploadImageToPinata,
  uploadMetadataToPinata
} from "../../../utils/pinataHelper"

import { makeAptosClient } from "../../../config/aptos";
import { getPassport } from "../../../chains/luxpass/readers";
import { REGISTRY_ADDRESS } from "../../../chains/luxpass/constants";

const aptos = makeAptosClient();

const MODULE_ADDRESS = process.env.MODULE_ADDRESS!;
const PASSPORT_MODULE_NAME = "passport";
const PASSPORT_MINT_FUNCTION = "mint";

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
    const transferable = typeof body.transferable === "boolean" ? body.transferable : false;

    // TODO:
    // 1. Check req.user is actually an approved issuer on-chain
    // 2. Optionally reject duplicate serial/productId before preparing payload

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
    const metadataBytes = Array.from(Buffer.from(JSON.stringify(metadata), "utf8"));

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
};
