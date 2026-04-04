import { makeAptosClient } from "../../../config/aptos";
import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
import {
  lptFunction,
  LPT_STATE_ADDRESS,
} from "../../../chains/luxpasstoken/constants";
import {
  viewAdmin,
  viewBalance,
  viewPool,
  viewRewardConfig,
  viewSupply,
} from "../../../chains/luxpasstoken/readers";
import { init as writeInit } from "../../../chains/luxpasstoken/writers";
import type { PreparedTransactionPayload } from "../types/lpt.types";

const aptos = makeAptosClient();
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY!;
const DEFAULT_SIGNUP_REWARD = BigInt(process.env.LPT_SIGNUP_REWARD_DEFAULT ?? "10");
const DEFAULT_REFERRAL_REWARD = BigInt(process.env.LPT_REFERRAL_REWARD_DEFAULT ?? "7");

function normaliseAddress(address: string, fieldName: string): string {
  if (!address || typeof address !== "string") {
    throw new Error(`${fieldName} is required.`);
  }

  const normalised = address.trim().toLowerCase();
  if (!/^0x[a-f0-9]+$/.test(normalised)) {
    throw new Error(`${fieldName} must be a valid 0x-prefixed hex address.`);
  }

  return normalised;
}

function parseAmount(value: unknown, fieldName = "amount"): bigint {
  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new Error(`${fieldName} must be non-negative.`);
    }
    return value;
  }

  const asString = String(value ?? "").trim();
  if (!/^\d+$/.test(asString)) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }

  return BigInt(asString);
}

function stateAddress(): string {
  return normaliseAddress(LPT_STATE_ADDRESS, "LPT_STATE_ADDRESS");
}

function buildPayload(functionName: string, functionArguments: unknown[]): PreparedTransactionPayload {
  return {
    function: lptFunction(functionName),
    functionArguments,
  };
}

