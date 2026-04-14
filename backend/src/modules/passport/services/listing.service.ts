import {
  PrepareSetStatusRequestBody,
  PrepareSetStatusResponse,
  RecordSetStatusRequestBody,
  RecordSetStatusResponse,
  PrepareUpdateMetadataRequestBody,
  PrepareUpdateMetadataResponse,
  RecordUpdateMetadataRequestBody,
  RecordUpdateMetadataResponse,
  PrepareListPassportRequestBody,
  PrepareListPassportResponse,
  RecordListPassportRequestBody,
  RecordListPassportResponse,
  submitListingRequestResponse,
  UpdateNoPassportListingRequestBody,
  UpdateNoPassportListingResponse,
  PrepareMintListPassportRequestBody,
  PrepareMintListPassportResponse,
  RecordMintListRequestBody,
  RecordMintListResponse,
  listingRequestReturn,
  listingRequestReturnList,
  deListRequestReturn,
  deListRequestReturnList,
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
} from "../../../chains/luxpass/readers";
import {
  PASSPORT_SET_STATUS_FN,
  PASSPORT_UPDATE_METADATA_FN,
  PASSPORT_LIST_FN,
  STATUS_STORING,
  STATUS_VERIFYING,
  STATUS_LISTING,
  STATUS_RETURNING,
  PASSPORT_MINTLIST_FN,
  PASSPORT_MINTLIST_EV,
} from "../../../chains/luxpass/constants";
import { buildSetPassportStatusPayload } from "../../../chains/luxpass/writers/setPassportStatus";
import { buildListPassportPayload } from "../../../chains/luxpass/writers/listPassport";
import { buildUpdateMetadataPayload } from "./passport.service.helpers";
import { buildMintListPayload } from "./passport.service.helpers";
import { clearIssuerProductsFromStore } from "../store/productStore";
import {
  createListingRequest,
  updateDelistRequestStatus,
  updateListingRequestOwner,
  updateListingRequestStatus,
  ListingRequestStatus,
  DelistRequestStatus,
  getListingRequest,
  updateListingRequestPassportAddress,
  getDelistRequestsByStatus,
  getListingRequestsByStatus,
  getDelistRequest,
} from "../repository/listing_repository";
import {
  NORMALIZED_REGISTRY,
  buildPassportMetadata,
  ensurePassportInfrastructureInitialized,
  isMarketPlaceStatus,
  isValidStatus,
  serializeMetadata,
  validateRecordedTransaction,
} from "./passport.service.helpers";

const aptos = makeAptosClient();

const listingStatusMap: Record<number, ListingRequestStatus> = {
  [STATUS_STORING]: "pending",
  [STATUS_VERIFYING]: "verifying",
  [STATUS_LISTING]: "listed",
  [STATUS_RETURNING]: "returning",
};

