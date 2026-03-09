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
