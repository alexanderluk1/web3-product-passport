import { AccountAddress } from "@aptos-labs/ts-sdk";
import type { Aptos } from "@aptos-labs/ts-sdk";
import { normalizeAddress } from "../../../utils/walletHelper";
import {
  PASSPORT_LIST_BURN_FN,
  PASSPORT_LIST_BURN_LPT_FN,
} from "../../../chains/luxpass/constants";
import { LPT_STATE_ADDRESS } from "../../../chains/luxpasstoken/constants";

const LPT_TREASURY_ADDRESS =
  process.env.LPT_TREASURY_ADDRESS || process.env.LPT_STATE_ADDRESS || "";

/** LPT burn leg (matches passport mint-with-burn default). */
export const DEFAULT_LISTING_NO_PASSPORT_LPT_BURN = BigInt(
  process.env.LISTING_NO_PASSPORT_LPT_BURN ?? "4"
);
/** APT leg for `list_burn` (octas; default 0.05 APT like passport APT service fee). */
export const DEFAULT_LISTING_NO_PASSPORT_APT_OCTAS = BigInt(
  process.env.LISTING_NO_PASSPORT_APT_OCTAS ?? "5000000"
);
/** LPT treasury fee for `list_burn_lpt` (default 1 LPT). */
export const DEFAULT_LISTING_NO_PASSPORT_LPT_GAS = BigInt(
  process.env.LISTING_NO_PASSPORT_LPT_GAS ?? "1"
);

const usedDepositTxHashes = new Set<string>();

function sameAptosAddress(a: string, b: string): boolean {
  try {
    return AccountAddress.from(a).toStringLong() === AccountAddress.from(b).toStringLong();
  } catch {
    return false;
  }
}

function normaliseTxHash(hash: string): string {
  const h = hash.trim().toLowerCase();
  if (!/^0x[a-f0-9]+$/.test(h)) {
    throw new Error("Invalid transaction hash.");
  }
  return h;
}

function getPayloadFunction(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const fn = (payload as { function?: unknown }).function;
  return typeof fn === "string" ? fn.trim().toLowerCase() : "";
}

function getPayloadArguments(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const o = payload as {
    arguments?: unknown;
    function_arguments?: unknown;
    functionArguments?: unknown;
  };
  const args = o.arguments ?? o.function_arguments ?? o.functionArguments;
  return Array.isArray(args) ? args : [];
}

function parseU64Arg(value: unknown, field: string): bigint {
  const s = String(value ?? "").trim();
  if (!/^\d+$/.test(s)) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
  return BigInt(s);
}

function treasuryAptRecipient(): string {
  const raw = process.env.LISTING_NO_PASSPORT_APT_TREASURY?.trim() || LPT_TREASURY_ADDRESS;
  if (!raw) {
    throw new Error("Set LPT_TREASURY_ADDRESS or LISTING_NO_PASSPORT_APT_TREASURY for listing APT deposit.");
  }
  return normalizeAddress(raw);
}

function treasuryLptRecipient(): string {
  const raw = LPT_TREASURY_ADDRESS.trim();
  if (!raw) {
    throw new Error("LPT_TREASURY_ADDRESS is required for listing LPT deposit.");
  }
  return normalizeAddress(raw);
}

export function getNoPassportListingBurnConfig(): {
  lptStateAddress: string;
  lptBurnAmount: bigint;
  aptTreasuryAddress: string;
  aptAmountOctas: bigint;
  lptTreasuryAddress: string;
  lptGasFeeAmount: bigint;
} {
  return {
    lptStateAddress: normalizeAddress(LPT_STATE_ADDRESS),
    lptBurnAmount: DEFAULT_LISTING_NO_PASSPORT_LPT_BURN,
    aptTreasuryAddress: treasuryAptRecipient(),
    aptAmountOctas: DEFAULT_LISTING_NO_PASSPORT_APT_OCTAS,
    lptTreasuryAddress: treasuryLptRecipient(),
    lptGasFeeAmount: DEFAULT_LISTING_NO_PASSPORT_LPT_GAS,
  };
}

export function buildListBurnPayload(): {
  function: string;
  functionArguments: (string | bigint)[];
} {
  const c = getNoPassportListingBurnConfig();
  return {
    function: PASSPORT_LIST_BURN_FN,
    functionArguments: [
      c.lptStateAddress,
      c.lptBurnAmount,
      c.aptTreasuryAddress,
      c.aptAmountOctas,
    ],
  };
}

export function buildListBurnLptPayload(): {
  function: string;
  functionArguments: (string | bigint)[];
} {
  const c = getNoPassportListingBurnConfig();
  return {
    function: PASSPORT_LIST_BURN_LPT_FN,
    functionArguments: [
      c.lptStateAddress,
      c.lptBurnAmount,
      c.lptTreasuryAddress,
      c.lptGasFeeAmount,
    ],
  };
}

