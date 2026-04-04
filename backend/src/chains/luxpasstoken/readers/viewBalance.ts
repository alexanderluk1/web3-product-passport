import type { Aptos, InputViewFunctionData } from "@aptos-labs/ts-sdk";
import { lptFunction } from "../constants";
import { asU64, normaliseAddress, resolveStateAddress } from "./shared";

export async function viewBalance(
  aptos: Aptos,
  ownerAddress: string,
  stateAddrOverride?: string
): Promise<bigint> {
  const payload: InputViewFunctionData = {
    function: lptFunction("balance_of"),
    functionArguments: [
      resolveStateAddress(stateAddrOverride),
      normaliseAddress(ownerAddress),
    ],
  };

  const result = await aptos.view({ payload });
  return asU64((result as unknown[])[0]);
}
