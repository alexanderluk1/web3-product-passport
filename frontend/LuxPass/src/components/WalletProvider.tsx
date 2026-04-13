"use client";

import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { Network, AptosConfig } from "@aptos-labs/ts-sdk";
import { ReactNode } from "react";

interface WalletProviderProps {
  children: ReactNode;
}

const localAptosConfig = new AptosConfig({
  network: Network.CUSTOM,
  fullnode: "http://127.0.0.1:8080/v1",
  indexer:  "http://127.0.0.1:8090/v1/graphql",
  faucet:   "http://127.0.0.1:8082",
});

export const WalletProvider = ({ children }: WalletProviderProps) => {
  const handleError = (error: Error) => {
    console.error("🔗 Wallet Provider Error:", error);
  };

  return (
    <AptosWalletAdapterProvider
      aptosConfig={localAptosConfig}
      autoConnect={true}
      onError={handleError}
    >
      {children}
    </AptosWalletAdapterProvider>
  );
};