export function markNoPassportDepositTxUsed(hash: string): void {
  usedDepositTxHashes.add(normaliseTxHash(hash));
}

export function assertNoPassportDepositTxFresh(hash: string): void {
  const h = normaliseTxHash(hash);
  if (usedDepositTxHashes.has(h)) {
    throw new Error("This payment transaction has already been used for a listing.");
  }
}

export async function verifyListBurnTx(params: {
  aptos: Aptos;
  paymentTransactionHash: string;
  buyerAddress: string;
}): Promise<void> {
  const { aptos, paymentTransactionHash, buyerAddress } = params;
  const buyer = normalizeAddress(buyerAddress);
  const hash = normaliseTxHash(paymentTransactionHash);
  const c = getNoPassportListingBurnConfig();

  const executed = await aptos.waitForTransaction({ transactionHash: hash });
  const transaction = await aptos.getTransactionByHash({ transactionHash: hash });
  const tx = transaction as {
    type?: unknown;
    success?: unknown;
    sender?: unknown;
    payload?: unknown;
    vm_status?: unknown;
  };

  if (!executed.success || tx.type !== "user_transaction" || !tx.success) {
    throw new Error("Listing deposit transaction was not successful.");
  }

  const senderRaw = String(tx.sender ?? "").trim();
  if (!senderRaw || !sameAptosAddress(senderRaw, buyer)) {
    throw new Error("Listing deposit sender does not match authenticated wallet.");
  }

  const fn = getPayloadFunction(tx.payload);
  if (fn !== PASSPORT_LIST_BURN_FN.toLowerCase()) {
    throw new Error("Listing deposit transaction is not list_burn.");
  }

  const args = getPayloadArguments(tx.payload);
  if (args.length < 4) {
    throw new Error("list_burn payload missing arguments.");
  }

  const lptState = String(args[0] ?? "").trim();
  const burnAmt = parseU64Arg(args[1], "burn_amount");
  const treasury = String(args[2] ?? "").trim();
  const aptAmt = parseU64Arg(args[3], "apt_amount");

  if (!sameAptosAddress(lptState, c.lptStateAddress)) {
    throw new Error("list_burn LPT state address mismatch.");
  }
  if (burnAmt < c.lptBurnAmount) {
    throw new Error("list_burn LPT burn amount is below the required minimum.");
  }
  if (!sameAptosAddress(treasury, c.aptTreasuryAddress)) {
    throw new Error("list_burn APT treasury recipient mismatch.");
  }
  if (aptAmt < c.aptAmountOctas) {
    throw new Error("list_burn APT amount is below the required minimum.");
  }
}

export async function verifyListBurnLptTx(params: {
  aptos: Aptos;
  paymentTransactionHash: string;
  buyerAddress: string;
}): Promise<void> {
  const { aptos, paymentTransactionHash, buyerAddress } = params;
  const buyer = normalizeAddress(buyerAddress);
  const hash = normaliseTxHash(paymentTransactionHash);
  const c = getNoPassportListingBurnConfig();

  const executed = await aptos.waitForTransaction({ transactionHash: hash });
  const transaction = await aptos.getTransactionByHash({ transactionHash: hash });
  const tx = transaction as {
    type?: unknown;
    success?: unknown;
    sender?: unknown;
    payload?: unknown;
    vm_status?: unknown;
  };

  if (!executed.success || tx.type !== "user_transaction" || !tx.success) {
    throw new Error("Listing deposit transaction was not successful.");
  }

  const senderRaw = String(tx.sender ?? "").trim();
  if (!senderRaw || !sameAptosAddress(senderRaw, buyer)) {
    throw new Error("Listing deposit sender does not match authenticated wallet.");
  }

  const fn = getPayloadFunction(tx.payload);
  if (fn !== PASSPORT_LIST_BURN_LPT_FN.toLowerCase()) {
    throw new Error("Listing deposit transaction is not list_burn_lpt.");
  }

  const args = getPayloadArguments(tx.payload);
  if (args.length < 4) {
    throw new Error("list_burn_lpt payload missing arguments.");
  }

  const lptState = String(args[0] ?? "").trim();
  const burnAmt = parseU64Arg(args[1], "burn_amount");
  const treasury = String(args[2] ?? "").trim();
  const gasAmt = parseU64Arg(args[3], "gas_fee_amount");

  if (!sameAptosAddress(lptState, c.lptStateAddress)) {
    throw new Error("list_burn_lpt LPT state address mismatch.");
  }
  if (burnAmt < c.lptBurnAmount) {
    throw new Error("list_burn_lpt LPT burn amount is below the required minimum.");
  }
  if (!sameAptosAddress(treasury, c.lptTreasuryAddress)) {
    throw new Error("list_burn_lpt LPT treasury recipient mismatch.");
  }
  if (gasAmt < c.lptGasFeeAmount) {
    throw new Error("list_burn_lpt LPT fee amount is below the required minimum.");
  }
}
