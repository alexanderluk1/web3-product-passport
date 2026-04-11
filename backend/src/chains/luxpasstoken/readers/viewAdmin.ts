import type { Aptos, InputViewFunctionData } from "@aptos-labs/ts-sdk";
import { lptFunction } from "../constants";
import { normaliseAddress, resolveStateAddress } from "./shared";

export async function viewAdmin(
  aptos: Aptos,
  stateAddrOverride?: string
): Promise<string> {
  const payload: InputViewFunctionData = {
    function: lptFunction("admin_of"),
    functionArguments: [resolveStateAddress(stateAddrOverride)],
  };

  const result = await aptos.view({ payload });
  const adminAddress = String((result as unknown[])[0] ?? "");
  return normaliseAddress(adminAddress);
}
