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
  viewSignupClaimed,
  viewSupply,
} from "../../../chains/luxpasstoken/readers";
import {
  creditFiat as writeCreditFiat,
  init as writeInit,
} from "../../../chains/luxpasstoken/writers";
import type { PreparedTransactionPayload } from "../types/lpt.types";

const aptos = makeAptosClient();
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY!;
const DEFAULT_SIGNUP_REWARD = BigInt(process.env.LPT_SIGNUP_REWARD_DEFAULT ?? "10");
const DEFAULT_REFERRAL_REWARD = BigInt(process.env.LPT_REFERRAL_REWARD_DEFAULT ?? "7");
const APT_PURCHASE_PRICE_OCTAS_PER_LPT = BigInt(
  process.env.LPT_APT_PRICE_OCTAS ?? "1000000"
);
const completedAptPurchaseHashes = new Set<string>();

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

function parsePositiveAmount(value: unknown, fieldName = "amount"): bigint {
  const amount = parseAmount(value, fieldName);
  if (amount <= 0n) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }

  return amount;
}

function stateAddress(): string {
  return normaliseAddress(LPT_STATE_ADDRESS, "LPT_STATE_ADDRESS");
}

function aptPurchaseTreasuryAddress(): string {
  return normaliseAddress(
    process.env.LPT_APT_TREASURY_ADDRESS || LPT_STATE_ADDRESS,
    "LPT_APT_TREASURY_ADDRESS"
  );
}

function buildAptTransferPayload(
  recipientAddress: string,
  amountOctas: bigint
): PreparedTransactionPayload {
  return {
    function: "0x1::aptos_account::transfer",
    functionArguments: [
      normaliseAddress(recipientAddress, "recipientAddress"),
      amountOctas,
    ],
  };
}

function buildPayload(functionName: string, functionArguments: unknown[]): PreparedTransactionPayload {
  return {
    function: lptFunction(functionName),
    functionArguments,
  };
}

function normaliseTransactionHash(transactionHash: string): string {
  if (!transactionHash || typeof transactionHash !== "string") {
    throw new Error("paymentTransactionHash is required.");
  }

  const normalised = transactionHash.trim().toLowerCase();
  if (!/^0x[a-f0-9]+$/.test(normalised)) {
    throw new Error("paymentTransactionHash must be a valid 0x-prefixed hex string.");
  }

  return normalised;
}

function getPayloadFunction(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const value = (payload as { function?: unknown }).function;
  return typeof value === "string" ? value.toLowerCase() : "";
}

function getPayloadArguments(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const payloadObject = payload as {
    arguments?: unknown;
    function_arguments?: unknown;
    functionArguments?: unknown;
  };
  const args =
    payloadObject.arguments ??
    payloadObject.function_arguments ??
    payloadObject.functionArguments;

  return Array.isArray(args) ? args : [];
}

function parseOnChainInteger(value: unknown, fieldName: string): bigint {
  const asString = String(value ?? "").trim();
  if (!/^\d+$/.test(asString)) {
    throw new Error(`${fieldName} was not present as an on-chain integer.`);
  }

  return BigInt(asString);
}

function isSuccessfulUserTransaction(transaction: unknown): boolean {
  if (!transaction || typeof transaction !== "object") {
    return false;
  }

  const tx = transaction as { type?: unknown; success?: unknown };
  return tx.type === "user_transaction" && tx.success === true;
}

