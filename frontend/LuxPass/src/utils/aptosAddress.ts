/** Canonical Aptos account hex (trim, lower, strip redundant leading zeros after 0x). */
export function normalizeAptosAddress(address: string): string {
  const normalized = address.trim().toLowerCase();
  if (!normalized.startsWith("0x")) {
    return normalized;
  }
  const hex = normalized.slice(2).replace(/^0+/, "");
  return `0x${hex || "0"}`;
}
