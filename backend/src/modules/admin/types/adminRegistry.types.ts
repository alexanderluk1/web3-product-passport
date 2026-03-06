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