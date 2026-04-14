import type { Aptos, InputViewFunctionData } from "@aptos-labs/ts-sdk";
import { PROTOCOL_TREASURY_GET_ADDRESS_FN } from "../constants";

export async function getProtocolTreasuryAddress(
  aptos: Aptos,
  adminAddr: string,
): Promise<string> {
  const payload: InputViewFunctionData = {
    function: PROTOCOL_TREASURY_GET_ADDRESS_FN as `${string}::${string}::${string}`,
    functionArguments: [adminAddr],
  };
  const result = await aptos.view({ payload });
  return String(result[0]);
}
