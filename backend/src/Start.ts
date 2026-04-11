import "dotenv/config";
import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
import { makeAptosClient } from "./config/aptos.js";
import { REGISTRY_ADDRESS } from "./chains/luxpass/constants.js";
import { getRegistryStatus } from "./chains/luxpass/readers/getRegistryStatus.js";
import { resolvePassportObjAddrByProductId } from "./chains/luxpass/readers/resolvePassportObjAddrByProductId.js";
import { initRegistry } from "./chains/luxpass/writers/initRegistry.js";
import { viewAdmin } from "./chains/luxpasstoken/readers/viewAdmin.js";
import { init as lptInit } from "./chains/luxpasstoken/writers/init.js";
import { createApp } from "./app.js";

const PASSPORT_PROBE_ID = "__luxpass_passport_init_probe__";

function fail(message: string): never {
  console.error(`[preflight] ${message}`);
  process.exit(1);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) {
    fail(`${name} not set in env`);
  }
  return v.trim();
}

function hasMoveAbortCode(error: unknown, code: number): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes(`abort code: ${code}`) ||
    message.includes(`abort_code: ${code}`) ||
    message.includes(`code ${code}`)
  );
}

function isIndexNotInitialisedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes("e_index_not_initialised") || hasMoveAbortCode(error, 3);
}

function isProductNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes("e_product_not_found") || hasMoveAbortCode(error, 21);
}

/** LPTState missing: views use invalid_input + borrow failure (vm 4008), not always "resource_not_found". */
function isLptStateNotInitialisedError(error: unknown): boolean {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: { vm_error_code?: number; message?: string } }).data;
    if (data?.vm_error_code === 4008) {
      return true;
    }
    const msg = data?.message?.toLowerCase() ?? "";
    if (msg.includes("failed to borrow global resource")) {
      return true;
    }
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("resource_not_found") ||
    message.includes("does not exist") ||
    message.includes("move_abort") ||
    message.includes("abort code: 1") ||
    message.includes("abort_code: 1") ||
    message.includes("failed to borrow global resource") ||
    message.includes("vm_error_code: 4008")
  );
}

// Aptos: package not published at MODULE_ADDRESS OR wrong network
function isModuleNotFoundError(error: unknown): boolean {
  if (error && typeof error === "object" && "data" in error) {
    const code = (error as { data?: { error_code?: string } }).data?.error_code;
    if (code === "module_not_found") {
      return true;
    }
  }
  if (error instanceof Error) {
    const m = error.message.toLowerCase();
    return m.includes("module_not_found") || m.includes("module not found");
  }
  return false;
}

function normaliseAddress(address: string): string {
  return address.trim().toLowerCase();
}

function requireAdminPrivateKey(): void {
  if (!process.env.ADMIN_PRIVATE_KEY?.trim()) {
    fail(
      "ADMIN_PRIVATE_KEY not set"
    );
  }
}

// Load the admin signer, fails process if key missing or invalid
function getAdminAccount(): Account {
  requireAdminPrivateKey();
  const privateKey = new Ed25519PrivateKey(process.env.ADMIN_PRIVATE_KEY!.trim());
  return Account.fromPrivateKey({ privateKey });
}


// Ensures issuer registry + passport supporting resources exist on chain.
async function ensurePassportInfra(): Promise<void> {
  const aptos = makeAptosClient();
  let registry: Awaited<ReturnType<typeof getRegistryStatus>>;
  try {
    registry = await getRegistryStatus(aptos, REGISTRY_ADDRESS);
  } catch (error) {
    if (isModuleNotFoundError(error)) {
      const mod = process.env.MODULE_ADDRESS ?? "(MODULE_ADDRESS not set)";
      fail(
        `No Move modules at MODULE_ADDRESS on this network (e.g. issuer_registry missing). ` +
          `This is not the same as "init not run" — the package is not published there. ` +
          `Publish web3/product-passport with aptos move publish using the account that matches MODULE_ADDRESS (${mod}), ` +
          `and ensure APTOS_NETWORK matches that chain (e.g. devnet).`
      );
    }
    throw error;
  }

  let needsInit = false;

  if (!registry.initialized) {
    needsInit = true;
    console.log("[preflight] Issuer registry not initialised.");
  } else {
    try {
      await resolvePassportObjAddrByProductId(aptos, PASSPORT_PROBE_ID);
      console.log("[preflight] Passport index probe succeeded");
      return;
    } catch (error) {
      if (isProductNotFoundError(error)) {
        console.log("[preflight] Passport index exists, missing ok");
        return;
      }
      if (isIndexNotInitialisedError(error)) {
        needsInit = true;
        console.log("[preflight] Passport index not init-ed.");
      } else {
        throw error;
      }
    }
  }

  if (!needsInit) {
    return;
  }

  requireAdminPrivateKey();
  console.log("[preflight] Submitting registry + passport init transactions…");
  const result = await initRegistry(aptos);
  if (!result.success) {
    fail(
      `Passport/registry init failed. vmStatus=${result.vmStatus ?? "n/a"} hash=${result.transactionHash ?? "n/a"}`
    );
  }
  console.log("[preflight] Passport/registry init completed.", result.transactionHash);
}

async function ensureLptInfra(): Promise<void> {
  requireEnv("LPT_MODULE_ADDRESS");
  const stateAddr = requireEnv("LPT_STATE_ADDRESS");
  const aptos = makeAptosClient();

  try {
    const adminAddress = await viewAdmin(aptos, stateAddr);
    if (adminAddress) {
      console.log("[preflight] LPTState exists; admin:", adminAddress);
      return;
    }
  } catch (error) {
    if (!isLptStateNotInitialisedError(error)) {
      throw error;
    }
  }

  console.log("[preflight] LPTState not found; running initialise…");

  const adminAccount = getAdminAccount();
  const adminFromKey = normaliseAddress(adminAccount.accountAddress.toString());
  if (adminFromKey !== normaliseAddress(stateAddr)) {
    fail(
      "LPT_STATE_ADDRESS != ADMIN_PRIVATE_KEY's addr"
    );
  }

  const signup = BigInt(process.env.LPT_SIGNUP_REWARD_DEFAULT ?? "10");
  const referral = BigInt(process.env.LPT_REFERRAL_REWARD_DEFAULT ?? "7");

  const result = await lptInit(aptos, adminAccount, signup, referral);
  if (!result.success) {
    const detail = "error" in result ? result.error : "";
    fail(`LuxPassToken init failed: ${result.vmStatus ?? ""} ${detail}`.trim());
  }
  console.log("[preflight] LuxPassToken init completed", result.transactionHash);
}

async function main(): Promise<void> {
  requireEnv("MODULE_ADDRESS");
  requireEnv("REGISTRY_ADDRESS");

  console.log("[preflight] Checking passport / registry…");
  await ensurePassportInfra();

  console.log("[preflight] Checking LuxPassToken…");
  await ensureLptInfra();

  console.log("[preflight] Starting server…");
  const port = Number(process.env.PORT || 3001);
  const app = createApp();
  app.listen(port, () => {
    console.log(`[backend] listening on http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error("[preflight] Unhandled error:", error);
  process.exit(1);
});
