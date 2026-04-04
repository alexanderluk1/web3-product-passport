import type { Account, Aptos } from "@aptos-labs/ts-sdk";
import { normaliseAddress, resolveStateAddress, signSubmit } from "./shared";
import type { SubmitResult } from "./types";

export async function mint(
  aptos: Aptos,
  admin: Account,
  recipientAddress: string,
  amount: number | bigint,
  stateAddrOverride?: string
): Promise<SubmitResult> {
  return signSubmit(aptos, admin, "mint", [
    resolveStateAddress(stateAddrOverride),
    normaliseAddress(recipientAddress),
    BigInt(amount),
  ]);
}

export async function transfer(
  aptos: Aptos,
  signer: Account,
  recipientAddress: string,
  amount: number | bigint,
  stateAddrOverride?: string
): Promise<SubmitResult> {
  return signSubmit(aptos, signer, "transfer", [
    resolveStateAddress(stateAddrOverride),
    normaliseAddress(recipientAddress),
    BigInt(amount),
  ]);
}

export async function burn(
  aptos: Aptos,
  signer: Account,
  amount: number | bigint,
  stateAddrOverride?: string
): Promise<SubmitResult> {
  return signSubmit(aptos, signer, "burn", [
    resolveStateAddress(stateAddrOverride),
    BigInt(amount),
  ]);
}

export async function claimSignup(
  aptos: Aptos,
  signer: Account,
  stateAddrOverride?: string
): Promise<SubmitResult> {
  return signSubmit(aptos, signer, "claim_signup_reward", [
    resolveStateAddress(stateAddrOverride),
  ]);
}

export async function claimReferral(
  aptos: Aptos,
  signer: Account,
  referrerAddress: string,
  stateAddrOverride?: string
): Promise<SubmitResult> {
  return signSubmit(aptos, signer, "claim_referral_reward", [
    resolveStateAddress(stateAddrOverride),
    normaliseAddress(referrerAddress),
  ]);
}

export async function creditFiat(
  aptos: Aptos,
  admin: Account,
  buyerAddress: string,
  amount: number | bigint,
  stateAddrOverride?: string
): Promise<SubmitResult> {
  return signSubmit(aptos, admin, "credit_fiat_purchase", [
    resolveStateAddress(stateAddrOverride),
    normaliseAddress(buyerAddress),
    BigInt(amount),
  ]);
}

export async function deposit(
  aptos: Aptos,
  signer: Account,
  amount: number | bigint,
  stateAddrOverride?: string
): Promise<SubmitResult> {
  return signSubmit(aptos, signer, "deposit_to_subsidy_pool", [
    resolveStateAddress(stateAddrOverride),
    BigInt(amount),
  ]);
}

export async function allocate(
  aptos: Aptos,
  admin: Account,
  recipientAddress: string,
  amount: number | bigint,
  stateAddrOverride?: string
): Promise<SubmitResult> {
  return signSubmit(aptos, admin, "allocate_subsidy", [
    resolveStateAddress(stateAddrOverride),
    normaliseAddress(recipientAddress),
    BigInt(amount),
  ]);
}

export async function payFee(
  aptos: Aptos,
  signer: Account,
  treasuryAddress: string,
  amount: number | bigint,
  stateAddrOverride?: string
): Promise<SubmitResult> {
  return signSubmit(aptos, signer, "pay_platform_fee", [
    resolveStateAddress(stateAddrOverride),
    normaliseAddress(treasuryAddress),
    BigInt(amount),
  ]);
}

export async function burnForService(
  aptos: Aptos,
  signer: Account,
  amount: number | bigint,
  stateAddrOverride?: string
): Promise<SubmitResult> {
  return signSubmit(aptos, signer, "burn_for_passport_service", [
    resolveStateAddress(stateAddrOverride),
    BigInt(amount),
  ]);
}
