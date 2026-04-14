"use client";

import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Shield, LogIn } from "lucide-react";
import { useState } from "react";
import { showSuccess, showError } from "@/utils/toast";
import { useAuth } from "@/hooks/useAuth";

interface LoginButtonProps {
  onLoginSuccess?: (loginData: any) => void;
  className?: string;
}

export const LoginButton = ({ onLoginSuccess, className }: LoginButtonProps) => {
  const { account, connected, signMessage } = useWallet();
  const { login } = useAuth();
  const [isLogging, setIsLogging] = useState(false);

  const bytesToHex = (bytes: Uint8Array): string => {
    return `0x${Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")}`;
  };

  const toHexString = (value: any): string => {
    if (!value) return "";

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return "";
      return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
    }

    if (value instanceof Uint8Array) {
      return bytesToHex(value);
    }

    if (typeof value.toUint8Array === "function") {
      const bytes = value.toUint8Array();
      if (bytes instanceof Uint8Array) {
        return bytesToHex(bytes);
      }
    }

    if (value.data instanceof Uint8Array) {
      return bytesToHex(value.data);
    }

    if (Array.isArray(value.data)) {
      return bytesToHex(new Uint8Array(value.data));
    }

    if (Array.isArray(value)) {
      return bytesToHex(new Uint8Array(value));
    }

    return "";
  };

  // Helper function to safely get address string
  const getAddressString = (account: any) => {
    if (!account) return "";
    
    if (typeof account.address === 'string') {
      return account.address;
    } else if (account.address && typeof account.address.toString === 'function') {
      return account.address.toString();
    } else if (account.publicKey) {
      return account.publicKey.toString();
    }
    
    return "";
  };

  const handleLogin = async () => {
    if (!connected || !account) {
      showError("Please connect your wallet first");
      return;
    }

    const walletAddress = getAddressString(account);
    if (!walletAddress) {
      showError("Unable to get wallet address");
      return;
    }

    console.log("🔐 Starting authentication for wallet:", walletAddress);
    console.log("🔐 Account object:", account);
    setIsLogging(true);

    try {
      // Get challenge from backend
      console.log("📡 Requesting challenge from backend...");
      const challengeRequestBody = {
        walletAddress: walletAddress,
      };
      console.log("📡 Challenge request body:", challengeRequestBody);

      const challengeRes = await fetch("http://localhost:3001/auth/challenge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(challengeRequestBody),
      });

      console.log("📡 Challenge response status:", challengeRes.status);
      console.log("📡 Challenge response headers:", Object.fromEntries(challengeRes.headers.entries()));

      if (!challengeRes.ok) {
        const errorText = await challengeRes.text();
        console.error("❌ Challenge request failed:", {
          status: challengeRes.status,
          statusText: challengeRes.statusText,
          body: errorText
        });
        throw new Error(`Failed to get challenge: ${challengeRes.status} ${challengeRes.statusText}`);
      }

      const challenge = await challengeRes.json();
      console.log("✅ Challenge received:", challenge);
      console.log("📝 Message to sign:", challenge.message);
      console.log("🔑 Challenge ID:", challenge.challengeId);

      // Sign the challenge message
      console.log("✍️ Requesting wallet signature...");
      const signRequest = {
        message: challenge.message,
        nonce: challenge.challengeId,
        address: true,
      };
      console.log("✍️ Sign request:", signRequest);

      const signResponse = await signMessage(signRequest);
      console.log("✅ Message signed successfully!");
      console.log("✍️ Sign response:", signResponse);
      console.log("✍️ Signature:", signResponse.signature);
      console.log("✍️ Signature type:", typeof signResponse.signature);
      
      // Safe signature length check
      const signatureLength = signResponse.signature && typeof signResponse.signature === 'object' && 'length' in signResponse.signature 
        ? (signResponse.signature as any).length 
        : 'unknown';
      console.log("✍️ Signature length:", signatureLength);

      const publicKeyHex = toHexString(account.publicKey);
      const signatureHex = toHexString(signResponse.signature);

      if (!publicKeyHex || !signatureHex) {
        throw new Error("Unable to serialize wallet public key/signature for backend verification.");
      }

      const signaturePayload = JSON.stringify({
        type: "ed25519_signature",
        publicKey: publicKeyHex,
        signature: signatureHex,
        message: signResponse.message ?? challenge.message,
        fullMessage: signResponse.fullMessage,
        address: signResponse.address ?? walletAddress,
      });

      console.log("✍️ Serialized signature payload:", signaturePayload);

      // Send signed challenge to backend for verification
      console.log("📡 Sending signed challenge to backend...");
      const loginRequestBody = {
        walletAddress: walletAddress,
        challengeId: challenge.challengeId,
        signature: signaturePayload,
      };
      console.log("📡 Login request body:", loginRequestBody);

      const loginRes = await fetch("http://localhost:3001/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(loginRequestBody),
      });

      console.log("📡 Login response status:", loginRes.status);
      console.log("📡 Login response headers:", Object.fromEntries(loginRes.headers.entries()));

      if (!loginRes.ok) {
        const errorText = await loginRes.text();
        console.error("❌ Login request failed:", {
          status: loginRes.status,
          statusText: loginRes.statusText,
          body: errorText
        });
        
        // Additional debugging for signature verification failure
        if (loginRes.status === 401) {
          console.error("🔍 SIGNATURE VERIFICATION DEBUG:");
          console.error("   - Wallet Address:", walletAddress);
          console.error("   - Challenge ID:", challenge.challengeId);
          console.error("   - Original Message:", challenge.message);
          console.error("   - Signature:", signResponse.signature);
          console.error("   - Account Public Key:", account.publicKey);
          console.error("   - Full Account Object:", account);
        }
        
        throw new Error(`Login failed: ${loginRes.status} ${loginRes.statusText}`);
      }

      const loginData = await loginRes.json();
      console.log("✅ Login successful:", loginData);
      
      // Store auth data
      login(loginData);
      
      showSuccess("Authentication successful!");
      onLoginSuccess?.(loginData);
      
    } catch (error) {
      console.error("💥 Login error:", error);
      showError("Authentication failed. Please try again.");
    } finally {
      setIsLogging(false);
    }
  };

  if (!connected || !account) {
    return (
      <Button variant="outline" disabled className={className}>
        <Shield className="mr-2 h-4 w-4" />
        Connect Wallet to Login
      </Button>
    );
  }

  return (
    <Button 
      onClick={handleLogin} 
      disabled={isLogging}
      className={`bg-green-600 hover:bg-green-700 ${className}`}
    >
      <LogIn className="mr-2 h-4 w-4" />
      {isLogging ? "Authenticating..." : "Sign Message to Login"}
    </Button>
  );
};