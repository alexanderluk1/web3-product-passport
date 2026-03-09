export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function validateWalletAddress(address: string, fieldName: string): void {
  if (!address || typeof address !== "string") {
    throw new Error(`${fieldName} is required.`);
  }

  if (!/^0x[a-fA-F0-9]+$/.test(address.trim())) {
    throw new Error(`Invalid ${fieldName} format.`);
  }
}