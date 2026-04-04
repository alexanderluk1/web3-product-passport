import type { Aptos, InputViewFunctionData } from "@aptos-labs/ts-sdk";
import { lptFunction } from "../constants";
import { asU64, resolveStateAddress } from "./shared";
import type { RewardConfig } from "./types";

export async function viewRewardConfig(
  aptos: Aptos,
  stateAddrOverride?: string
): Promise<RewardConfig> {
  const payload: InputViewFunctionData = {
    function: lptFunction("get_reward_config"),
    functionArguments: [resolveStateAddress(stateAddrOverride)],
  };

  const result = await aptos.view({ payload });
  const tuple = result as unknown[];

  return {
    signupReward: asU64(tuple[0]),
    referralReward: asU64(tuple[1]),
  };
}
