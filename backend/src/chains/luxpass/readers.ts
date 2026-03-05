import type { Aptos, InputViewFunctionData } from "@aptos-labs/ts-sdk";
import { PASSPORT_GET_FN } from "./constants";

export type PassportView = {
  issuer: string;
  serialHash: string;     // hex string
  metadataUri: string;
  metadataHash: string;   // hex string
  status: number;
  transferable: boolean;
  createdAtSecs: string;  // returned as string sometimes
};

export async function getPassport(aptos: Aptos, passportObjectAddr: string): Promise<PassportView> {
  const payload: InputViewFunctionData = {
    function: PASSPORT_GET_FN,
    functionArguments: [passportObjectAddr],
    // typeArguments: [] // none for your function
  };

  // aptos.view returns an array of values (one per return value)
  const result = await aptos.view({ payload }); //  [oai_citation:1‡Aptos Documentation](https://aptos.dev/build/sdks/ts-sdk/fetch-data-via-sdk?utm_source=chatgpt.com)

  // Your Move function returns:
  // (address, vector<u8>, String, vector<u8>, u8, bool, u64)
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