import { makeAptosClient } from "../../config/aptos";
import { getPassport } from "../../chains/luxpass/readers";

const aptos = makeAptosClient();

export const passportService = {
  async getPassport(passportObjectAddr: string) {
    return getPassport(aptos, passportObjectAddr);
  },
};