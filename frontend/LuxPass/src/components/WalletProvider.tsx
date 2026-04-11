"use client";

import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { ReactNode } from "react";

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider = ({ children }: WalletProviderProps) => {
  const handleError = (error: Error) => {
    console.error("🔗 Wallet Provider Error:", error);
  };

  return (
    <AptosWalletAdapterProvider 
      autoConnect={true}
      onError={handleError}
    >
      {children}
    </AptosWalletAdapterProvider>
  );
};