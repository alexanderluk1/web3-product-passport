import { Aptos, Ed25519PrivateKey, Account } from "@aptos-labs/ts-sdk";
import { MODULE_ADDRESS } from "../constants";

export type InitRegistryResult = {
  success: boolean;
  transactionHash: string;
  vmStatus?: string;
};

const ISSUER_REGISTRY_MODULE_NAME = "issuer_registry";
const ISSUER_REGISTRY_INIT_FUNCTION = "init";
const PASSPORT_MODULE_NAME = "passport";
const PASSPORT_INIT_INDEX_FUNCTION = "init_index";
const PASSPORT_INIT_EVENTS_FUNCTION = "init_events";

const PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY!;

function getAdminAccount(): Account {
  if (!PRIVATE_KEY) {
    throw new Error("ADMIN_PRIVATE_KEY is not configured.");
  }

  const privateKey = new Ed25519PrivateKey(PRIVATE_KEY);
  return Account.fromPrivateKey({ privateKey });
}

function isAlreadyInitializedVmStatus(vmStatus?: string): boolean {
  if (!vmStatus) {
    return false;
  }

  const normalized = vmStatus.toLowerCase();
  return (
    normalized.includes("already_initialized") ||
    normalized.includes("already initialized") ||
    normalized.includes("abort code: 1") ||
    normalized.includes("abort_code: 1")
  );
}

function extractVmStatus(error: unknown): string | undefined {
  if (error && typeof error === "object") {
    const transaction = (error as { transaction?: { vm_status?: unknown } }).transaction;
    if (transaction && typeof transaction.vm_status === "string") {
      return transaction.vm_status;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return undefined;
}

function extractTransactionHash(error: unknown): string | undefined {
  if (error && typeof error === "object") {
    const transaction = (error as { transaction?: { hash?: unknown } }).transaction;
    if (transaction && typeof transaction.hash === "string") {
      return transaction.hash;
    }
  }

  return undefined;
}

async function runInitCall(params: {
  aptos: Aptos;
  adminAccount: Account;
  moduleName: string;
  functionName: string;
}): Promise<{
  success: boolean;
  transactionHash: string;
  vmStatus?: string;
}> {
  const { aptos, adminAccount, moduleName, functionName } = params;

  try {
    const transaction = await aptos.transaction.build.simple({
      sender: adminAccount.accountAddress,
      data: {
        function: `${MODULE_ADDRESS}::${moduleName}::${functionName}`,
        functionArguments: [],
      },
    });

    const committedTransaction = await aptos.signAndSubmitTransaction({
      signer: adminAccount,
      transaction,
    });

    const executedTransaction = await aptos.waitForTransaction({
      transactionHash: committedTransaction.hash,
    });

    if (executedTransaction.success || isAlreadyInitializedVmStatus(executedTransaction.vm_status)) {
      return {
        success: true,
        transactionHash: committedTransaction.hash,
        vmStatus: executedTransaction.vm_status,
      };
    }

    return {
      success: false,
      transactionHash: committedTransaction.hash,
      vmStatus: executedTransaction.vm_status,
    };
  } catch (error) {
    const vmStatus = extractVmStatus(error);
    const transactionHash = extractTransactionHash(error) ?? "";

    if (isAlreadyInitializedVmStatus(vmStatus)) {
      return {
        success: true,
        transactionHash,
        vmStatus,
      };
    }

    return {
      success: false,
      transactionHash,
      vmStatus,
    };
  }
}

export async function initRegistry(aptos: Aptos): Promise<InitRegistryResult> {
  const adminAccount = getAdminAccount();
  const initRegistryResult = await runInitCall({
    aptos,
    adminAccount,
    moduleName: ISSUER_REGISTRY_MODULE_NAME,
    functionName: ISSUER_REGISTRY_INIT_FUNCTION,
  });

  if (!initRegistryResult.success) {
    return {
      success: false,
      transactionHash: initRegistryResult.transactionHash,
      vmStatus: initRegistryResult.vmStatus,
    };
  }

  const initPassportIndexResult = await runInitCall({
    aptos,
    adminAccount,
    moduleName: PASSPORT_MODULE_NAME,
    functionName: PASSPORT_INIT_INDEX_FUNCTION,
  });

  if (!initPassportIndexResult.success) {
    return {
      success: false,
      transactionHash: initPassportIndexResult.transactionHash,
      vmStatus: initPassportIndexResult.vmStatus,
    };
  }

  const initPassportEventsResult = await runInitCall({
    aptos,
    adminAccount,
    moduleName: PASSPORT_MODULE_NAME,
    functionName: PASSPORT_INIT_EVENTS_FUNCTION,
  });

  if (!initPassportEventsResult.success) {
    return {
      success: false,
      transactionHash: initPassportEventsResult.transactionHash,
      vmStatus: initPassportEventsResult.vmStatus,
    };
  }

  return {
    success: true,
    transactionHash: initPassportEventsResult.transactionHash,
    vmStatus: initPassportEventsResult.vmStatus,
  };
}
