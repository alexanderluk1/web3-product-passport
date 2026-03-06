export type RegistryStatusResponse =
  | {
      initialized: true;
      registry: {
        registryAddress: string;
        adminAddress: string;
        issuerAddedCount: number;
        issuerRemovedCount: number;
      };
    }
  | {
      initialized: false;
      registryAddress: string;
    };

export type InitRegistryResponse =
  | {
      success: true;
      transactionHash: string;
      registryAddress: string;
    }
  | {
      success: false;
      error: string;
      transactionHash?: string;
      vmStatus?: string;
    };

export type IssuerSummary = {
  walletAddress: string;
  registeredAt: number;
  active: boolean;
};
