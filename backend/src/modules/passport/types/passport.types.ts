import { DelistRequest, DelistRequestStatus, ListingRequest, ListingRequestStatus } from "../repository/listing_repository";

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

export type PrepareSetStatusRequestBody = {
  passportObjectAddress: string;
  newStatus: number; // 1=ACTIVE, 2=SUSPENDED, 3=REVOKED, 4=STORING, 5=VERIFYING, 6=LISTING, 7=RETURNING
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

export type RecordSetStatusResponse =
  | {
      success: true;
      message: string;
    }
  | {
      success: false;
      error: string;
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
      passportObjectAddress: string;
    }
  | {
      success: false;
      error: string;
    };

export type submitListingRequestResponse =
  | {
      success: true;
      message: string;
      tempObjectAddress: string;
    }
  | {
      success: false;
      error: string;
    };

export type UpdateNoPassportListingRequestBody = {
  tempObjectAddress: string;
  status?: string;
  newObjectAddress?: string;
};

export type UpdateNoPassportListingResponse =   | {
  success: true;
  message: string;
  newObjectAddress?: string;
}
| {
  success: false;
  error: string;
};

// Delist request (user wants to delist the item from marketplace, can only be done at status Shipping and Listing)
export type RequestDelistRequestBody = {
  passportObjectAddress: string;
  fullName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type RequestDelistResponse =
  | {
      success: true;
      message: string;
    }
  | {
      success: false;
      error: string;
    };

// Buyer confirms shipping receipt (passport status must be shipping and buyer must be current owner)
export type PrepareConfirmReceiptRequestBody = {
  passportObjectAddress: string;
};

export type PrepareConfirmReceiptResponse =
  | {
      success: true;
      payload: PreparedSetStatusPayload; // set_status(STATUS_ACTIVE)
    }
  | {
      success: false;
      error: string;
    };

export type RecordConfirmReceiptRequestBody = {
  txHash: string;
  passportObjectAddress: string;
};

export type RecordConfirmReceiptResponse =
  | {
      success: true;
      message: string;
    }
  | {
      success: false;
      error: string;
    };

export type PrepareMintListPassportRequestBody = {
  tempObjectAddress: string; // temporary object address used for listing without passport (Used to get the listing)
  productName: string;
  brand: string;
  category: string;
  serialNumber: string;
  manufacturingDate: string;
  materials: string | string[];
  countryOfOrigin: string;
  description: string;
};

export type PreparedMintListPayload = {
  function: string;
  functionArguments: Array<string | boolean | number[]>;
};

export type PrepareMintListPassportResponse = 
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
  };

export type RecordMintListRequestBody = {
  txHash: string;
  ownerAddress: string;
};

export type RecordMintListResponse =
  | {
      success: true;
      message: string;
    }
  | {
      success: false;
      error: string;
    }

export type PrepareMarketplaceSetStatusRequestBody = {
    passportObjectAddress: string;
};

export type getListingByPassportAddressBody = {
  passportObjectAddress: string;
};

export type getListingsByStatus = {
    status: ListingRequestStatus
};

export type getDelistingsByStatus = {
  status: DelistRequestStatus
};

export type listingRequestReturn =
  | { success: true; payload: ListingRequest }
  | { success: false; error: string };

export type listingRequestReturnList =
  | { success: true; payload: ListingRequest[] }
  | { success: false; error: string };

export type deListRequestReturn =
  | { success: true; payload: DelistRequest }
  | { success: false; error: string };

export type deListRequestReturnList =
  | { success: true; payload: DelistRequest[] }
  | { success: false; error: string };

export type PassportHistoryEntry =
  | {
      kind: "minted";
      passportObjectAddr: string;
      transactionVersion: string;
      transactionHash: string;
      issuerAddress: string;
      ownerAddress: string;
      timestamp?: number;
    }
  | {
      kind: "mint_listed";
      passportObjectAddr: string;
      transactionVersion: string;
      transactionHash: string;
      issuerAddress: string;
      ownerAddress: string;
      oldAddress: string;
      timestamp?: number;
    }
  | {
      kind: "transferred";
      passportObjectAddr: string;
      transactionVersion: string;
      transactionHash: string;
      from: string;
      to: string;
      timestamp?: number;
    }
  | {
      kind: "status_changed";
      passportObjectAddr: string;
      transactionVersion: string;
      transactionHash: string;
      oldStatus: PassportStatusValue;
      newStatus: PassportStatusValue;
      timestamp?: number;
    }
  | {
      kind: "metadata_updated";
      passportObjectAddr: string;
      transactionVersion: string;
      transactionHash: string;
      updaterAddress: string;
      newMetadataUri: string;
      timestamp?: number;
    };