export const listingService = {
  async prepareSetStatus(params: {
    callerWalletAddress: string;
    callerRole: "ADMIN" | "ISSUER";
    body: PrepareSetStatusRequestBody;
  }): Promise<PrepareSetStatusResponse> {
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

    if (callerRole === "ISSUER") {
      if (normalizeAddress(passport.issuer) !== normalizeAddress(callerWalletAddress)) {
        return { success: false, error: "You are not the issuer of this passport." };
      }
    }

    if (
      (body.newStatus === STATUS_STORING ||
        body.newStatus === STATUS_VERIFYING ||
        body.newStatus === STATUS_LISTING ||
        body.newStatus === STATUS_RETURNING) &&
      callerRole !== "ADMIN"
    ) {
      return {
        success: false,
        error: "Only Admin can set Marketplace statuses (Storing, verifying, listing, sold).",
      };
    }

    if (isMarketPlaceStatus(passport.status) && callerRole !== "ADMIN") {
      return {
        success: false,
        error:
          "Passport is currently on marketplace. Admin must clear the listing from marketplace before Issuer can change.",
      };
    }

    const payload = buildSetPassportStatusPayload({
      passportObjectAddress: normalizedPassportAddr,
      registryAddress: NORMALIZED_REGISTRY,
      newStatus: body.newStatus,
    });

    return { success: true, payload };
  },

  async recordSetStatus(params: {
    body: RecordSetStatusRequestBody;
  }): Promise<RecordSetStatusResponse> {
    const { body } = params;

    validateWalletAddress(body.passportObjectAddress, "passport object address");

    const validation = await validateRecordedTransaction(
      body.txHash,
      PASSPORT_SET_STATUS_FN,
      "Transaction is not a set_status transaction."
    );
    if (!validation.success) return { success: false, error: validation.error };

    try {
      const passport = await getPassport(aptos, normalizeAddress(body.passportObjectAddress));
      if (isMarketPlaceStatus(passport.status)) {
        const listing_status = listingStatusMap[passport.status];
        await updateListingRequestStatus(normalizeAddress(body.passportObjectAddress), listing_status);
        if (passport.status === STATUS_RETURNING) {
          await updateDelistRequestStatus(
            normalizeAddress(body.passportObjectAddress),
            "returning" as DelistRequestStatus
          );
        }
      }
    } catch {
      // logging goes here
    }

    return { success: true, message: "Status update recorded successfully." };
  },

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

    if (callerRole === "ISSUER") {
      if (normalizeAddress(passport.issuer) !== normalizeAddress(callerWalletAddress)) {
        return { success: false, error: "You are not the issuer of this passport." };
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

    let imageIpfsUri: string;
    if (imageFile) {
      validateImageFile(imageFile);
      const imageUpload = await uploadImageToPinata(imageFile);
      imageIpfsUri = imageUpload.ipfsUri;
    } else {
      try {
        const existingMetadataResponse = await fetch(passport.metadataUri);
        if (!existingMetadataResponse.ok) {
          return { success: false, error: "No existing metadata could be found." };
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

    const metadata = buildPassportMetadata({
      productName,
      brand,
      category,
      serialNumber,
      manufacturingDate,
      materials,
      countryOfOrigin,
      description,
      imageIpfsUri,
    });

    const metadataUpload = await uploadMetadataToPinata(metadata);
    const metadataBytes = serializeMetadata(metadata);

    const payload = buildUpdateMetadataPayload({
      passportObjectAddress: normalizedPassportAddr,
      registryAddress: NORMALIZED_REGISTRY,
      metadataIpfsUri: metadataUpload.ipfsUri,
      metadataBytes,
    });

    return { success: true, metadataIpfsUri: metadataUpload.ipfsUri, payload };
  },

  async recordUpdateMetadata(params: {
    body: RecordUpdateMetadataRequestBody;
  }): Promise<RecordUpdateMetadataResponse> {
    const { body } = params;

    validateWalletAddress(body.passportObjectAddress, "passport object address");

    const validation = await validateRecordedTransaction(
      body.txHash,
      PASSPORT_UPDATE_METADATA_FN,
      "Transaction is not an update_metadata transaction."
    );
    if (!validation.success) return { success: false, error: validation.error };

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
  }): Promise<PrepareListPassportResponse> {
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

    const normalizedCaller = normalizeAddress(callerWalletAddress);
    const onChainOwner = await getPassportOwner(normalizedPassportAddr);
    if (normalizeAddress(onChainOwner) !== normalizedCaller) {
      return { success: false, error: "You are not the owner of this passport." };
    }

    const payload = buildListPassportPayload({
      passportObjectAddress: normalizedPassportAddr,
      registryAddress: NORMALIZED_REGISTRY,
    });

    return { success: true, payload };
  },

  async recordListPassport(params: {
    body: RecordListPassportRequestBody;
  }): Promise<RecordListPassportResponse> {
    const { body } = params;

    validateWalletAddress(body.passportObjectAddress, "passport object address");

    const validation = await validateRecordedTransaction(
      body.txHash,
      PASSPORT_LIST_FN,
      "Transaction is not a list_passport transaction."
    );
    if (!validation.success) return { success: false, error: validation.error };

    const normalizedPassportAddr = normalizeAddress(body.passportObjectAddress);
    try {
      const passportOwner = await getPassportOwner(normalizedPassportAddr);
      const existing_listing = await getListingRequest(normalizedPassportAddr);
      if (!existing_listing) {
        const result = await createListingRequest(
          true,
          normalizeAddress(passportOwner),
          normalizedPassportAddr
        );
        return {
          success: true,
          message: "Listing Passport updated successfully.",
          passportObjectAddress: result.passport_object_address,
        };
      } else {
        if (existing_listing.status === "returned") {
          const status = "pending" as ListingRequestStatus;
          updateListingRequestStatus(normalizedPassportAddr, status);
          const updateOwner = await updateListingRequestOwner(normalizedPassportAddr, passportOwner);
          return {
            success: true,
            message: "Listing Passport updated successfully.",
            passportObjectAddress: updateOwner.passport_object_address,
          };
        }
        return { success: false, error: "Listing already exists and is still active" };
      }
    } catch (err: any) {
      return { success: false, error: "Unable to update database:" + err };
    }
  },

  async submitListingRequest(params: {
    callerWalletAddress: string;
  }): Promise<submitListingRequestResponse> {
    const { callerWalletAddress } = params;

    validateWalletAddress(callerWalletAddress, "caller wallet address");

    const normalizedCaller = normalizeAddress(callerWalletAddress);

    try {
      const listing = await createListingRequest(false, normalizedCaller);
      return {
        success: true,
        message: "Listing request submitted. LuxPass will verify your item before listing.",
        tempObjectAddress: listing.passport_object_address,
      };
    } catch (err: any) {
      return {
        success: false,
        error: "Failed to submit listing request. Please try again later." + err,
      };
    }
  },

  async updateNoPassportListingStatus(params: {
    callerRole: "ADMIN";
    body: UpdateNoPassportListingRequestBody;
  }): Promise<UpdateNoPassportListingResponse> {
    const { callerRole, body } = params;

    if (callerRole !== "ADMIN") {
      return { success: false, error: "Only Admin can update listing requests." };
    }

    if (body.status !== "verifying" && body.status !== "listed") {
      return { success: false, error: "Invalid status update for no-passport listings" };
    }

    try {
      await updateListingRequestStatus(
        normalizeAddress(body.tempObjectAddress),
        body.status as ListingRequestStatus
      );
      return {
        success: true,
        message: `Listing request has been ${body.status.toLowerCase()}.`,
      };
    } catch {
      return {
        success: false,
        error: "Failed to update listing request. Please try again later.",
      };
    }
  },

  async prepareMintListPassport(params: {
    adminWalletAddress: string;
    body: PrepareMintListPassportRequestBody;
    imageFile?: Express.Multer.File;
  }): Promise<PrepareMintListPassportResponse> {
    const { adminWalletAddress, body, imageFile } = params;

    try {
      const objectAddress = normalizeAddress(body.tempObjectAddress);
      const listing = await getListingRequest(objectAddress);

      if (!listing) {
        return { success: false, error: "No listing request found for this temp address." };
      }

      if (listing.status !== "verifying") {
        return { success: false, error: "Listing request is not in verifying stage." };
      }
      if (listing.has_passport) {
        return {
          success: false,
          error: "Listing request already has a passport. No need to mint-list.",
        };
      }

      const owner_address = listing.owner_address;

      validateWalletAddress(adminWalletAddress, "admin wallet address");
      validateImageFile(imageFile);

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

      const normalizedOwnerAddress = normalizeAddress(owner_address);
      const serialPlainBytes = Array.from(Buffer.from(serialNumber, "utf8"));

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
      const metadataBytes = serializeMetadata(metadata);

      const payload = buildMintListPayload({
        registryAddress: NORMALIZED_REGISTRY,
        ownerAddress: normalizedOwnerAddress,
        metadataIpfsUri: metadataUpload.ipfsUri,
        serialPlainBytes,
        metadataBytes,
        placeholderAddress: normalizeAddress(body.tempObjectAddress),
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Minting for new listed passport failed: ${message}` };
    }
  },

  async recordMintListPassport(params: {
    body: RecordMintListRequestBody;
  }): Promise<RecordMintListResponse> {
    const { body } = params;

    const validation = await validateRecordedTransaction(
      body.txHash,
      PASSPORT_MINTLIST_FN,
      "Transaction is not a mint_list passport transaction."
    );
    if (!validation.success) return { success: false, error: validation.error };
    const { tx } = validation;

    try {
      const passportEvent = tx.events?.find((e) => e.type.includes(PASSPORT_MINTLIST_EV));

      if (passportEvent) {
        const { passport, old_address } = passportEvent.data;
        const normalizedPassportAddr = normalizeAddress(passport);
        await updateListingRequestPassportAddress(old_address, normalizedPassportAddr);
      } else {
        return { success: false, error: "Failed to retrieve mint list event" };
      }
    } catch (err: any) {
      return { success: false, error: "Failed to update database after minting:" + err };
    }

    return { success: true, message: "Successfully updated for mint list" };
  },

  async getListingByPassportAddress(params: {
    passportObjectAddress: string;
  }): Promise<listingRequestReturn> {
    try {
      const result = await getListingRequest(normalizeAddress(params.passportObjectAddress));
      if (!result) {
        return { success: false, error: "No listing request found for this passport address" };
      }
      return { success: true, payload: result };
    } catch (err: any) {
      return { success: false, error: "Failed to fetch listing by passport Address:" + err };
    }
  },

  async getListingsByStatus(params: {
    status: ListingRequestStatus;
  }): Promise<listingRequestReturnList> {
    try {
      const list = await getListingRequestsByStatus(params.status);
      return { success: true, payload: list };
    } catch (err: any) {
      return { success: false, error: "Failed to fetch listing by passport Address:" + err };
    }
  },

  async getDeListingRequestByPassportAddress(params: {
    passportObjectAddress: string;
  }): Promise<deListRequestReturn> {
    try {
      const result = await getDelistRequest(params.passportObjectAddress);
      if (!result) {
        return { success: false, error: "No de listing request found for this passport address" };
      }
      return { success: true, payload: result };
    } catch (err: any) {
      return { success: false, error: "Failed to fetch listing by passport Address:" + err };
    }
  },

  async getDeListingsByStatus(params: {
    status: DelistRequestStatus;
  }): Promise<deListRequestReturnList> {
    try {
      const list = await getDelistRequestsByStatus(params.status);
      return { success: true, payload: list };
    } catch (err: any) {
      return { success: false, error: "Failed to fetch listing by passport Address:" + err };
    }
  },
};
