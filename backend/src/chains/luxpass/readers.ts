import type { Aptos, InputViewFunctionData } from "@aptos-labs/ts-sdk";
import { PASSPORT_GET_FN, LOOKUP_BY_PRODUCT_FN, REGISTRY_ADDRESS } from "./constants";

export type PassportView = {
  issuer: string;
  serialHash: string;     // hex string
  metadataUri: string;
  metadataHash: string;   // hex string
  status: number;
  transferable: boolean;
  createdAtSecs: string;  // returned as string sometimes
};

export async function resolvePassportObjAddrByProductId(
  aptos: Aptos, productId: string
): Promise<string> {

  // encodes string into raw bytes using UTF-8 and returns an array of bytes
  const productIdBytes = Buffer.from(productId, "utf8"); 

  const payload: InputViewFunctionData = {
    function: LOOKUP_BY_PRODUCT_FN,
    functionArguments: [REGISTRY_ADDRESS, productIdBytes],
  };

  const result = await aptos.view({ payload });

  // view method returns an array of return values; but the func returns a single address, so we need to extract
  return String((result as any[])[0]);
}

export async function getPassport(aptos: Aptos, passportObjectAddr: string): Promise<PassportView> {
  const payload: InputViewFunctionData = {
    function: PASSPORT_GET_FN,
    functionArguments: [passportObjectAddr],
    // typeArguments: [] // none for your function
  };

  // aptos.view returns an array of values (one per return value)
  const result = await aptos.view({ payload }); 

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