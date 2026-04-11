import type { Aptos, InputViewFunctionData } from "@aptos-labs/ts-sdk";
import { lptFunction } from "../constants";
import { asU64, resolveStateAddress } from "./shared";

export async function viewSupply(
  aptos: Aptos,
  stateAddrOverride?: string
): Promise<bigint> {
  const payload: InputViewFunctionData = {
    function: lptFunction("total_supply"),
    functionArguments: [resolveStateAddress(stateAddrOverride)],
  };

  const result = await aptos.view({ payload });
  return asU64((result as unknown[])[0]);
}
