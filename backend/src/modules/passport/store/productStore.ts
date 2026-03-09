import { IssuerProduct, IssuerProductCacheEntry } from "../types/passport.types";

const issuerProductStore = new Map<string, IssuerProductCacheEntry>();

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function getIssuerProductsFromStore(
  issuerAddress: string
): IssuerProductCacheEntry | undefined {
  return issuerProductStore.get(normalizeAddress(issuerAddress));
}

export function saveIssuerProductsToStore(
  issuerAddress: string,
  products: IssuerProduct[]
): IssuerProductCacheEntry {
  const normalized = normalizeAddress(issuerAddress);

  const entry: IssuerProductCacheEntry = {
    syncedAt: Date.now(),
    products,
  };

  issuerProductStore.set(normalized, entry);
  return entry;
}

export function clearIssuerProductsFromStore(issuerAddress: string): void {
  issuerProductStore.delete(normalizeAddress(issuerAddress));
}