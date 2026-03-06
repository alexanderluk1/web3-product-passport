import { Aptos, Ed25519PrivateKey, Account } from "@aptos-labs/ts-sdk";
import { MODULE_ADDRESS } from "../constants";

export type InitRegistryResult = {
  success: boolean;
  transactionHash: string;
  vmStatus?: string;
};

const MODULE_NAME = "issuer_registry";
const FUNCTION_NAME = "init";

const PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY!;

function getAdminAccount(): Account {
  if (!PRIVATE_KEY) {
    throw new Error("ADMIN_PRIVATE_KEY is not configured.");
  }

  const privateKey = new Ed25519PrivateKey(PRIVATE_KEY);
  return Account.fromPrivateKey({ privateKey });
}

export async function initRegistry(aptos: Aptos): Promise<InitRegistryResult> {
  const adminAccount = getAdminAccount();

  const transaction = await aptos.transaction.build.simple({
    sender: adminAccount.accountAddress,
    data: {
      function: `${MODULE_ADDRESS}::${MODULE_NAME}::${FUNCTION_NAME}`,
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

  const success = Boolean(executedTransaction.success);

  if (!success) {
    return {
      success: false,
      transactionHash: committedTransaction.hash,
      vmStatus: executedTransaction.vm_status,
    };
  }

  return {
    success: true,
    transactionHash: committedTransaction.hash,
    vmStatus: executedTransaction.vm_status,
  };
}
