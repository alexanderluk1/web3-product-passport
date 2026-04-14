import { PASSPORT_DELIST_FN } from "../constants";
import { PreparedListPassportPayload } from "../../../modules/passport/types/passport.types";

export function buildDelistPassportPayload(params: {
  passportObjectAddress: string;
  registryAddress: string;
}): PreparedListPassportPayload {
  return {
    function: PASSPORT_DELIST_FN,
    functionArguments: [
      params.passportObjectAddress,
      params.registryAddress,
    ],
  };
}
