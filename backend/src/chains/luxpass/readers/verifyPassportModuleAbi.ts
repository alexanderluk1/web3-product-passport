/**
 * Compares on-chain `passport` module entry functions with what the marketplace backend expects.
 * If your wallet shows "Could not find entry function ABI for …::list_passport" / `mint_listing`,
 * republish ProductPassport from `web3/product-passport` to MODULE_ADDRESS (same profile as deployer):
 *
 *   cd web3/product-passport
 *   aptos move publish --assume-yes --named-addresses luxpass=<MODULE_ADDRESS>
 *
 * Use `--profile` / network flags as you normally deploy to devnet.
 */

import { MODULE_ADDRESS } from "../constants";

const FULLNODE_BASE =
  process.env.APTOS_NODE_URL?.replace(/\/$/, "") ||
  process.env.APTOS_FULLNODE_URL?.replace(/\/$/, "") ||
  (() => {
    const n = (process.env.APTOS_NETWORK || "devnet").toLowerCase();
    if (n === "mainnet") {
      return "https://fullnode.mainnet.aptoslabs.com/v1";
    }
    if (n === "testnet") {
      return "https://fullnode.testnet.aptoslabs.com/v1";
    }
    return "https://fullnode.devnet.aptoslabs.com/v1";
  })();

/** Entry functions the listing / verify flows call; must exist on-chain or wallets cannot simulate. */
const REQUIRED_PASSPORT_ENTRY_FUNCTIONS = [
  "list_passport",
  "mint_listing",
  "list_burn",
  "list_burn_lpt",
  "delist_passport",
  "update_metadata",
] as const;

type ExposedFn = { name?: string; is_entry?: boolean };

type ModuleResponse = {
  abi?: { exposed_functions?: ExposedFn[] };
  error_code?: string;
  message?: string;
};

export async function logPassportModuleCompatibility(): Promise<void> {
  if (!MODULE_ADDRESS) {
    return;
  }

  const addr = MODULE_ADDRESS.trim().toLowerCase();
  const url = `${FULLNODE_BASE}/accounts/${addr}/module/passport`;

  try {
    const response = await fetch(url);
    if (response.status === 404) {
      console.warn(
        `[passport-contract] No passport module at ${addr}. Publish web3/product-passport to this address.`
      );
      return;
    }
    if (!response.ok) {
      console.warn(`[passport-contract] Could not fetch ${url} (${response.status}).`);
      return;
    }

    const body = (await response.json()) as ModuleResponse;
    const fns = body.abi?.exposed_functions ?? [];
    const entryNames = new Set(
      fns.filter((f) => f.is_entry && typeof f.name === "string").map((f) => f.name as string)
    );

    const missing = REQUIRED_PASSPORT_ENTRY_FUNCTIONS.filter((name) => !entryNames.has(name));
    if (missing.length > 0) {
      console.warn(
        `[passport-contract] On-chain passport at ${addr} is missing: ${missing.join(", ")}. ` +
          `Wallets will fail simulation for those calls until you republish the Move package (see verifyPassportModuleAbi.ts).`
      );
    } else {
      console.info(`[passport-contract] passport module at ${addr} exposes required marketplace entry functions.`);
    }
  } catch (error) {
    console.warn("[passport-contract] ABI check failed:", error instanceof Error ? error.message : error);
  }
}
