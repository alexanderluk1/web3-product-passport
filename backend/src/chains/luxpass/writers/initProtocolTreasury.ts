import { Aptos, Ed25519PrivateKey, Account } from "@aptos-labs/ts-sdk";
import { PROTOCOL_TREASURY_INIT_FN, REGISTRY_ADDRESS } from "../constants";

export type InitProtocolTreasuryResult = {
  success: boolean;
  transactionHash: string;
  vmStatus?: string;
};

export async function initProtocolTreasury(aptos: Aptos): Promise<InitProtocolTreasuryResult> {
  const privateKey = process.env.ADMIN_PRIVATE_KEY?.trim();
  if (!privateKey) {
    throw new Error("ADMIN_PRIVATE_KEY is not configured.");
  }

  const adminAccount = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(privateKey),
  });

  const functionId = PROTOCOL_TREASURY_INIT_FN as `${string}::${string}::${string}`;

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
      executed.vm_status?.toLowerCase().includes("abort code: 201") ||
      executed.vm_status?.toLowerCase().includes("abort_code: 201");

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
      msg.toLowerCase().includes("abort code: 201") ||
      msg.toLowerCase().includes("abort_code: 201")
    ) {
      return { success: true, transactionHash: "", vmStatus: msg };
    }
    return { success: false, transactionHash: "", vmStatus: msg };
  }
}
