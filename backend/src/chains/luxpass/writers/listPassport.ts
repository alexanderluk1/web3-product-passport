import { PASSPORT_LIST_FN } from "../constants";
import { PreparedListPassportPayload } from "../../../modules/passport/types/passport.types";

export function buildListPassportPayload(params: {
  passportObjectAddress: string;
  registryAddress: string;
}): PreparedListPassportPayload {
  return {
    function: PASSPORT_LIST_FN,
    functionArguments: [
      params.passportObjectAddress,
      params.registryAddress,
    ],
  };
}
