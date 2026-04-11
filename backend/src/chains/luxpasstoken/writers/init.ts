import type { Account, Aptos } from "@aptos-labs/ts-sdk";
import { signSubmit } from "./shared";
import type { SubmitResult } from "./types";

export async function init(
  aptos: Aptos,
  admin: Account,
  signupRewardAmount: number | bigint,
  referralRewardAmount: number | bigint
): Promise<SubmitResult> {
  return signSubmit(aptos, admin, "initialise", [
    BigInt(signupRewardAmount),
    BigInt(referralRewardAmount),
  ]);
}
