import {
  ESCROW_CREATE_LISTING_FN,
  ESCROW_PURCHASE_FN,
  ESCROW_PURCHASE_WITH_LPT_FN,
  ESCROW_CANCEL_LISTING_FN,
  ESCROW_UPDATE_PRICE_FN,
  ESCROW_ADMIN_CANCEL_FN,
} from "../constants";

export type PreparedEscrowPayload = {
  function: string;
  functionArguments: (string | number)[];
};

export function buildEscrowCreateListingPayload(params: {
  passportObjectAddress: string;
  adminAddress: string;
  priceOctas: string;
}): PreparedEscrowPayload {
  return {
    function: ESCROW_CREATE_LISTING_FN,
    functionArguments: [
      params.passportObjectAddress,
      params.adminAddress,
      params.priceOctas,
    ],
  };
}

export function buildEscrowPurchasePayload(params: {
  passportObjectAddress: string;
  adminAddress: string;
}): PreparedEscrowPayload {
  return {
    function: ESCROW_PURCHASE_FN,
    functionArguments: [
      params.passportObjectAddress,
      params.adminAddress,
    ],
  };
}

export function buildEscrowPurchaseWithLptPayload(params: {
  passportObjectAddress: string;
  adminAddress: string;
  lptStateAddress: string;
}): PreparedEscrowPayload {
  return {
    function: ESCROW_PURCHASE_WITH_LPT_FN,
    functionArguments: [
      params.passportObjectAddress,
      params.adminAddress,
      params.lptStateAddress,
    ],
  };
}

export function buildEscrowCancelListingPayload(params: {
  passportObjectAddress: string;
  adminAddress: string;
}): PreparedEscrowPayload {
  return {
    function: ESCROW_CANCEL_LISTING_FN,
    functionArguments: [
      params.passportObjectAddress,
      params.adminAddress,
    ],
  };
}

export function buildEscrowUpdatePricePayload(params: {
  passportObjectAddress: string;
  adminAddress: string;
  newPriceOctas: string;
}): PreparedEscrowPayload {
  return {
    function: ESCROW_UPDATE_PRICE_FN,
    functionArguments: [
      params.passportObjectAddress,
      params.adminAddress,
      params.newPriceOctas,
    ],
  };
}

export function buildEscrowAdminCancelPayload(params: {
  passportObjectAddress: string;
  registryAddress: string;
}): PreparedEscrowPayload {
  return {
    function: ESCROW_ADMIN_CANCEL_FN,
    functionArguments: [
      params.passportObjectAddress,
      params.registryAddress,
    ],
  };
}
