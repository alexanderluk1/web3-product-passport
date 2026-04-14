import type { PreparedEscrowPayload } from "../../../chains/luxpass/writers/escrowPayloadBuilders";

export type PrepareEscrowListingBody = {
  passportObjectAddress: string;
  priceOctas: string;
};

export type RecordEscrowListingBody = {
  txHash: string;
  passportObjectAddress: string;
  priceOctas: string;
};

export type PreparePurchaseBody = {
  passportObjectAddress: string;
};

export type RecordPurchaseBody = {
  txHash: string;
  passportObjectAddress: string;
};

export type PrepareCancelBody = {
  passportObjectAddress: string;
};

export type RecordCancelBody = {
  txHash: string;
  passportObjectAddress: string;
};

export type UpdatePriceBody = {
  passportObjectAddress: string;
  newPriceOctas: string;
};

export type RequestDeliveryBody = {
  passportObjectAddress: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
};

export type MarketplaceListing = {
  passportObjectAddress: string;
  ownerAddress: string;
  priceOctas: string;
  metadataUri?: string;
  inEscrow: boolean;
  productName?: string;
  brand?: string;
  category?: string;
  listedAt: string;
};

export type EscrowPrepareResponse =
  | { success: true; payload: PreparedEscrowPayload; priceOctas?: string }
  | { success: false; error: string };

export type EscrowRecordResponse =
  | { success: true; message: string }
  | { success: false; error: string };

export type MarketplaceListingsResponse =
  | { success: true; payload: MarketplaceListing[] }
  | { success: false; error: string };