function isStateNotInitialisedError(error: unknown): boolean {
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

function getAdminAccount(): Account {
  if (!ADMIN_PRIVATE_KEY) {
    throw new Error("ADMIN_PRIVATE_KEY is not configured.");
  }

  const privateKey = new Ed25519PrivateKey(ADMIN_PRIVATE_KEY);
  return Account.fromPrivateKey({ privateKey });
}

async function ensureLptInfrastructureInitialised(): Promise<void> {
  const configuredStateAddress = stateAddress();

  try {
    const adminAddress = await viewAdmin(aptos, configuredStateAddress);
    if (adminAddress) {
      return;
    }
  } catch (error) {
    if (!isStateNotInitialisedError(error)) {
      throw error;
    }
  }

  const adminAccount = getAdminAccount();
  const adminAddress = normaliseAddress(adminAccount.accountAddress.toString(), "adminAddress");
  if (adminAddress !== configuredStateAddress) {
    throw new Error(
      "LPT_STATE_ADDRESS must match ADMIN_PRIVATE_KEY account address for auto-init."
    );
  }

  const result = await writeInit(
    aptos,
    adminAccount,
    DEFAULT_SIGNUP_REWARD,
    DEFAULT_REFERRAL_REWARD
  );

  if (!result.success) {
    throw new Error(
      `Failed to initialise LuxPassToken state. ${result.vmStatus ?? result.error}`.trim()
    );
  }
}

export type LptStatus = {
  initialised: boolean;
  adminAddress: string | null;
};


export const lptService = {
  // Health Check
  async getStatus(): Promise<LptStatus> {
    const configuredStateAddress = stateAddress();

    try {
      const adminAddress = await viewAdmin(aptos, configuredStateAddress);
      return {
        initialised: true,
        adminAddress: adminAddress || null,
      };
    } catch (error) {
      if (isStateNotInitialisedError(error)) {
        return { initialised: false, adminAddress: null };
      }
      throw error;
    }
  },

  async getBalance(ownerAddress: string): Promise<{ balance: bigint; ownerAddress: string }> {
    await ensureLptInfrastructureInitialised();
    const owner = normaliseAddress(ownerAddress, "ownerAddress");
    const balance = await viewBalance(aptos, owner);
    return { balance, ownerAddress: owner };
  },

  async getSupply(): Promise<{ totalSupply: bigint }> {
    await ensureLptInfrastructureInitialised();
    const totalSupply = await viewSupply(aptos);
    return { totalSupply };
  },

  async getPool(): Promise<{ subsidyPoolBalance: bigint }> {
    await ensureLptInfrastructureInitialised();
    const subsidyPoolBalance = await viewPool(aptos);
    return { subsidyPoolBalance };
  },

  async getAdmin(): Promise<{ adminAddress: string }> {
    await ensureLptInfrastructureInitialised();
    const adminAddress = await viewAdmin(aptos);
    return { adminAddress };
  },

  async getRewardConfig(): Promise<{ signupReward: bigint; referralReward: bigint }> {
    await ensureLptInfrastructureInitialised();
    return viewRewardConfig(aptos);
  },

  prepareInit(signupRewardAmount: unknown, referralRewardAmount: unknown): PreparedTransactionPayload {
    return buildPayload("initialise", [
      parseAmount(signupRewardAmount, "signupRewardAmount"),
      parseAmount(referralRewardAmount, "referralRewardAmount"),
    ]);
  },

  async prepareMint(recipientAddress: string, amount: unknown): Promise<PreparedTransactionPayload> {
    await ensureLptInfrastructureInitialised();
    return buildPayload("mint", [
      stateAddress(),
      normaliseAddress(recipientAddress, "recipientAddress"),
      parseAmount(amount),
    ]);
  },

  async prepareTransfer(
    recipientAddress: string,
    amount: unknown
  ): Promise<PreparedTransactionPayload> {
    await ensureLptInfrastructureInitialised();
    return buildPayload("transfer", [
      stateAddress(),
      normaliseAddress(recipientAddress, "recipientAddress"),
      parseAmount(amount),
    ]);
  },

  async prepareBurn(amount: unknown): Promise<PreparedTransactionPayload> {
    await ensureLptInfrastructureInitialised();
    return buildPayload("burn", [stateAddress(), parseAmount(amount)]);
  },

  async prepareClaimSignup(): Promise<PreparedTransactionPayload> {
    await ensureLptInfrastructureInitialised();
    return buildPayload("claim_signup_reward", [stateAddress()]);
  },

  async prepareClaimReferral(referrerAddress: string): Promise<PreparedTransactionPayload> {
    await ensureLptInfrastructureInitialised();
    return buildPayload("claim_referral_reward", [
      stateAddress(),
      normaliseAddress(referrerAddress, "referrerAddress"),
    ]);
  },

  async prepareCreditFiat(
    buyerAddress: string,
    amount: unknown
  ): Promise<PreparedTransactionPayload> {
    await ensureLptInfrastructureInitialised();
    return buildPayload("credit_fiat_purchase", [
      stateAddress(),
      normaliseAddress(buyerAddress, "buyerAddress"),
      parseAmount(amount),
    ]);
  },

  async prepareDeposit(amount: unknown): Promise<PreparedTransactionPayload> {
    await ensureLptInfrastructureInitialised();
    return buildPayload("deposit_to_subsidy_pool", [stateAddress(), parseAmount(amount)]);
  },

  async prepareAllocate(
    recipientAddress: string,
    amount: unknown
  ): Promise<PreparedTransactionPayload> {
    await ensureLptInfrastructureInitialised();
    return buildPayload("allocate_subsidy", [
      stateAddress(),
      normaliseAddress(recipientAddress, "recipientAddress"),
      parseAmount(amount),
    ]);
  },

  async preparePayFee(
    treasuryAddress: string,
    amount: unknown
  ): Promise<PreparedTransactionPayload> {
    await ensureLptInfrastructureInitialised();
    return buildPayload("pay_platform_fee", [
      stateAddress(),
      normaliseAddress(treasuryAddress, "treasuryAddress"),
      parseAmount(amount),
    ]);
  },

  async prepareBurnForService(amount: unknown): Promise<PreparedTransactionPayload> {
    await ensureLptInfrastructureInitialised();
    return buildPayload("burn_for_passport_service", [stateAddress(), parseAmount(amount)]);
  },
};
