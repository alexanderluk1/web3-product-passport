import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
import { makeAptosClient } from "../../../config/aptos";
import { getRegistryStatus } from "../../../chains/luxpass/readers/getRegistryStatus";
import { initRegistry as writeInitRegistry } from "../../../chains/luxpass/writers/initRegistry";
import { registerIssuer as writeRegisterIssuer } from "../../../chains/luxpass/writers/registerIssuer";
import {
  GetAllIssuersResponse,
  RegisterIssuerResponse,
} from "../types/issuerRegistry.types";
import {
  hasActiveIssuer,
  saveIssuer,
  getAllIssuers as readAllIssuers,
} from "../stores/issuerStore";

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

function isIssuerAlreadyOnChain(params: {
  error?: string;
  vmStatus?: string;
}): boolean {
  const combined = `${params.error ?? ""} ${params.vmStatus ?? ""}`.toLowerCase();
  return (
    combined.includes("issuer already exists") ||
    combined.includes("issuer_already_exists") ||
    combined.includes("already exists") ||
    combined.includes("abort code: 4") ||
    combined.includes("abort_code: 4") ||
    combined.includes("code 4")
  );
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

    if (hasActiveIssuer(normalizedIssuerAddress)) {
      return {
        success: true,
        issuerAddress: normalizedIssuerAddress,
        source: "STORE",
      };
    }

    if (normalizedAdminWallet !== backendSignerAddress) {
      return {
        success: false,
        error: "Authenticated admin wallet does not match backend signer wallet.",
      };
    }

    const registryStatus = await getRegistryStatus(aptos, normalizedAdminWallet);

    if (!registryStatus.initialized) {
      const initResult = await writeInitRegistry(aptos);

      if (!initResult.success) {
        return {
          success: false,
          error: "Failed to initialize registry/passport infrastructure.",
          transactionHash: initResult.transactionHash,
          vmStatus: initResult.vmStatus,
        };
      }
    }

    const result = await writeRegisterIssuer(aptos, normalizedIssuerAddress);

    if (!result.success) {
      if (isIssuerAlreadyOnChain({ error: result.error, vmStatus: result.vmStatus })) {
        saveIssuer(normalizedIssuerAddress);
        return {
          success: true,
          issuerAddress: normalizedIssuerAddress,
          transactionHash: result.transactionHash,
          source: "STORE",
        };
      }

      return {
        success: false,
        error: result.error,
        transactionHash: result.transactionHash,
        vmStatus: result.vmStatus,
      };
    }

    saveIssuer(normalizedIssuerAddress);

    return {
      success: true,
      issuerAddress: normalizedIssuerAddress,
      transactionHash: result.transactionHash,
      source: "CHAIN",
    };
  },

  async getAllIssuers(): Promise<GetAllIssuersResponse> {
    return {
      issuers: readAllIssuers(),
    };
  },
};
