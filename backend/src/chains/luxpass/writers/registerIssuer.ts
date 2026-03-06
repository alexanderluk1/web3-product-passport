import { Aptos, Ed25519PrivateKey, Account } from "@aptos-labs/ts-sdk";
import { MODULE_ADDRESS } from "../constants";

export type RegisterIssuerResult =
  | {
      success: true;
      transactionHash: string;
      vmStatus?: string;
    }
  | {
      success: false;
      transactionHash?: string;
      vmStatus?: string;
      error: string;
    };

const MODULE_NAME = "issuer_registry";
const FUNCTION_NAME = "add_issuer";
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY!;

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function getAdminAccount(): Account {
  if (!ADMIN_PRIVATE_KEY) {
    throw new Error("ADMIN_PRIVATE_KEY is not configured.");
  }

  const privateKey = new Ed25519PrivateKey(ADMIN_PRIVATE_KEY);
  return Account.fromPrivateKey({ privateKey });
}

export async function registerIssuer(
  aptos: Aptos,
  issuerAddress: string
): Promise<RegisterIssuerResult> {
  const adminAccount = getAdminAccount();
  const normalizedIssuerAddress = normalizeAddress(issuerAddress);

  try {
    const transaction = await aptos.transaction.build.simple({
      sender: adminAccount.accountAddress,
      data: {
        function: `${MODULE_ADDRESS}::${MODULE_NAME}::${FUNCTION_NAME}`,
        functionArguments: [normalizedIssuerAddress],
      },
    });

    const submitted = await aptos.signAndSubmitTransaction({
      signer: adminAccount,
      transaction,
    });

    const executed = await aptos.waitForTransaction({
      transactionHash: submitted.hash,
    });

    if (!executed.success) {
      return {
        success: false,
        transactionHash: submitted.hash,
        vmStatus: executed.vm_status,
        error: "On-chain register issuer transaction failed.",
      };
    }

    return {
      success: true,
      transactionHash: submitted.hash,
      vmStatus: executed.vm_status,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to submit register issuer transaction.",
    };
  }
}
