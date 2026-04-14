import { PASSPORT_SET_STATUS_FN } from "../constants";
import { PreparedSetStatusPayload } from "../../../modules/passport/types/passport.types";

export function buildSetPassportStatusPayload(params: {
  passportObjectAddress: string;
  registryAddress: string;
  newStatus: number;
}): PreparedSetStatusPayload {
  return {
    function: PASSPORT_SET_STATUS_FN,
    functionArguments: [
      params.passportObjectAddress,
      params.registryAddress,
      params.newStatus,
    ],
  };
}
