import type { Aptos, InputViewFunctionData } from "@aptos-labs/ts-sdk";
import { ESCROW_GET_LISTING_FN } from "../constants";

export type EscrowListingView = {
  seller: string;
  priceOctas: string;
  createdAtSecs: string;
  isActive: boolean;
};

export async function getEscrowListing(
  aptos: Aptos,
  adminAddr: string,
  passportAddr: string,
): Promise<EscrowListingView | null> {
  const payload: InputViewFunctionData = {
    function: ESCROW_GET_LISTING_FN,
    functionArguments: [adminAddr, passportAddr],
  };
  try {
    const result = await aptos.view({ payload });
    const [seller, priceOctas, createdAtSecs, isActive] = result as any[];
    return {
      seller: String(seller),
      priceOctas: String(priceOctas),
      createdAtSecs: String(createdAtSecs),
      isActive: Boolean(isActive),
    };
  } catch {
    return null;
  }
}
