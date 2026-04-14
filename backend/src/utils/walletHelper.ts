/** Canonical Aptos account hex for comparisons (matches chain readers / wallets). */
export function normalizeAddress(address: string): string {
  const normalized = address.trim().toLowerCase();
  if (!normalized.startsWith("0x")) {
    return normalized;
  }
  const hex = normalized.slice(2).replace(/^0+/, "");
  return `0x${hex || "0"}`;
}

export function validateWalletAddress(address: string, fieldName: string): void {
  if (!address || typeof address !== "string") {
    throw new Error(`${fieldName} is required.`);
  }

  if (!/^0x[a-fA-F0-9]+$/.test(address.trim())) {
    throw new Error(`Invalid ${fieldName} format.`);
  }
}