async function verifyAptPurchasePayment(params: {
  paymentTransactionHash: string;
  buyerAddress: string;
  treasuryAddress: string;
  requiredAptOctas: bigint;
}): Promise<void> {
  const {
    paymentTransactionHash,
    buyerAddress,
    treasuryAddress,
    requiredAptOctas,
  } = params;

  const executed = await aptos.waitForTransaction({ transactionHash: paymentTransactionHash });
  const transaction = await aptos.getTransactionByHash({ transactionHash: paymentTransactionHash });

  if (!executed.success || !isSuccessfulUserTransaction(transaction)) {
    throw new Error("APT payment transaction was not successful.");
  }

  const tx = transaction as {
    sender?: unknown;
    payload?: unknown;
  };
  const sender = normaliseAddress(String(tx.sender ?? ""), "payment sender");
  if (sender !== buyerAddress) {
    throw new Error("APT payment sender does not match authenticated wallet.");
  }

  const payloadFunction = getPayloadFunction(tx.payload);
  if (payloadFunction !== "0x1::aptos_account::transfer") {
    throw new Error("APT payment transaction is not an APT transfer.");
  }

  const args = getPayloadArguments(tx.payload);
  const recipient = normaliseAddress(String(args[0] ?? ""), "payment recipient");
  const amountOctas = parseOnChainInteger(args[1], "payment amount");

  if (recipient !== treasuryAddress) {
    throw new Error("APT payment recipient does not match treasury wallet.");
  }

  if (amountOctas < requiredAptOctas) {
    throw new Error("APT payment amount is lower than the quoted price.");
  }
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

function getAdminAccountAddress(): string {
  return normaliseAddress(String(getAdminAccount().accountAddress), "ADMIN_PRIVATE_KEY address");
}

async function ensureBackendSignerIsLptAdmin(): Promise<void> {
  const configuredStateAddress = stateAddress();
  const onChainAdmin = await viewAdmin(aptos, configuredStateAddress);
  const backendAdmin = getAdminAccountAddress();

  if (normaliseAddress(onChainAdmin, "LPT admin address") !== backendAdmin) {
    throw new Error(
      `Backend signer ${backendAdmin} is not the LPT admin for state ${configuredStateAddress}. Current LPT admin is ${onChainAdmin}.`
    );
  }
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
  getAptPurchaseRate(): {
    priceOctasPerLpt: bigint;
    treasuryAddress: string;
  } {
    return {
      priceOctasPerLpt: APT_PURCHASE_PRICE_OCTAS_PER_LPT,
      treasuryAddress: aptPurchaseTreasuryAddress(),
    };
  },

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

  async getSignupClaimed(ownerAddress: string): Promise<{ ownerAddress: string; claimed: boolean }> {
    await ensureLptInfrastructureInitialised();
    const owner = normaliseAddress(ownerAddress, "ownerAddress");
    const claimed = await viewSignupClaimed(owner);
    return { ownerAddress: owner, claimed };
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

  async prepareAptPurchase(
    buyerAddress: string,
    lptAmount: unknown
  ): Promise<{
    payload: PreparedTransactionPayload;
    buyerAddress: string;
    treasuryAddress: string;
    lptAmount: bigint;
    aptAmountOctas: bigint;
    priceOctasPerLpt: bigint;
  }> {
    await ensureLptInfrastructureInitialised();
    await ensureBackendSignerIsLptAdmin();

    const buyer = normaliseAddress(buyerAddress, "buyerAddress");
    const amount = parsePositiveAmount(lptAmount, "lptAmount");
    const treasuryAddress = aptPurchaseTreasuryAddress();
    const aptAmountOctas = amount * APT_PURCHASE_PRICE_OCTAS_PER_LPT;

    return {
      payload: buildAptTransferPayload(treasuryAddress, aptAmountOctas),
      buyerAddress: buyer,
      treasuryAddress,
      lptAmount: amount,
      aptAmountOctas,
      priceOctasPerLpt: APT_PURCHASE_PRICE_OCTAS_PER_LPT,
    };
  },

  async completeAptPurchase(
    buyerAddress: string,
    lptAmount: unknown,
    paymentTransactionHash: string
  ): Promise<{
    buyerAddress: string;
    lptAmount: bigint;
    aptAmountOctas: bigint;
    priceOctasPerLpt: bigint;
    treasuryAddress: string;
    paymentTransactionHash: string;
    creditTransactionHash: string;
    creditVmStatus?: string;
  }> {
    await ensureLptInfrastructureInitialised();
    await ensureBackendSignerIsLptAdmin();

    const buyer = normaliseAddress(buyerAddress, "buyerAddress");
    const amount = parsePositiveAmount(lptAmount, "lptAmount");
    const transactionHash = normaliseTransactionHash(paymentTransactionHash);
    const treasuryAddress = aptPurchaseTreasuryAddress();
    const aptAmountOctas = amount * APT_PURCHASE_PRICE_OCTAS_PER_LPT;

    if (completedAptPurchaseHashes.has(transactionHash)) {
      throw new Error("APT payment transaction has already been credited.");
    }

    await verifyAptPurchasePayment({
      paymentTransactionHash: transactionHash,
      buyerAddress: buyer,
      treasuryAddress,
      requiredAptOctas: aptAmountOctas,
    });

    const creditResult = await writeCreditFiat(aptos, getAdminAccount(), buyer, amount);
    if (!creditResult.success) {
      throw new Error(
        `Failed to credit LPT after APT payment. ${creditResult.vmStatus ?? creditResult.error}`.trim()
      );
    }

    completedAptPurchaseHashes.add(transactionHash);

    return {
      buyerAddress: buyer,
      lptAmount: amount,
      aptAmountOctas,
      priceOctasPerLpt: APT_PURCHASE_PRICE_OCTAS_PER_LPT,
      treasuryAddress,
      paymentTransactionHash: transactionHash,
      creditTransactionHash: creditResult.transactionHash,
      creditVmStatus: creditResult.vmStatus,
    };
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
