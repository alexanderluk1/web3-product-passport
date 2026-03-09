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
    const result = await readRegistryStatus(aptos, REGISTRY_ADDRESS);

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
    const result = await writeInitRegistry(aptos);

    if (!result.success) {
      return {
        success: false,
        error: "Failed to initialize registry/passport infrastructure.",
        transactionHash: result.transactionHash,
        vmStatus: result.vmStatus
      };
    }

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
