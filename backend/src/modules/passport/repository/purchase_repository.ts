import { db } from "../../../config/db";

export type PurchaseOrderStatus =
  | "pending"
  | "completed"
  | "delivery_requested"
  | "delivered";

export type PurchaseOrder = {
  id: string;
  passport_object_address: string;
  buyer_address: string;
  seller_address: string;
  price_octas: string;
  purchase_tx_hash?: string;
  status: PurchaseOrderStatus;
  delivery_address_line1?: string;
  delivery_address_line2?: string;
  delivery_city?: string;
  delivery_state?: string;
  delivery_postal_code?: string;
  delivery_country?: string;
  created_at: Date;
  updated_at: Date;
};

function mapRow(row: Record<string, unknown> | undefined): PurchaseOrder | undefined {
  if (!row) return undefined;
  return {
    id: row.id as string,
    passport_object_address: row.passport_object_address as string,
    buyer_address: row.buyer_address as string,
    seller_address: row.seller_address as string,
    price_octas: String(row.price_octas),
    purchase_tx_hash: row.purchase_tx_hash as string | undefined,
    status: row.status as PurchaseOrderStatus,
    delivery_address_line1: row.delivery_address_line1 as string | undefined,
    delivery_address_line2: row.delivery_address_line2 as string | undefined,
    delivery_city: row.delivery_city as string | undefined,
    delivery_state: row.delivery_state as string | undefined,
    delivery_postal_code: row.delivery_postal_code as string | undefined,
    delivery_country: row.delivery_country as string | undefined,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

export async function createPurchaseOrder(params: {
  passportObjectAddress: string;
  buyerAddress: string;
  sellerAddress: string;
  priceOctas: string;
  purchaseTxHash: string;
}): Promise<PurchaseOrder | undefined> {
  const [row] = await db("purchase_orders")
    .insert({
      passport_object_address: params.passportObjectAddress.trim().toLowerCase(),
      buyer_address: params.buyerAddress.trim().toLowerCase(),
      seller_address: params.sellerAddress.trim().toLowerCase(),
      price_octas: params.priceOctas,
      purchase_tx_hash: params.purchaseTxHash,
      status: "completed" as PurchaseOrderStatus,
    })
    .returning("*");
  return mapRow(row);
}

export async function getPurchaseOrder(
  passportObjectAddress: string,
): Promise<PurchaseOrder | undefined> {
  const addr = passportObjectAddress.trim().toLowerCase();
  const row = await db("purchase_orders")
    .where("passport_object_address", addr)
    .orderBy("created_at", "desc")
    .first();
  return mapRow(row);
}

export async function getPurchaseOrdersByBuyer(
  buyerAddress: string,
): Promise<PurchaseOrder[]> {
  const addr = buyerAddress.trim().toLowerCase();
  const rows = await db("purchase_orders")
    .where("buyer_address", addr)
    .orderBy("created_at", "desc");
  return rows.map(mapRow).filter(Boolean) as PurchaseOrder[];
}

export async function getPurchaseOrdersByStatus(
  status: PurchaseOrderStatus,
): Promise<PurchaseOrder[]> {
  const rows = await db("purchase_orders")
    .where("status", status)
    .orderBy("created_at", "desc");
  return rows.map(mapRow).filter(Boolean) as PurchaseOrder[];
}

export async function updatePurchaseOrderStatus(
  passportObjectAddress: string,
  status: PurchaseOrderStatus,
): Promise<PurchaseOrder | undefined> {
  const addr = passportObjectAddress.trim().toLowerCase();
  const [row] = await db("purchase_orders")
    .where("passport_object_address", addr)
    .orderBy("created_at", "desc")
    .limit(1)
    .update({ status, updated_at: db.fn.now() })
    .returning("*");
  return mapRow(row);
}

export async function updatePurchaseOrderDelivery(
  id: string,
  delivery: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  },
): Promise<PurchaseOrder | undefined> {
  const [row] = await db("purchase_orders")
    .where("id", id)
    .update({
      delivery_address_line1: delivery.line1,
      delivery_address_line2: delivery.line2 ?? null,
      delivery_city: delivery.city,
      delivery_state: delivery.state ?? null,
      delivery_postal_code: delivery.postalCode,
      delivery_country: delivery.country,
      status: "delivery_requested" as PurchaseOrderStatus,
      updated_at: db.fn.now(),
    })
    .returning("*");
  return mapRow(row);
}
