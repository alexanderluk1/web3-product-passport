import { makeAptosClient } from "../../../config/aptos";
import {
  getRegistryStatus as readRegistryStatus,
} from "../../../chains/luxpass/readers";
import { RegistryStatusResponse } from "../types/adminRegistry.types";

const aptos = makeAptosClient();

export const adminRegistryService = {
  async getRegistryStatus(adminWalletAddress: string): Promise<RegistryStatusResponse> {
    const result = await readRegistryStatus(aptos, adminWalletAddress);

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
};