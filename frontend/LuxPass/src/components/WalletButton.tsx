"use client";

import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, LogOut, User, ExternalLink } from "lucide-react";
import { useState } from "react";
import { showSuccess, showError } from "@/utils/toast";
import { useAuth } from "@/hooks/useAuth";

export const WalletButton = () => {
  const { account, connected, connect, disconnect, wallets } = useWallet();
  const { logout } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      
      console.log("🔗 Available wallets:", wallets);
      console.log("🔗 Number of wallets found:", wallets?.length || 0);
      
      // Check if any wallets are available
      if (!wallets || wallets.length === 0) {
        console.log("❌ No wallets detected");
        showError("No Aptos wallets found. Please install Petra, Martian, or another Aptos wallet.");
        window.open("https://petra.app/", "_blank");
        return;
      }

      // Log details about available wallets and find the best one to connect to
      let targetWallet = null;
      
      wallets.forEach((wallet, index) => {
        console.log(`🔗 Wallet ${index + 1}:`, {
          name: wallet.name,
          url: wallet.url,
          readyState: wallet.readyState
        });
        
        // Prefer Petra wallet if available, otherwise use first installed wallet
        if (wallet.name === "Petra" && wallet.readyState === "Installed") {
          targetWallet = wallet;
        } else if (!targetWallet && wallet.readyState === "Installed") {
          targetWallet = wallet;
        }
      });

      if (!targetWallet) {
        console.log("❌ No installed wallets found");
        showError("No installed Aptos wallets found. Please install Petra wallet.");
        window.open("https://petra.app/", "_blank");
        return;
      }

      console.log("🔗 Attempting to connect with:", targetWallet.name);
      
      // Add timeout to prevent hanging
      const connectPromise = connect(targetWallet.name);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Connection timeout")), 10000); // 10 second timeout
      });

      await Promise.race([connectPromise, timeoutPromise]);
      
      console.log("✅ Wallet connected successfully!");
      showSuccess(`Connected to ${targetWallet.name}!`);
      
    } catch (error) {
      console.error("💥 Wallet connection error:", error);
      
      // Provide specific error messages
      if (error.message?.includes("timeout")) {
        showError("Connection timed out. Please try again or check if your wallet is unlocked.");
      } else if (error.message?.includes("User rejected") || error.message?.includes("rejected")) {
        showError("Connection cancelled by user");
      } else if (error.message?.includes("not installed")) {
        showError("Wallet not installed. Please install Petra or another Aptos wallet.");
        window.open("https://petra.app/", "_blank");
      } else if (error.message?.includes("not ready")) {
        showError("Wallet not ready. Please refresh the page and try again.");
      } else {
        showError(`Failed to connect wallet: ${error.message || "Unknown error"}`);
        console.error("Full error details:", error);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      logout(); // Also logout from auth
      showSuccess("Wallet disconnected");
    } catch (error) {
      console.error("💥 Disconnect error:", error);
      showError("Failed to disconnect wallet");
    }
  };

  // Helper function to safely get address string
  const getAddressString = (account: any) => {
    if (!account) return "";
    
    // Handle different address formats
    if (typeof account.address === 'string') {
      return account.address;
    } else if (account.address && typeof account.address.toString === 'function') {
      return account.address.toString();
    } else if (account.publicKey) {
      return account.publicKey.toString();
    }
    
    return "";
  };

  if (connected && account) {
    const addressString = getAddressString(account);
    const displayAddress = addressString.length > 10 
      ? `${addressString.slice(0, 6)}...${addressString.slice(-4)}`
      : addressString;

    return (
      <div className="flex items-center space-x-2">
        <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
          <User className="mr-1 h-3 w-3" />
          {displayAddress || "Connected"}
        </Badge>
        <Button variant="outline" size="sm" onClick={handleDisconnect}>
          <LogOut className="mr-1 h-4 w-4" />
          Disconnect
        </Button>
      </div>
    );
  }

  // Show different states based on wallet availability
  if (isConnecting) {
    return (
      <Button disabled className="bg-purple-600">
        <Wallet className="mr-2 h-4 w-4 animate-pulse" />
        Connecting...
      </Button>
    );
  }

  // Check if wallets are available and installed
  const installedWallets = wallets?.filter(wallet => wallet.readyState === "Installed") || [];
  
  if (installedWallets.length === 0) {
    return (
      <Button 
        onClick={() => {
          showError("No installed Aptos wallets detected. Opening Petra wallet installation...");
          window.open("https://petra.app/", "_blank");
        }}
        variant="outline"
        className="border-orange-300 text-orange-700 hover:bg-orange-50"
      >
        <ExternalLink className="mr-2 h-4 w-4" />
        Install Wallet
      </Button>
    );
  }

  return (
    <Button 
      onClick={handleConnect} 
      className="bg-purple-600 hover:bg-purple-700"
    >
      <Wallet className="mr-2 h-4 w-4" />
      Connect Wallet
    </Button>
  );
};