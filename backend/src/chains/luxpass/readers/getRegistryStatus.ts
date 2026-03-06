import type { Aptos, InputViewFunctionData } from "@aptos-labs/ts-sdk";
import { GET_REGISTRY_FN } from "../constants";
import type { GetRegistryStatusResult } from "./types";

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function isRegistryNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("registry_not_found") ||
    message.includes("e_registry_not_found") ||
    message.includes("resource_not_found") ||
    message.includes("does not exist") ||
    message.includes("move_abort")
  );
}

export async function getRegistryStatus(
  aptos: Aptos,
  registryAddress: string
): Promise<GetRegistryStatusResult> {
  const normalizedRegistryAddress = normalizeAddress(registryAddress);
  const payload: InputViewFunctionData = {
    function: GET_REGISTRY_FN,
    functionArguments: [normalizedRegistryAddress],
  };

  try {
    const result = await aptos.view({ payload });

    const [adminAddress, issuerAddedCount, issuerRemovedCount] = result as [
      string,
      string | number,
      string | number
    ];

    return {
      initialized: true,
      registryAddress: normalizedRegistryAddress,
      adminAddress: normalizeAddress(adminAddress),
      issuerAddedCount: Number(issuerAddedCount),
      issuerRemovedCount: Number(issuerRemovedCount),
    };
  } catch (error) {
    if (isRegistryNotFoundError(error)) {
      return {
        initialized: false,
        registryAddress: normalizedRegistryAddress,
      };
    }

    throw error;
  }
}
