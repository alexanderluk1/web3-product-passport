import type { Aptos, InputViewFunctionData } from "@aptos-labs/ts-sdk";
import { PASSPORT_GET_FN } from "../constants";
import type { PassportView } from "./types";

export async function getPassport(
  aptos: Aptos,
  passportObjectAddr: string
): Promise<PassportView> {
  const payload: InputViewFunctionData = {
    function: PASSPORT_GET_FN,
    functionArguments: [passportObjectAddr],
  };

  const result = await aptos.view({ payload });

  const [
    issuer,
    serialHash,
    metadataUri,
    metadataHash,
    status,
    transferable,
    createdAtSecs,
  ] = result as any[];

  return {
    issuer: String(issuer),
    serialHash: String(serialHash),
    metadataUri: String(metadataUri),
    metadataHash: String(metadataHash),
    status: Number(status),
    transferable: Boolean(transferable),
    createdAtSecs: String(createdAtSecs),
  };
}
