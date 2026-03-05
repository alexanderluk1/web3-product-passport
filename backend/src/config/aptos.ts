import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

export function makeAptosClient() {
  const network = (process.env.APTOS_NETWORK || "devnet").toLowerCase();

  const cfg = new AptosConfig({
    network: network === "mainnet" ? Network.MAINNET :
             network === "testnet" ? Network.TESTNET :
             Network.DEVNET,
  });

  return new Aptos(cfg);
}