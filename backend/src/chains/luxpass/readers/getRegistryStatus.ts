import type { Aptos, InputViewFunctionData } from "@aptos-labs/ts-sdk";
import { GET_REGISTRY_FN } from "../constants";
import type { GetRegistryStatusResult } from "./types";

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function collectErrorText(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
  } else {
    parts.push(String(error ?? ""));
  }
  const data = (error as { data?: { message?: unknown } })?.data;
  if (data && typeof data.message === "string") {
    parts.push(data.message);
  }
  return parts.join(" ");
}

function isRegistryNotFoundError(error: unknown): boolean {
  const message = collectErrorText(error).toLowerCase();

  return (
    message.includes("registry_not_found") ||
    message.includes("e_registry_not_found") ||
    message.includes("abort code: 3") ||
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

  console.info("[chain:getRegistryStatus] aptos.view request", {
    function: payload.function,
    functionArguments: payload.functionArguments,
  });

  try {
    const result = await aptos.view({ payload });

    const [adminAddress, issuerAddedCount, issuerRemovedCount] = result as [
      string,
      string | number,
      string | number
    ];

    console.info("[chain:getRegistryStatus] aptos.view success", {
      registryAddress: normalizedRegistryAddress,
      adminAddress,
      issuerAddedCount,
      issuerRemovedCount,
    });

    return {
      initialized: true,
      registryAddress: normalizedRegistryAddress,
      adminAddress: normalizeAddress(adminAddress),
      issuerAddedCount: Number(issuerAddedCount),
      issuerRemovedCount: Number(issuerRemovedCount),
    };
  } catch (error) {
    const registryNotFound = isRegistryNotFoundError(error);
    console.error("[chain:getRegistryStatus] aptos.view failed", {
      function: payload.function,
      functionArguments: payload.functionArguments,
      registryAddress: normalizedRegistryAddress,
      registryNotFound,
      error,
    });

    if (registryNotFound) {
      return {
        initialized: false,
        registryAddress: normalizedRegistryAddress,
      };
    }

    throw error;
  }
}
