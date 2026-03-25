import { makeAptosClient } from "../../../config/aptos";
import {
  getRegistryStatus as readRegistryStatus,
} from "../../../chains/luxpass/readers";
import { initRegistry as writeInitRegistry } from "../../../chains/luxpass/writers/initRegistry";
import { REGISTRY_ADDRESS } from "../../../chains/luxpass/constants";
import {
  InitRegistryResponse,
  IssuerSummary,
  RegistryStatusResponse,
} from "../types/adminRegistry.types";

const aptos = makeAptosClient();

export const adminRegistryService = {
  async getRegistryStatus(): Promise<RegistryStatusResponse> {
    console.info("[admin-registry.service] reading registry status", {
      network: process.env.APTOS_NETWORK || "devnet",
      registryAddress: REGISTRY_ADDRESS,
    });
    const result = await readRegistryStatus(aptos, REGISTRY_ADDRESS);
    console.info("[admin-registry.service] read registry status result", {
      initialized: result.initialized,
      registryAddress: result.registryAddress,
      adminAddress: result.initialized ? result.adminAddress : undefined,
      issuerAddedCount: result.initialized ? result.issuerAddedCount : undefined,
      issuerRemovedCount: result.initialized ? result.issuerRemovedCount : undefined,
    });

    if (!result.initialized) {
      return {
        initialized: false,
        registryAddress: result.registryAddress,
      };
    }

    return {
      initialized: true,
      registry: {
        registryAddress: result.registryAddress,
        adminAddress: result.adminAddress,
        issuerAddedCount: result.issuerAddedCount,
        issuerRemovedCount: result.issuerRemovedCount,
      },
    };
  },

  async initRegistry(): Promise<InitRegistryResponse> {
    console.info("[admin-registry.service] init registry started", {
      network: process.env.APTOS_NETWORK || "devnet",
      moduleAddress: process.env.MODULE_ADDRESS,
      registryAddress: REGISTRY_ADDRESS,
    });
    const result = await writeInitRegistry(aptos);

    if (!result.success) {
      console.warn("[admin-registry.service] init registry failed", {
        transactionHash: result.transactionHash,
        vmStatus: result.vmStatus,
      });
      return {
        success: false,
        error: "Failed to initialize registry/passport infrastructure.",
        transactionHash: result.transactionHash,
        vmStatus: result.vmStatus
      };
    }

    console.info("[admin-registry.service] init registry succeeded", {
      transactionHash: result.transactionHash,
      vmStatus: result.vmStatus,
      registryAddress: REGISTRY_ADDRESS.toLowerCase(),
    });

    return {
      success: true,
      transactionHash: result.transactionHash,
      registryAddress: REGISTRY_ADDRESS.toLowerCase()
    };
  },

  async getIssuers(): Promise<IssuerSummary[]> {
    // Issuers are stored in a Move Table and cannot be enumerated directly from chain state.
    // Expose an empty list until event-based indexing is wired in.
    return [];
  }
};
