import type { Aptos, InputViewFunctionData } from "@aptos-labs/ts-sdk";
import { LOOKUP_BY_PRODUCT_FN, REGISTRY_ADDRESS } from "../constants";

export async function resolvePassportObjAddrByProductId(
  aptos: Aptos,
  productId: string
): Promise<string> {
  const productIdBytes = Buffer.from(productId, "utf8");

  const payload: InputViewFunctionData = {
    function: LOOKUP_BY_PRODUCT_FN,
    functionArguments: [REGISTRY_ADDRESS, productIdBytes],
  };

  const result = await aptos.view({ payload });
  return String((result as any[])[0]);
}
