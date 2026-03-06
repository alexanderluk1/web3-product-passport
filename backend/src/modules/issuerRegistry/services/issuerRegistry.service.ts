import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
import { makeAptosClient } from "../../../config/aptos";
import { getRegistryStatus } from "../../../chains/luxpass/readers/getRegistryStatus";
import { registerIssuer as writeRegisterIssuer } from "../../../chains/luxpass/writers/registerIssuer";
import { REGISTRY_ADDRESS } from "../../../chains/luxpass/constants";
import { RegisterIssuerResponse } from "../types/issuerRegistry.types";

const aptos = makeAptosClient();
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY!;

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function validateWalletAddress(address: string): void {
  if (!address || typeof address !== "string") {
    throw new Error("Issuer address is required.");
  }

  if (!/^0x[a-fA-F0-9]+$/.test(address.trim())) {
    throw new Error("Invalid issuer address format.");
  }
}

function getBackendSignerAddress(): string {
  if (!ADMIN_PRIVATE_KEY) {
    throw new Error("ADMIN_PRIVATE_KEY is not configured.");
  }

  const privateKey = new Ed25519PrivateKey(ADMIN_PRIVATE_KEY);
  const account = Account.fromPrivateKey({ privateKey });
  return account.accountAddress.toString().toLowerCase();
}

export const issuerRegistryService = {
  async registerIssuer(
    adminWalletAddress: string,
    issuerAddress: string
  ): Promise<RegisterIssuerResponse> {
    validateWalletAddress(issuerAddress);

    const normalizedAdminWallet = normalizeAddress(adminWalletAddress);
    const normalizedIssuerAddress = normalizeAddress(issuerAddress);
    const backendSignerAddress = getBackendSignerAddress();

    if (normalizedAdminWallet !== backendSignerAddress) {
      return {
        success: false,
        error: "Authenticated admin wallet does not match backend signer wallet.",
      };
    }

    const registryStatus = await getRegistryStatus(aptos, REGISTRY_ADDRESS);

    if (!registryStatus.initialized) {
      return {
        success: false,
        error: "Registry is not initialized.",
      };
    }

    const result = await writeRegisterIssuer(aptos, normalizedIssuerAddress);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        transactionHash: result.transactionHash,
        vmStatus: result.vmStatus,
      };
    }

    return {
      success: true,
      issuerAddress: normalizedIssuerAddress,
      transactionHash: result.transactionHash,
    };
  },
};
