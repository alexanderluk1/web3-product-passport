import type { Account, Aptos } from "@aptos-labs/ts-sdk";
import { LPT_STATE_ADDRESS, lptFunction } from "../constants";
import type { SubmitResult } from "./types";

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

export async function signSubmit(
  aptos: Aptos,
  signer: Account,
  functionName: string,
  functionArguments: unknown[]
): Promise<SubmitResult> {
  try {
    const transaction = await aptos.transaction.build.simple({
      sender: signer.accountAddress,
      data: {
        function: lptFunction(functionName),
        functionArguments,
      },
    });

    const submitted = await aptos.signAndSubmitTransaction({ signer, transaction });
    const executed = await aptos.waitForTransaction({ transactionHash: submitted.hash });

    if (!executed.success) {
      return {
        success: false,
        transactionHash: submitted.hash,
        vmStatus: executed.vm_status,
        error: "Transaction failed on-chain.",
      };
    }

    return {
      success: true,
      transactionHash: submitted.hash,
      vmStatus: executed.vm_status,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to submit transaction.",
    };
  }
}
