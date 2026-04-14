import { Aptos, Ed25519PrivateKey, Account } from "@aptos-labs/ts-sdk";
import { MODULE_ADDRESS, REGISTRY_ADDRESS } from "../constants";

const ESCROW_MODULE_NAME = "escrow";
const ESCROW_INIT_FUNCTION = "init_escrow";

export type InitEscrowResult = {
  success: boolean;
  transactionHash: string;
  vmStatus?: string;
};

export async function initEscrow(aptos: Aptos): Promise<InitEscrowResult> {
  const privateKey = process.env.ADMIN_PRIVATE_KEY?.trim();
  if (!privateKey) {
    throw new Error("ADMIN_PRIVATE_KEY is not configured.");
  }

  const adminAccount = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(privateKey),
  });

  const functionId = `${MODULE_ADDRESS}::${ESCROW_MODULE_NAME}::${ESCROW_INIT_FUNCTION}`;

  try {
    const transaction = await aptos.transaction.build.simple({
      sender: adminAccount.accountAddress,
      data: {
        function: functionId,
        functionArguments: [REGISTRY_ADDRESS],
      },
    });

    const committed = await aptos.signAndSubmitTransaction({
      signer: adminAccount,
      transaction,
    });

    const executed = await aptos.waitForTransaction({
      transactionHash: committed.hash,
    });

    const alreadyInit =
      executed.vm_status?.toLowerCase().includes("already_initialized") ||
      executed.vm_status?.toLowerCase().includes("abort code: 101");

    if (executed.success || alreadyInit) {
      return {
        success: true,
        transactionHash: committed.hash,
        vmStatus: executed.vm_status,
      };
    }

    return {
      success: false,
      transactionHash: committed.hash,
      vmStatus: executed.vm_status,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.toLowerCase().includes("already_initialized") ||
      msg.toLowerCase().includes("abort code: 101")
    ) {
      return { success: true, transactionHash: "", vmStatus: msg };
    }
    return { success: false, transactionHash: "", vmStatus: msg };
  }
}
