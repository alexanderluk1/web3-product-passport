import type { Aptos, InputViewFunctionData } from "@aptos-labs/ts-sdk";
import { ESCROW_GET_ADDRESS_FN } from "../constants";

export async function getEscrowAddress(
  aptos: Aptos,
  adminAddr: string,
): Promise<string> {
  const payload: InputViewFunctionData = {
    function: ESCROW_GET_ADDRESS_FN,
    functionArguments: [adminAddr],
  };
  const result = await aptos.view({ payload });
  return String(result[0]);
}
