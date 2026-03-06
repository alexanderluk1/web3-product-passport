export type PassportView = {
  issuer: string;
  serialHash: string;
  metadataUri: string;
  metadataHash: string;
  status: number;
  transferable: boolean;
  createdAtSecs: string;
};

export type GetRegistryStatusResult =
  | {
      initialized: true;
      registryAddress: string;
      adminAddress: string;
      issuerAddedCount: number;
      issuerRemovedCount: number;
    }
  | {
      initialized: false;
      registryAddress: string;
    };
