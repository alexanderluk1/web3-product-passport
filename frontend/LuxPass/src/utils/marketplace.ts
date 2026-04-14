const BASE_URL = "http://localhost:3001";

export interface MarketplaceListing {
  passportObjectAddress: string;
  ownerAddress: string;
  priceOctas: string;
  inEscrow: boolean;
  productName?: string;
  brand?: string;
  category?: string;
  listedAt: string;
}

export interface EscrowListingDetail {
  seller: string;
  priceOctas: string;
  createdAtSecs: string;
  isActive: boolean;
}

export interface PurchaseOrder {
  id: string;
  passport_object_address: string;
  buyer_address: string;
  seller_address: string;
  price_octas: string;
  purchase_tx_hash?: string;
  status: string;
  created_at: string;
}

export async function fetchMarketplaceListings(): Promise<MarketplaceListing[]> {
  const res = await fetch(`${BASE_URL}/api/escrow/marketplace`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.payload ?? [];
}

export async function fetchEscrowListing(
  passportObjectAddress: string,
): Promise<EscrowListingDetail | null> {
  const res = await fetch(
    `${BASE_URL}/api/escrow/listing/${passportObjectAddress}`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.payload ?? null;
}

export async function fetchMyPurchases(
  accessToken: string,
): Promise<PurchaseOrder[]> {
  const res = await fetch(`${BASE_URL}/api/escrow/purchases/mine`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.payload ?? [];
}
