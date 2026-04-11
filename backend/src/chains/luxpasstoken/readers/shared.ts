import { LPT_STATE_ADDRESS } from "../constants";

export function asU64(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(Math.trunc(value));
  }
  return BigInt(String(value));
}

export function normaliseAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function resolveStateAddress(stateAddrOverride?: string): string {
  const address = stateAddrOverride ?? LPT_STATE_ADDRESS;
  if (!address) {
    throw new Error("LPT_STATE_ADDRESS is not set (or pass stateAddr explicitly).");
  }
  return normaliseAddress(address);
}
