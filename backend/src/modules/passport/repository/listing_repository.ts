import { stat } from "fs";
import { db } from "../../../config/db";
import { createHash } from "crypto";

// ----------------------
// Types
// ----------------------

export type ListingRequestStatus = "pending" | "verifying"  | "listed" | "request_return" | "returning" | "returned" | "sold";

export type ListingRequest = {
  id: string;
  passport_object_address?: string;
  owner_address: string;
  status: ListingRequestStatus;
  has_passport: boolean;
  price_octas?: string;
  escrow_tx_hash?: string;
  in_escrow: boolean;
  product_name?: string;
  brand?: string;
  category?: string;
  description?: string;
  materials?: string;
  country_of_origin?: string;
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
      .update(sellerAddress + id)
      .digest("hex");
    return `temp_${hash}`;
}

// ----------------------
// Mappers
// ----------------------

function mapListingRow(row: Record<string, unknown> | undefined): ListingRequest | undefined {
  if (!row) return undefined;
  return {
    id: row.id as string,
    passport_object_address: row.passport_object_address as string | undefined,
    owner_address: row.owner_address as string,
    status: row.status as ListingRequestStatus,
    has_passport: row.has_passport as boolean,
    price_octas: row.price_octas ? String(row.price_octas) : undefined,
    escrow_tx_hash: row.escrow_tx_hash as string | undefined,
    in_escrow: (row.in_escrow as boolean) ?? false,
    product_name: row.product_name as string | undefined,
    brand: row.brand as string | undefined,
    category: row.category as string | undefined,
    description: row.description as string | undefined,
    materials: row.materials as string | undefined,
    country_of_origin: row.country_of_origin as string | undefined,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

function mapDelistRow(row: Record<string, unknown> | undefined): DelistRequest | undefined {
  if (!row) return undefined;
  return {
    id: row.id as string,
    passport_object_address: row.passport_object_address as string,
    requester_address: row.requester_address as string,
    address_line1: row.address_line1 as string,
    address_line2: row.address_line2 as string | null,
    city: row.city as string,
    state: row.state as string,
    postal_code: row.postal_code as string,
    country: row.country as string,
    status: row.status as DelistRequestStatus,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

export async function createListingRequest(
  has_passport: boolean,
  owner_address: string,
  passportObjectAddress?: string
): Promise<ListingRequest> {
    // Flow for if no passport: first create the listing then generate the placeholder
    if (!has_passport) {
        const newId = crypto.randomUUID();
        const placeholder = buildPlaceholderAddress(owner_address, newId).trim().toLowerCase();
        const status_db = "pending" as ListingRequestStatus;
        const [row] = await db("listing_requests")
          .insert({
            id: newId,
            passport_object_address: placeholder,
            owner_address: owner_address,
            has_passport: false,
            status: status_db,
            updated_at: db.fn.now(),
          })
          .returning("*");
    
        return mapListingRow(row);
      }

  const passportAddress = passportObjectAddress.trim().toLowerCase();
  const status_db = "pending" as ListingRequestStatus;
  const [row] = await db("listing_requests")
    .insert({
      passport_object_address: passportAddress,
      owner_address: owner_address,
      has_passport: true,
      status: status_db,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return mapListingRow(row);
}

export async function getListingRequest(
  passportObjectAddress: string
): Promise<ListingRequest | undefined> {
  if (typeof passportObjectAddress !== 'string') {
    console.error("Status error: Expected string, received:", typeof passportObjectAddress, passportObjectAddress);
    return undefined;
  }
  const passportAddress = passportObjectAddress.trim().toLowerCase();
  const row = await db("listing_requests")
    .where('passport_object_address', passportAddress)
    .orderBy("created_at", "desc")
    .first();

  return mapListingRow(row);
}

export async function getListingRequestsByStatus(
  status: ListingRequestStatus
): Promise<ListingRequest[] | undefined> {
  const status_db = status as ListingRequestStatus;
  const rows = await db("listing_requests")
    .where("status", status_db)
    .orderBy("created_at", "asc");

  if (!rows || rows.length === 0) {
    return undefined;
  }

  return rows.map(mapListingRow);
}

export async function updateListingRequestStatus(
  passportObjectAddress: string,
  status: ListingRequestStatus
): Promise<ListingRequest | undefined> {
  if (typeof passportObjectAddress !== 'string') {
    console.error("Status error: Expected string, received:", typeof passportObjectAddress, passportObjectAddress);
    return undefined;
  }
  const passportObjectAddr = passportObjectAddress.trim().toLowerCase();
  const id = await db("listing_requests")
    .where("passport_object_address", passportObjectAddr)
    .orderBy("created_at", "desc")
    .first("id");

    if (!id) {
      console.log("Failed to find using passport_object_address with:"+passportObjectAddress);
      return undefined
    };

  const status_db = status as ListingRequestStatus;
  const [row] = await db("listing_requests")
    .where({ id: id.id })
    .update({
      status: status_db,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return mapListingRow(row);
}

// For updating the owner address after transfer
export async function updateListingRequestOwner(
  passportObjectAddress: string,
  ownerAddress: string
): Promise<ListingRequest | undefined> {
  if (typeof passportObjectAddress !== 'string') {
    console.error("Status error: Expected string, received:", typeof passportObjectAddress, passportObjectAddress);
    return undefined;
  }
  const passportObjectAddr = passportObjectAddress.trim().toLowerCase();
  const id = await db("listing_requests")
    .where('passport_object_address', passportObjectAddr)
    .orderBy("created_at", "desc")
    .first("id");

    if (!id) {
      console.log("Failed to find using passport_object_address with:"+passportObjectAddress);
      return undefined
    };

  const [row] = await db("listing_requests")
    .where({ id: id.id })
    .update({
      owner_address: ownerAddress,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return mapListingRow(row);
}

// For updating the passport object address from placeholder to real one after minting
export async function updateListingRequestPassportAddress(
    tempObjectAddress: string,
    realPassportObjectAddress: string
  ): Promise<ListingRequest | undefined> {
    if (typeof tempObjectAddress !== 'string') {
      console.error("Status error: Expected string, received:", typeof tempObjectAddress, tempObjectAddress);
      return undefined;
    }
    const tempObjectAddr = tempObjectAddress.trim().toLowerCase();
    const id = await db("listing_requests")
    .where('passport_object_address', tempObjectAddr)
    .orderBy("created_at", "desc")
    .first("id");

    if (!id) {
      console.log("Failed to find using passport_object_address with:"+tempObjectAddress);
      return undefined
    };

    const realObjectAddr = realPassportObjectAddress.trim().toLowerCase();
    const status_db = "listed" as ListingRequestStatus;
    const [row] = await db("listing_requests")
      .where("id", id.id)
      .update({
        passport_object_address: realObjectAddr,
        has_passport: true,
        status: status_db,
        updated_at: db.fn.now(),
      })
      .returning("*");

    return mapListingRow(row);
  }

// ----------------------
// Delist requests
// ----------------------

export async function createDelistRequest(
  params: CreateDelistRequestParams
): Promise<DelistRequest> {
  if (typeof params.passportObjectAddress !== 'string') {
    console.error("Status error: Expected string, received:", typeof params.passportObjectAddress, params.passportObjectAddress);
    return undefined;
  }
  const passportObjectAddr = params.passportObjectAddress.trim().toLowerCase();
  const status_db = "pending" as DelistRequestStatus;
  const [row] = await db("delist_requests")
    .insert({
      passport_object_address: passportObjectAddr,
      requester_address: params.requesterAddress,
      address_line1: params.addressLine1,
      address_line2: params.addressLine2 ?? null,
      city: params.city,
      state: params.state,
      postal_code: params.postalCode,
      country: params.country,
      status: status_db,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return mapDelistRow(row);
}

export async function getDelistRequest(
  passportObjectAddress: string
): Promise<DelistRequest | undefined> {
  if (typeof passportObjectAddress !== 'string') {
    console.error("Status error: Expected string, received:", typeof passportObjectAddress, passportObjectAddress);
    return undefined;
  }
  const passportObjectAddr = passportObjectAddress.trim().toLowerCase();
  const row = await db("delist_requests")
    .where('passport_object_address', passportObjectAddr)
    .orderBy("created_at", "desc")
    .first();

  return mapDelistRow(row);
}

export async function getDelistRequestsByStatus(
  status: DelistRequestStatus
): Promise<DelistRequest[] | undefined> {
  const status_db = status as DelistRequestStatus;
  const rows = await db("delist_requests")
    .where("status", status_db)
    .orderBy("created_at", "asc");

  if (!rows || rows.length === 0) {
      return undefined;
  }

  return rows.map(mapDelistRow);
}

export async function updateDelistRequestStatus(
  passportObjectAddress: string,
  status: DelistRequestStatus
): Promise<DelistRequest | undefined> {
  if (typeof passportObjectAddress !== 'string') {
    console.error("Status error: Expected string, received:", typeof passportObjectAddress, passportObjectAddress);
    return undefined;
  }
  const passportObjectAddr = passportObjectAddress.trim().toLowerCase();
  const id = await db("delist_requests")
    .where('passport_object_address', passportObjectAddr)
    .orderBy("created_at", "desc")
    .first("id");

    if (!id) {
      console.log("Failed to find using passport_object_address with:"+passportObjectAddress);
      return undefined
    };

  const status_db = status as DelistRequestStatus;
  const [row] = await db("delist_requests")
    .where("id", id.id)
    .update({
      status: status_db,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return mapDelistRow(row);
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
  if (typeof passportObjectAddress !== 'string') {
    console.error("Status error: Expected string, received:", typeof passportObjectAddress, passportObjectAddress);
    return undefined;
  }
  const passportObjectAddr = passportObjectAddress.trim().toLowerCase();
  const id = await db("delist_requests")
    .where('passport_object_address', passportObjectAddr)
    .orderBy("created_at", "desc")
    .first("id");

    if (!id) {
      console.log("Failed to find using passport_object_address with:"+passportObjectAddress);
      return undefined
    };

  const [row] = await db("delist_requests")
    .where("id", id.id)
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

  return mapDelistRow(row);
}

// ----------------------
// Escrow helpers
// ----------------------

export async function updateListingEscrowStatus(
  passportObjectAddress: string,
  inEscrow: boolean,
  priceOctas?: string,
  escrowTxHash?: string,
): Promise<ListingRequest | undefined> {
  const addr = passportObjectAddress.trim().toLowerCase();
  const updates: Record<string, unknown> = {
    in_escrow: inEscrow,
    updated_at: db.fn.now(),
  };
  if (priceOctas !== undefined) updates.price_octas = priceOctas;
  if (escrowTxHash !== undefined) updates.escrow_tx_hash = escrowTxHash;

  const [row] = await db("listing_requests")
    .where("passport_object_address", addr)
    .update(updates)
    .returning("*");
  return mapListingRow(row);
}

export async function getListedInEscrow(): Promise<ListingRequest[]> {
  const rows = await db("listing_requests")
    .where({ status: "listed", in_escrow: true })
    .whereNotNull("price_octas")
    .orderBy("updated_at", "desc");
  return rows.map(mapListingRow).filter(Boolean) as ListingRequest[];
}

export async function updateListingProductDetails(
  passportObjectAddress: string,
  details: {
    product_name?: string;
    brand?: string;
    category?: string;
    description?: string;
    materials?: string;
    country_of_origin?: string;
  },
): Promise<ListingRequest | undefined> {
  const addr = passportObjectAddress.trim().toLowerCase();
  const [row] = await db("listing_requests")
    .where("passport_object_address", addr)
    .update({ ...details, updated_at: db.fn.now() })
    .returning("*");
  return mapListingRow(row);
}