import { db } from "../../../config/db";
import { createHash } from "crypto";

// ----------------------
// Types
// ----------------------

export type ListingRequestStatus = "pending" | "verifying"  | "listed" | "request_return" | "returning" | "returned";

export type ListingRequest = {
  id: string;
  passport_object_address?: string;
  owner_address: string;
  status: ListingRequestStatus;
  has_passport: boolean;
  created_at: Date;
  updated_at: Date;
};

export type CreateListingRequestParams =
  | {
      hasPassport: true;
      passportObjectAddress: string;
      owner_address: string;
    }
  | {
      hasPassport: false;
      owner_address: string;
    };

export type DelistRequestStatus = "pending" | "processed" | "closed";

export type DelistRequest = {
  id: string;
  passport_object_address: string;
  requester_address: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  status: DelistRequestStatus;
  created_at: Date;
  updated_at: Date;
};

export type CreateDelistRequestParams = {
  passportObjectAddress: string;
  requesterAddress: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

// ----------------------
// Listing requests
// ----------------------

// Builds the placeholder address for listings that don't have a passport yet. Deterministic based on seller address and unique id.
function buildPlaceholderAddress(sellerAddress: string, id: string): string {
    const hash = createHash("sha256")
      .update(sellerAddress.toLowerCase() + id)
      .digest("hex");
    return `temp_${hash}`;
}

export async function createListingRequest(
  has_passport: boolean,
  owner_address: string,
  passportObjectAddress?: string
): Promise<ListingRequest> {
    // Flow for if no passport: first create the listing then generate the placeholder
    if (!has_passport) {
        const [{id}] = await db("listing_requests").insert({
            passport_object_address: "temp_address",
            owner_address: owner_address,
            has_passport: false,
            status: "pending",
            updated_at: db.fn.now(),
        }).returning("id");

        const placeholder = buildPlaceholderAddress(owner_address, id);

        const [{ row }] = await db("listing_requests")
          .insert({
            passport_object_address: placeholder,
            owner_address: owner_address,
            has_passport: false,
            status: "pending",
            updated_at: db.fn.now(),
          })
          .returning("*");

        return row as ListingRequest;
      }
  const [row] = await db("listing_requests")
    .insert({
      passport_object_address: passportObjectAddress,
      owner_address: owner_address,
      has_passport: true,
      status: "pending",
      updated_at: db.fn.now(),
    })
    .returning("*");

  return row as ListingRequest;
}

export async function getListingRequest(
  passportObjectAddress: string
): Promise<ListingRequest | undefined> {
  const row = await db("listing_requests")
    .where("passport_object_address", passportObjectAddress.toLowerCase())
    .orderBy("created_at", "desc")
    .first();

  return row as ListingRequest | undefined;
}

export async function getListingRequestsByStatus(
  status: ListingRequestStatus
): Promise<ListingRequest[]> {
  const rows = await db("listing_requests")
    .where("status", status)
    .orderBy("created_at", "asc");

  return rows as ListingRequest[];
}

export async function updateListingRequestStatus(
  passportObjectAddress: string,
  status: ListingRequestStatus
): Promise<ListingRequest | undefined> {
  const [row] = await db("listing_requests")
    .where("passport_object_address", passportObjectAddress.toLowerCase())
    .orderBy("created_at", "desc")
    .limit(1)
    .update({
      status,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return row as ListingRequest | undefined;
}

// For updating the owner address after transfer
export async function updateListingRequestOwner(
  passportObjectAddress: string,
  ownerAddress: string
): Promise<ListingRequest | undefined> {
  const [row] = await db("listing_requests")
    .where("passport_object_address", passportObjectAddress)
    .orderBy("created_at", "desc")
    .limit(1)
    .update({
      owner_address: ownerAddress,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return row as ListingRequest | undefined;
}

// For updating the passport object address from placeholder to real one after minting
export async function updateListingRequestPassportAddress(
    tempObjectAddress: string,
    realPassportObjectAddress: string
  ): Promise<ListingRequest | undefined> {
    const [row] = await db("listing_requests")
      .where("passport_object_address", tempObjectAddress)
      .update({
        passport_object_address: realPassportObjectAddress,
        has_passport: true,
        status: "listed",
        updated_at: db.fn.now(),
      })
      .returning("*");

    return row as ListingRequest | undefined;
  }

// ----------------------
// Delist requests
// ----------------------

export async function createDelistRequest(
  params: CreateDelistRequestParams
): Promise<DelistRequest> {
  const [row] = await db("delist_requests")
    .insert({
      passport_object_address: params.passportObjectAddress.toLowerCase(),
      requester_address: params.requesterAddress.toLowerCase(),
      address_line1: params.addressLine1,
      address_line2: params.addressLine2 ?? null,
      city: params.city,
      state: params.state,
      postal_code: params.postalCode,
      country: params.country,
      status: "pending",
      updated_at: db.fn.now(),
    })
    .returning("*");

  return row as DelistRequest;
}

export async function getDelistRequest(
  passportObjectAddress: string
): Promise<DelistRequest | undefined> {
  const row = await db("delist_requests")
    .where("passport_object_address", passportObjectAddress.toLowerCase())
    .orderBy("created_at", "desc")
    .first();

  return row as DelistRequest | undefined;
}

export async function getDelistRequestsByStatus(
  status: DelistRequestStatus
): Promise<DelistRequest[]> {
  const rows = await db("delist_requests")
    .where("status", status)
    .orderBy("created_at", "asc");

  return rows as DelistRequest[];
}

export async function updateDelistRequestStatus(
  passportObjectAddress: string,
  status: DelistRequestStatus
): Promise<DelistRequest | undefined> {
  const [row] = await db("delist_requests")
    .where("passport_object_address", passportObjectAddress.toLowerCase())
    .orderBy("created_at", "desc")
    .limit(1)
    .update({
      status,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return row as DelistRequest | undefined;
}

export async function updateDelistRequestAddress(
  passportObjectAddress: string,
  address_line1: string,
  address_line2: string | undefined,
  city: string,
  state: string,
  postal_code: string,
  country: string
): Promise<DelistRequest | undefined> {
  const [row] = await db("delist_requests")
    .where("passport_object_address", passportObjectAddress.toLowerCase())
    .orderBy("created_at", "desc")
    .limit(1)
    .update({
      address_line1: address_line1,
      address_line2: address_line2 ?? null,
      city: city,
      state:  state,
      postal_code:  postal_code,
      country:  country,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return row as DelistRequest | undefined;
}