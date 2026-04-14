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

export type PrepareMintWithBurnPassportRequestBody = PrepareMintPassportRequestBody & {
  burnAmount: number | string;
};

export type PrepareMintWithBurnLptPassportRequestBody = PrepareMintWithBurnPassportRequestBody;

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

export type PrepareTransferWithBurnRequestBody = PrepareTransferRequestBody & {
  burnAmount: number | string;
};

export type PrepareTransferWithBurnLptRequestBody = PrepareTransferWithBurnRequestBody;

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

export type PassportProvenanceEventType = "MINTED" | "TRANSFERRED";

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
