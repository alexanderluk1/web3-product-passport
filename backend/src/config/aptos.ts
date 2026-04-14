import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

export function makeAptosClient() {
  // local network config
  const fullnodeUrl = process.env.APTOS_NODE_URL;

  if (fullnodeUrl) {
    return new Aptos(
      new AptosConfig({
        network: Network.CUSTOM,
        fullnode: fullnodeUrl,
        faucet: process.env.APTOS_FAUCET_URL,
      })
    );
  }
  const network = (process.env.APTOS_NETWORK || "devnet").toLowerCase();

  const cfg = new AptosConfig({
    network: network === "mainnet" ? Network.MAINNET :
             network === "testnet" ? Network.TESTNET :
             Network.DEVNET,
  });

  return new Aptos(cfg);
}