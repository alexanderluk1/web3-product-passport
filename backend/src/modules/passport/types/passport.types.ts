export type PrepareMintPassportRequestBody = {
    ownerAddress: string;
    productName: string;
    brand: string;
    category: string;
    serialNumber: string;
    manufacturingDate: string;
    materials: string | string[];
    countryOfOrigin: string;
    description: string;
    transferable?: boolean;
}

export type PassportMetadataAttribute = {
    trait_type: string;
    value: string;
}

export type PassportMetadata = {
    name: string;
    description: string;
    image: string;
    brand: string;
    category: string;
    serialNumber: string;
    manufacturingDate: string;
    materials: string[];
    countryOfOrigin: string;
    attributes: PassportMetadataAttribute[];
}

export type PreparedMintPayload = {
    function: string;
    functionArguments: Array<string | boolean | number[]>;
}

export type PrepareMintPassportResponse = 
    | {
        success: true;
        imageCid: string;
        imageIpfsUri: string;
        metadataCid: string;
        metadataIpfsUri: string;
        metadata: PassportMetadata;
        payload: PreparedMintPayload;
    }
    | {
        success: false;
        error: string;
    }

export type PrepareTransferRequestBody = {
  passportObjectAddress: string;
  newOwnerAddress: string;
};

export type PreparedTransferPayload = {
  function: string;
  functionArguments: string[];
};

export type PrepareTransferResponse =
  | {
      success: true;
      payload: PreparedTransferPayload;
    }
  | {
      success: false;
      error: string;
    };

export type RecordTransferRequestBody = {
  txHash: string;
  passportObjectAddress: string;
  newOwnerAddress: string;
};

export type RecordTransferResponse =
  | {
      success: true;
      message: string;
    }
  | {
      success: false;
      error: string;
    };

export type IssuerProduct = {
  passportObjectAddr?: string;
  transactionVersion: string;
  transactionHash: string;
  issuerAddress: string;
  ownerAddress: string;
  registryAddress: string;
  serialNumber: string;
  metadataUri: string;
  transferable: boolean;
  mintedAt?: number;
};

export type GetIssuerProductsResponse = {
  source: "cache" | "chain";
  syncedAt: number;
  products: IssuerProduct[];
};

export type GetOwnedPassportsResponse = {
  source: "chain";
  syncedAt: number;
  products: IssuerProduct[];
};

export type IssuerProductCacheEntry = {
  syncedAt: number;
  products: IssuerProduct[];
};

export type GetProductByIdResponse = {
  passportObjectAddr: string;
  issuerAddress: string;
  ownerAddress?: string;
  registryAddress: string;
  serialNumber: string;
  serialNumberPlain: string;
  metadataUri: string;
  transferable: boolean;
  transactionHash?: string;
  transactionVersion?: string;
  mintedAt?: number;
  status: number;
};

export type PassportProvenanceEventType = "MINTED" | "TRANSFERRED" | "STATUS_CHANGED" | "METADATA_UPDATED" | "LISTED";

export type PassportProvenanceEvent = {
  type: PassportProvenanceEventType;
  passportObjectAddr: string;
  fromAddress?: string;
  toAddress?: string;
  actorAddress?: string;
  transactionVersion: string;
  transactionHash?: string;
  at?: number;
};

export type GetPassportProvenanceResponse = {
  passportObjectAddr: string;
  serialNumber: string;
  serialNumberPlain: string;
  events: PassportProvenanceEvent[];
};

export type PrepareSetStatusRequestBody = {
  passportObjectAddress: string;
  newStatus: number; // 1=ACTIVE, 2=SUSPENDED, 3=REVOKED, 4=LISTING
};

export type PrepareUpdateMetadataRequestBody = {
  passportObjectAddress: string;
  // Update metadata, for if product details have changed (repair, refurbishment and verification)
  productName: string;
  brand: string;
  category: string;
  serialNumber: string;
  manufacturingDate: string;
  materials: string | string[];
  countryOfOrigin: string;
  description: string;
};

export type PreparedSetStatusPayload = {
  function: string;
  functionArguments: unknown[];
};

export type PrepareSetStatusResponse =
  | {
      success: true;
      payload: PreparedSetStatusPayload;
    }
  | {
      success: false;
      error: string;
    };

export type RecordSetStatusRequestBody = {
  txHash: string;
  passportObjectAddress: string;
};

export type PreparedUpdateMetadataPayload = {
  function: string;
  functionArguments: unknown[];
};

export type PrepareUpdateMetadataResponse =
  | {
      success: true;
      metadataIpfsUri: string;
      payload: PreparedUpdateMetadataPayload;
    }
  | {
      success: false;
      error: string;
    };

export type RecordUpdateMetadataRequestBody = {
  txHash: string;
  passportObjectAddress: string;
};

export type RecordUpdateMetadataResponse =
  | {
      success: true;
      message: string;
    }
  | {
      success: false;
      error: string;
    };

export type PreparedListPassportPayload = {
    function: string;
    functionArguments: string[];
  };

export type PrepareListPassportRequestBody = {
    passportObjectAddress: string;
  };

export type PrepareListPassportResponse =
  | {
      success: true;
      payload: PreparedListPassportPayload;
    }
  | {
      success: false;
      error: string;
    };

export type RecordListPassportRequestBody = {
  txHash: string;
  passportObjectAddress: string;
};

export type RecordListPassportResponse =
  | {
      success: true;
      message: string;
    }
  | {
      success: false;
      error: string;
    };
