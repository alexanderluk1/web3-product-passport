"use client";

import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useState, useEffect, createContext, useContext, ReactNode } from "react";

interface User {
  id: string;
  walletAddress: string;
  role: "USER" | "ISSUER" | "ADMIN";
}

interface AuthContextType {
  isAuthenticated: boolean;
  accessToken: string | null;
  user: User | null;
  login: (loginData: any) => void;
  logout: () => void;
  userAddress: string | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const { account, connected } = useWallet();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Add loading state

  // Helper function to safely get address string
  const getAddressString = (account: any) => {
    if (!account) return null;
    
    if (typeof account.address === 'string') {
      return account.address;
    } else if (account.address && typeof account.address.toString === 'function') {
      return account.address.toString();
    } else if (account.publicKey) {
      return account.publicKey.toString();
    }
    
    return null;
  };

  // Initialize auth state from localStorage on mount
  useEffect(() => {
    console.log("🔐 AuthProvider: Initializing auth state from localStorage...");
    
    const token = localStorage.getItem("accessToken");
    const storedUser = localStorage.getItem("user");
    const storedAddress = localStorage.getItem("authAddress");
    
    console.log("🔐 AuthProvider: Found in localStorage:", {
      hasToken: !!token,
      hasUser: !!storedUser,
      storedAddress: storedAddress,
      tokenPreview: token?.substring(0, 20) + "..."
    });

    if (token && storedUser && storedAddress) {
      try {
        const parsedUser = JSON.parse(storedUser);
        console.log("🔐 AuthProvider: Parsed stored user:", parsedUser);
        
        // Restore auth state immediately
        setAccessToken(token);
        setUser(parsedUser);
        setIsAuthenticated(true);
        
        console.log("✅ AuthProvider: Auth state restored from localStorage");
      } catch (error) {
        console.error("❌ AuthProvider: Error parsing stored user data:", error);
        // Clear corrupted data
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");
        localStorage.removeItem("authAddress");
      }
    } else {
      console.log("🔐 AuthProvider: No valid auth data found in localStorage");
    }
    
    setIsLoading(false);
  }, []);

  // Handle wallet connection changes
  useEffect(() => {
    if (isLoading) return; // Don't run until initial load is complete
    
    const currentAddress = getAddressString(account);
    const storedAddress = localStorage.getItem("authAddress");
    
    console.log("🔐 AuthProvider: Wallet connection changed:", {
      connected,
      currentAddress,
      storedAddress,
      isAuthenticated
    });

    // If wallet disconnected, clear auth
    if (!connected || !account) {
      if (isAuthenticated) {
        console.log("🔐 AuthProvider: Wallet disconnected, clearing auth");
        logout();
      }
      return;
    }

    // If different wallet connected, clear auth
    if (isAuthenticated && storedAddress && currentAddress !== storedAddress) {
      console.log("🔐 AuthProvider: Different wallet connected, clearing auth");
      console.log("   - Stored address:", storedAddress);
      console.log("   - Current address:", currentAddress);
      logout();
      return;
    }

    // If same wallet reconnected and we have stored auth, verify it's still valid
    if (connected && currentAddress === storedAddress && !isAuthenticated) {
      const token = localStorage.getItem("accessToken");
      const storedUser = localStorage.getItem("user");
      
      if (token && storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          console.log("🔐 AuthProvider: Restoring auth for reconnected wallet");
          setAccessToken(token);
          setUser(parsedUser);
          setIsAuthenticated(true);
        } catch (error) {
          console.error("❌ AuthProvider: Error restoring auth for reconnected wallet:", error);
          logout();
        }
      }
    }
  }, [connected, account, isAuthenticated, isLoading]);

  const login = (loginData: any) => {
    console.log("🔐 AuthProvider: Login called with data:", loginData);
    
    if (loginData.accessToken && loginData.user) {
      const userAddress = loginData.user.walletAddress;
      
      console.log("🔐 AuthProvider: Storing auth data:", {
        userId: loginData.user.id,
        userRole: loginData.user.role,
        userAddress: userAddress,
        tokenPreview: loginData.accessToken.substring(0, 20) + "..."
      });
      
      // Store in localStorage
      localStorage.setItem("accessToken", loginData.accessToken);
      localStorage.setItem("user", JSON.stringify(loginData.user));
      localStorage.setItem("authAddress", userAddress);
      
      // Update state
      setAccessToken(loginData.accessToken);
      setUser(loginData.user);
      setIsAuthenticated(true);
      
      console.log("✅ AuthProvider: Login completed successfully");
    } else {
      console.error("❌ AuthProvider: Invalid login data provided");
    }
  };

  const logout = () => {
    console.log("🔐 AuthProvider: Logout called");
    
    // Clear localStorage
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");
    localStorage.removeItem("authAddress");
    
    // Clear state
    setAccessToken(null);
    setUser(null);
    setIsAuthenticated(false);
    
    console.log("✅ AuthProvider: Logout completed");
  };

  const value = {
    isAuthenticated,
    accessToken,
    user,
    login,
    logout,
    userAddress: getAddressString(account),
    isLoading,
  };

  // Show loading state while initializing
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};