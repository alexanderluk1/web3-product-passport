import { LPT_MODULE_ADDRESS } from "../constants";
import { normaliseAddress, resolveStateAddress } from "./shared";

const FULLNODE_URL =
  process.env.APTOS_FULLNODE_URL || "https://fullnode.devnet.aptoslabs.com/v1";

type SignupRewardEvent = {
  data?: {
    user?: string;
  };
};

export async function viewSignupClaimed(ownerAddress: string): Promise<boolean> {
  const stateAddress = resolveStateAddress();
  const owner = normaliseAddress(ownerAddress);
  const eventsStructTag = `${LPT_MODULE_ADDRESS}::lux_pass_token::LPTState`;

  const response = await fetch(
    `${FULLNODE_URL}/accounts/${stateAddress}/events/${eventsStructTag}/signup_events?limit=1000`
  );

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch signup reward events from Aptos: ${response.status}`);
  }

  const events = (await response.json()) as SignupRewardEvent[];
  return events.some((event) => normaliseAddress(String(event.data?.user ?? "")) === owner);
}
