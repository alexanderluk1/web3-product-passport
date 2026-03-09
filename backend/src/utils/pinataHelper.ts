import {
  PassportMetadata,
  PrepareMintPassportRequestBody,
  PrepareMintPassportResponse,
  PreparedMintPayload
} from "../modules/passport/types/passport.types";
import { PinataSDK } from "pinata";

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.PINATA_GATEWAY_URL!,
});

export async function uploadImageToPinata(file: Express.Multer.File): Promise<{
  cid: string;
  ipfsUri: string;
}> {
  const blob = new Blob([file.buffer], { type: file.mimetype });
  const pinataFile = new File([blob], file.originalname, { type: file.mimetype });

  const upload = await pinata.upload.public.file(pinataFile);

  return {
    cid: upload.cid,
    ipfsUri: `ipfs://${upload.cid}`,
  };
}

export async function uploadMetadataToPinata(metadata: PassportMetadata): Promise<{
  cid: string;
  ipfsUri: string;
}> {
  const metadataJson = JSON.stringify(metadata, null, 2);
  const blob = new Blob([metadataJson], { type: "application/json" });
  const pinataFile = new File(
    [blob],
    `${metadata.serialNumber || "passport-metadata"}.json`,
    { type: "application/json" }
  );

  const upload = await pinata.upload.public.file(pinataFile);

  return {
    cid: upload.cid,
    ipfsUri: `ipfs://${upload.cid}`,
  };
}