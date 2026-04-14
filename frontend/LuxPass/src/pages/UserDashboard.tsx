import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Shield, Package, ArrowRightLeft, Search, User, Eye, Calendar, Building, Copy, ExternalLink, Image as ImageIcon, RefreshCw, Loader2, Lock, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { showSuccess, showError } from "@/utils/toast";
import { LptPanel } from "@/components/LptPanel";
import { PassportServicePayment } from "@/components/PassportServicePayment";

// Pinata IPFS Gateway Configuration
const PINATA_GATEWAY_URL = "https://amaranth-passive-chicken-549.mypinata.cloud";

interface Product {
  transactionVersion: string;
  transactionHash: string;
  issuerAddress: string;
  ownerAddress: string;
  registryAddress: string;
  serialNumber: string;
  metadataUri: string;
  transferable: boolean;
  mintedAt: number;
  // Add passport object address for transfers
  passportObjectAddr?: string;
}

interface ProductsResponse {
  source: "cache" | "chain";
  syncedAt: number;
  products: Product[];
}

interface ProductMetadata {
  name: string;
  description: string;
  image: string;
  attributes: Array<{
    trait_type: string;
    value: string;
  }>;
}

interface EnrichedProduct extends Product {
  metadata?: ProductMetadata;
  metadataLoading?: boolean;
  metadataError?: boolean;
}

interface TransferPrepareResponse {
  success: boolean;
  payload: {
    function: string;
    functionArguments: string[];
  };
}

const UserDashboard = () => {
  const { user, accessToken } = useAuth();
  const { signAndSubmitTransaction } = useWallet();
  const [ownedPassports, setOwnedPassports] = useState<EnrichedProduct[]>([]);
  const [transferAddress, setTransferAddress] = useState("");
  const [selectedPassport, setSelectedPassport] = useState<EnrichedProduct | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsSource, setProductsSource] = useState<"cache" | "chain" | null>(null);
  const [productsSyncedAt, setProductsSyncedAt] = useState<number | null>(null);

  useEffect(() => {
    if (user && accessToken) {
      fetchOwnedPassports();
    }
  }, [user, accessToken]);

  // Helper function to convert IPFS URI to Pinata gateway URL
  const convertIPFSToHTTP = (uri: string): string => {
    if (!uri || typeof uri !== 'string') {
      console.warn("⚠️ Invalid URI provided to convertIPFSToHTTP:", uri);
      return "";
    }

    if (uri.startsWith('ipfs://')) {
      const cid = uri.replace('ipfs://', '');
      const pinataUrl = `${PINATA_GATEWAY_URL}/ipfs/${cid}`;
      console.log(`🔗 Converting IPFS URI to Pinata gateway: ${uri} -> ${pinataUrl}`);
      return pinataUrl;
    }
    
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      return uri;
    }
    
    const pinataUrl = `${PINATA_GATEWAY_URL}/ipfs/${uri}`;
    console.log(`🔗 Converting CID to Pinata gateway: ${uri} -> ${pinataUrl}`);
    return pinataUrl;
  };

  // Helper function to fetch metadata from IPFS via Pinata gateway
  const fetchMetadataFromIPFS = async (metadataUri: string): Promise<ProductMetadata | null> => {
    try {
      console.log("📡 Fetching metadata from IPFS:", metadataUri);
      
      if (!metadataUri || typeof metadataUri !== 'string') {
        console.warn("⚠️ Invalid metadata URI:", metadataUri);
        return null;
      }
      
      const fetchUrl = convertIPFSToHTTP(metadataUri);
      
      if (!fetchUrl) {
        console.warn("⚠️ Could not convert metadata URI to HTTP URL:", metadataUri);
        return null;
      }
      
      console.log("📡 Fetching from Pinata gateway:", fetchUrl);
      
      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        console.error("❌ IPFS fetch failed:", response.status, response.statusText);
        return null;
      }
      
      const metadata = await response.json();
      console.log("✅ IPFS metadata fetched via Pinata:", metadata);
      
      return metadata;
    } catch (error) {
      console.error("💥 Error fetching IPFS metadata:", error);
      return null;
    }
  };

  // Helper function to enrich products with metadata
  const enrichProductsWithMetadata = async (products: Product[]): Promise<EnrichedProduct[]> => {
    console.log(`🔍 Enriching ${products.length} owned products with IPFS metadata via Pinata gateway...`);
    
    const enrichedProducts: EnrichedProduct[] = products.map(product => ({
      ...product,
      metadataLoading: true,
      metadataError: false,
    }));
    
    // Update state immediately to show loading indicators
    setOwnedPassports(enrichedProducts);
    
    // Fetch metadata for each product
    const metadataPromises = products.map(async (product, index) => {
      try {
        const metadata = await fetchMetadataFromIPFS(product.metadataUri);
        
        // Update the specific product in the array
        setOwnedPassports(prevProducts => {
          const updated = [...prevProducts];
          updated[index] = {
            ...updated[index],
            metadata: metadata || undefined,
            metadataLoading: false,
            metadataError: !metadata,
          };
          return updated;
        });
        
        return { index, metadata };
      } catch (error) {
        console.error(`💥 Error fetching metadata for product ${product.serialNumber}:`, error);
        
        // Update with error state
        setOwnedPassports(prevProducts => {
          const updated = [...prevProducts];
          updated[index] = {
            ...updated[index],
            metadataLoading: false,
            metadataError: true,
          };
          return updated;
        });
        
        return { index, metadata: null };
      }
    });
    
    // Wait for all metadata to be fetched
    await Promise.all(metadataPromises);
    
    console.log("✅ Metadata enrichment completed for owned products via Pinata gateway");
    return enrichedProducts;
  };

  const fetchOwnedPassports = async (showRefreshIndicator = false, context = "initial") => {
    try {
      if (showRefreshIndicator) {
        setProductsLoading(true);
      }
      
      console.log(`📡 Fetching owned passports with GET /api/passports/owned... (Context: ${context})`);
      console.log("📡 Using token:", accessToken?.substring(0, 20) + "...");
      
      const response = await fetch("http://localhost:3001/api/passports/owned", {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      });
      
      console.log(`📡 Owned passports response status: ${response.status} (Context: ${context})`);
      console.log("📡 Owned passports response headers:", Object.fromEntries(response.headers.entries()));
      
      if (response.ok) {
        const data: ProductsResponse = await response.json();
        console.log(`✅ Owned passports response data (Context: ${context}):`, data);
        console.log(`📊 Found ${data.products.length} owned products from ${data.source} (Context: ${context})`);
        console.log(`🕒 Data synced at: ${new Date(data.syncedAt).toISOString()} (Context: ${context})`);
        
        // Log each product for detailed tracking
        data.products.forEach((product, index) => {
          console.log(`   ${index + 1}. Serial: ${product.serialNumber} - Owner: ${product.ownerAddress.substring(0, 10)}... - Minted: ${new Date(product.mintedAt).toISOString()} - Transferable: ${product.transferable}`);
        });
        
        setProductsSource(data.source);
        setProductsSyncedAt(data.syncedAt);
        
        // Enrich products with IPFS metadata
        await enrichProductsWithMetadata(data.products);
        
        if (showRefreshIndicator) {
          const message = `Owned passports refreshed! Found ${data.products.length} products from ${data.source}.`;
          console.log(`🎉 ${message} (Context: ${context})`);
          showSuccess(message);
        }
      } else {
        const errorText = await response.text();
        console.error(`❌ Failed to fetch owned passports (Context: ${context}):`, {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        
        // Show specific error messages
        if (response.status === 401) {
          showError("Authentication failed - please login again");
        } else if (response.status === 403) {
          showError("Access denied - user role required");
        } else if (response.status === 404) {
          showError("Owned passports API not found - check backend configuration");
        } else {
          showError("Failed to fetch owned passports");
        }
      }
    } catch (error) {
      console.error(`💥 Error fetching owned passports (Context: ${context}):`, error);
      showError("Network error fetching owned passports");
    } finally {
      if (showRefreshIndicator) {
        setProductsLoading(false);
      }
    }
  };

  // Helper function to validate wallet address
  const validateWalletAddress = (address: string) => {
    if (!address) return false;
    
    // Basic validation for Aptos wallet address format
    const aptosAddressRegex = /^0x[a-fA-F0-9]{1,64}$/;
    return aptosAddressRegex.test(address);
  };

  // New 2-step transfer function
  const handleTransfer = async (passport: EnrichedProduct) => {
    if (!transferAddress.trim()) {
      showError("Please enter a valid wallet address");
      return;
    }

    if (!validateWalletAddress(transferAddress)) {
      showError("Please enter a valid wallet address (0x...)");
      return;
    }

    if (!passport.passportObjectAddr && !passport.transactionHash) {
      showError("Missing passport object address for transfer");
      return;
    }

    // Use passportObjectAddr if available, otherwise fall back to transactionHash
    const passportObjectAddress = passport.passportObjectAddr || passport.transactionHash;

    setIsTransferring(true);
    
    try {
      console.log("🔄 Starting 2-step transfer process...");
      console.log("📦 Passport Object Address:", passportObjectAddress);
      console.log("👤 New Owner Address:", transferAddress);
      
      // Step 1: Prepare transfer
      console.log("📡 Step 1: Preparing transfer...");
      const prepareResponse = await fetch("http://localhost:3001/api/passports/transfer/prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          passportObjectAddress: passportObjectAddress,
          newOwnerAddress: transferAddress,
        }),
      });

      console.log("📡 Prepare transfer response status:", prepareResponse.status);
      console.log("📡 Prepare transfer response headers:", Object.fromEntries(prepareResponse.headers.entries()));

      if (!prepareResponse.ok) {
        const errorText = await prepareResponse.text();
        console.error("❌ Prepare transfer failed:", {
          status: prepareResponse.status,
          statusText: prepareResponse.statusText,
          body: errorText
        });
        throw new Error(`Failed to prepare transfer: ${prepareResponse.status} ${prepareResponse.statusText}`);
      }

      const prepareData: TransferPrepareResponse = await prepareResponse.json();
      console.log("✅ Transfer prepared:", prepareData);

      if (!prepareData.success || !prepareData.payload) {
        throw new Error("Invalid prepare response: missing payload");
      }

      // Step 2: Submit blockchain transaction
      console.log("🔗 Step 2: Submitting blockchain transaction...");
      console.log("🔗 Transaction payload:", prepareData.payload);
      
      const transactionPayload = {
        data: {
          function: prepareData.payload.function,
          functionArguments: prepareData.payload.functionArguments,
        },
        options: {
          maxGasAmount: 10000,
          gasUnitPrice: 100,
          expirationSecondsFromNow: 60,
        },
      };
      
      console.log("🔗 Final transaction payload:", transactionPayload);
      
      const transactionResponse = await signAndSubmitTransaction(transactionPayload);
      console.log("✅ Blockchain transaction submitted:", transactionResponse);
      console.log("🔗 Transaction hash:", transactionResponse.hash);

      // Step 3: Record transfer in backend
      console.log("📡 Step 3: Recording transfer in backend...");
      const recordResponse = await fetch("http://localhost:3001/api/passports/transfer/record", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          txHash: transactionResponse.hash,
          passportObjectAddress: passportObjectAddress,
          newOwnerAddress: transferAddress,
        }),
      });

      console.log("📡 Record transfer response status:", recordResponse.status);

      if (!recordResponse.ok) {
        const errorText = await recordResponse.text();
        console.error("❌ Record transfer failed:", {
          status: recordResponse.status,
          statusText: recordResponse.statusText,
          body: errorText
        });
        // Don't throw here - the blockchain transaction succeeded
        showError("Transfer completed on blockchain but failed to record in backend");
      } else {
        const recordData = await recordResponse.json();
        console.log("✅ Transfer recorded:", recordData);
        showSuccess(`Passport transferred successfully! TX: ${transactionResponse.hash.substring(0, 10)}...`);
      }

      // Reset form and refresh data
      setTransferAddress("");
      setSelectedPassport(null);
      
      // Refresh the passports list after successful transfer
      console.log("🔄 Refreshing passports list after successful transfer...");
      setTimeout(() => {
        fetchOwnedPassports(true, "post-transfer");
      }, 2000); // Wait 2 seconds for blockchain to process

    } catch (error) {
      console.error("💥 Transfer error:", error);
      
      // Provide specific error messages
      if (error.message?.includes("User rejected") || error.message?.includes("rejected")) {
        showError("Transfer cancelled by user");
      } else if (error.message?.includes("prepare")) {
        showError("Failed to prepare transfer. Please try again.");
      } else if (error.message?.includes("Invalid payload")) {
        showError("Invalid transfer payload received from server");
      } else {
        showError("Transfer failed. Please try again.");
      }
    } finally {
      setIsTransferring(false);
    }
  };

  // Helper function to format timestamp
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Helper function to get product display name from metadata
  const getProductDisplayName = (product: EnrichedProduct) => {
    if (product.metadataLoading) {
      return `Loading...`;
    }
    
    if (product.metadata?.name) {
      return product.metadata.name;
    }
    
    if (product.metadataError) {
      return `Product ${product.serialNumber} (metadata failed)`;
    }
    
    return `Product ${product.serialNumber}`;
  };

  // Helper function to get product brand from metadata
  const getProductBrand = (product: EnrichedProduct) => {
    if (product.metadataLoading || !product.metadata) {
      return null;
    }
    
    const brandAttribute = product.metadata.attributes?.find(attr => 
      attr.trait_type.toLowerCase() === 'brand'
    );
    
    return brandAttribute?.value || null;
  };

  // Helper function to get product category from metadata
  const getProductCategory = (product: EnrichedProduct) => {
    if (product.metadataLoading || !product.metadata) {
      return null;
    }
    
    const categoryAttribute = product.metadata.attributes?.find(attr => 
      attr.trait_type.toLowerCase() === 'category'
    );
    
    return categoryAttribute?.value || null;
  };

  // Helper function to handle product details modal
  const handleViewProductDetails = (product: EnrichedProduct) => {
    setSelectedPassport(product);
    setIsModalOpen(true);
  };

  // Helper function to copy text to clipboard
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess(`${label} copied to clipboard!`);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      showError("Failed to copy to clipboard");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Navigation */}
      <nav className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <Shield className="h-8 w-8 text-purple-600" />
            <span className="text-2xl font-bold text-gray-900">LuxPass</span>
          </Link>
          <div className="flex items-center space-x-4">
            <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
              <User className="mr-1 h-3 w-3" />
              {user?.role}
            </Badge>
            <Link to="/verify">
              <Button variant="outline">Verify Product</Button>
            </Link>
            <Link to="/dashboard">
              <Button variant="outline">Dashboard</Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">User Dashboard</h1>
            <p className="text-gray-600">Manage your owned product passports</p>
            <div className="mt-2 text-sm text-gray-500">
              User ID: {user?.id} | Wallet: {user?.walletAddress?.substring(0, 10)}...
              {productsSource && productsSyncedAt && (
                <span className="ml-4">
                  Data from {productsSource} • Last synced: {formatDate(productsSyncedAt)}
                </span>
              )}
            </div>
          </div>

          <Tabs defaultValue="owned" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 bg-white/80 backdrop-blur-sm">
              <TabsTrigger value="owned" className="flex items-center">
                <Package className="mr-2 h-4 w-4" />
                My Passports ({ownedPassports.length})
              </TabsTrigger>
              <TabsTrigger value="lpt" className="flex items-center">
                <Wallet className="mr-2 h-4 w-4" />
                LPT Wallet
              </TabsTrigger>
              <TabsTrigger value="verify" className="flex items-center">
                <Search className="mr-2 h-4 w-4" />
                Verify Products
              </TabsTrigger>
            </TabsList>

            {/* Owned Passports Tab */}
            <TabsContent value="owned">
              <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-2xl flex items-center">
                        <Package className="mr-3 h-6 w-6 text-blue-600" />
                        My Product Passports ({ownedPassports.length})
                      </CardTitle>
                      <CardDescription>
                        View and manage your owned product passports
                        {productsSource && productsSyncedAt && (
                          <span className="block mt-1 text-xs">
                            Data from {productsSource} • Last synced: {formatDate(productsSyncedAt)}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => fetchOwnedPassports(true, "manual-refresh")}
                      disabled={productsLoading}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${productsLoading ? 'animate-spin' : ''}`} />
                      {productsLoading ? "Refreshing..." : "Refresh"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {ownedPassports.length === 0 ? (
                    <div className="text-center py-8">
                      <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <p className="text-gray-500">You don't own any product passports yet.</p>
                      <p className="text-xs text-gray-400 mt-2">Check console for API response details</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {ownedPassports.map((passport) => (
                        <div 
                          key={`${passport.transactionHash}-${passport.serialNumber}`} 
                          className="border rounded-lg p-4 bg-white/50 cursor-pointer hover:bg-white/70 hover:shadow-md transition-all duration-200"
                          onClick={() => handleViewProductDetails(passport)}
                          title="Click to view product details"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <h3 className="font-semibold text-lg">{getProductDisplayName(passport)}</h3>
                                {passport.metadataLoading && (
                                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                                )}
                              </div>
                              <div className="space-y-1">
                                {getProductBrand(passport) && getProductCategory(passport) && (
                                  <p className="text-sm text-gray-600">{getProductBrand(passport)} • {getProductCategory(passport)}</p>
                                )}
                                <p className="text-sm text-gray-600">Serial: {passport.serialNumber}</p>
                                <p className="text-xs text-gray-500 font-mono">TX: {passport.transactionHash.substring(0, 20)}...</p>
                                {passport.passportObjectAddr && (
                                  <p className="text-xs text-gray-500 font-mono">Object: {passport.passportObjectAddr.substring(0, 20)}...</p>
                                )}
                              </div>
                            </div>
                            <div className="text-right space-y-2">
                              <Badge className="bg-green-100 text-green-800 border-green-200">
                                Owned
                              </Badge>
                              <div className="flex flex-wrap justify-end gap-2">
                                {passport.transferable ? (
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation(); // Prevent modal from opening
                                      setSelectedPassport(passport);
                                    }}
                                  >
                                    <ArrowRightLeft className="mr-1 h-3 w-3" />
                                    Transfer
                                  </Button>
                                ) : (
                                  <div className="flex items-center text-xs text-gray-500">
                                    <Lock className="mr-1 h-3 w-3" />
                                    Non-transferable
                                  </div>
                                )}
                                <PassportServicePayment
                                  passportLabel={passport.metadata?.name || passport.serialNumber}
                                />
                              </div>
                            </div>
                          </div>
                          
                          {/* Only show transfer form for transferable passports */}
                          {selectedPassport?.transactionHash === passport.transactionHash && !isModalOpen && passport.transferable && (
                            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                              <h4 className="font-semibold mb-2">Transfer Ownership</h4>
                              <div className="space-y-3">
                                <div>
                                  <Label htmlFor="transferAddress" className="text-sm font-medium">Recipient Wallet Address</Label>
                                  <Input
                                    id="transferAddress"
                                    placeholder="0x..."
                                    value={transferAddress}
                                    onChange={(e) => setTransferAddress(e.target.value)}
                                    className={`mt-1 ${
                                      transferAddress && !validateWalletAddress(transferAddress)
                                        ? 'border-red-300 focus:border-red-500'
                                        : ''
                                    }`}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  {transferAddress && !validateWalletAddress(transferAddress) && (
                                    <p className="text-sm text-red-600 mt-1">
                                      Please enter a valid wallet address starting with 0x
                                    </p>
                                  )}
                                </div>
                                <div className="flex space-x-2">
                                  <Button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleTransfer(passport);
                                    }}
                                    disabled={isTransferring || !transferAddress || !validateWalletAddress(transferAddress)}
                                    className="bg-blue-600 hover:bg-blue-700"
                                  >
                                    {isTransferring ? "Transferring..." : "Transfer"}
                                  </Button>
                                  <Button 
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedPassport(null);
                                      setTransferAddress("");
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-1 gap-4 text-sm text-gray-600 mt-3">
                            <div>
                              <span className="font-medium">Owner:</span>
                              <span className="font-mono text-xs ml-2">{passport.ownerAddress.substring(0, 10)}...{passport.ownerAddress.substring(passport.ownerAddress.length - 6)}</span>
                            </div>
                            <div className="flex items-center">
                              <Calendar className="mr-2 h-4 w-4" />
                              Minted on {formatDate(passport.mintedAt)}
                            </div>
                            <div className="flex items-center">
                              <span className="font-medium mr-2">Transferable:</span>
                              <Badge className={passport.transferable ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                                {passport.transferable ? "Yes" : "No"}
                              </Badge>
                            </div>
                            {passport.metadataError && (
                              <div className="text-xs text-red-600">
                                ⚠️ Failed to load metadata from IPFS
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* LPT Wallet Tab */}
            <TabsContent value="lpt">
              <LptPanel />
            </TabsContent>

            {/* Verify Products Tab */}
            <TabsContent value="verify">
              <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center">
                    <Eye className="mr-3 h-6 w-6 text-green-600" />
                    Verify Product Authenticity
                  </CardTitle>
                  <CardDescription>
                    Check the authenticity of any product passport
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-center py-8">
                  <Search className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-4">
                    Use our verification tool to check product authenticity
                  </p>
                  <Link to="/verify">
                    <Button className="bg-green-600 hover:bg-green-700">
                      Go to Verification Tool
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Product Details Modal */}
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-2xl flex items-center">
                  <Package className="mr-3 h-6 w-6 text-blue-600" />
                  Product Passport Details
                </DialogTitle>
                <DialogDescription>
                  Complete information for this owned product passport
                </DialogDescription>
              </DialogHeader>
              
              {selectedPassport && isModalOpen && (
                <div className="space-y-6">
                  {/* Product Image and Basic Info */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      {selectedPassport.metadata?.image ? (
                        <div className="space-y-2">
                          <Label className="text-base font-semibold">Product Image</Label>
                          <img
                            src={convertIPFSToHTTP(selectedPassport.metadata.image)}
                            alt={selectedPassport.metadata.name || "Product"}
                            className="w-full h-64 object-cover rounded-lg border"
                            onError={(e) => {
                              console.error("Failed to load product image");
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-full h-64 bg-gray-100 rounded-lg border flex items-center justify-center">
                          <div className="text-center text-gray-500">
                            <ImageIcon className="mx-auto h-12 w-12 mb-2" />
                            <p>No image available</p>
                            {selectedPassport.metadataError && (
                              <p className="text-xs text-red-500 mt-1">Failed to load metadata</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <Label className="text-base font-semibold">Product Name</Label>
                        <p className="text-lg">{selectedPassport.metadata?.name || `Product ${selectedPassport.serialNumber}`}</p>
                      </div>
                      
                      <div>
                        <Label className="text-base font-semibold">Description</Label>
                        <p className="text-gray-700">{selectedPassport.metadata?.description || "No description available"}</p>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium">Serial Number</Label>
                        <div className="flex items-center space-x-2">
                          <p className="font-mono text-sm">{selectedPassport.serialNumber}</p>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(selectedPassport.serialNumber, "Serial number")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Product Attributes */}
                  {selectedPassport.metadata?.attributes && selectedPassport.metadata.attributes.length > 0 && (
                    <div>
                      <Label className="text-base font-semibold mb-3 block">Product Attributes</Label>
                      <div className="grid md:grid-cols-2 gap-4">
                        {selectedPassport.metadata.attributes.map((attr, index) => (
                          <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                            <span className="font-medium text-gray-700">{attr.trait_type}:</span>
                            <span className="text-gray-900">{attr.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Separator />

                  {/* Blockchain Information */}
                  <div>
                    <Label className="text-base font-semibold mb-3 block">Blockchain Information</Label>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium text-gray-700">Transaction Hash:</span>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-sm">{selectedPassport.transactionHash.substring(0, 20)}...</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(selectedPassport.transactionHash, "Transaction hash")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      {selectedPassport.passportObjectAddr && (
                        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <span className="font-medium text-gray-700">Passport Object Address:</span>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-sm">{selectedPassport.passportObjectAddr.substring(0, 20)}...</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyToClipboard(selectedPassport.passportObjectAddr, "Passport object address")}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium text-gray-700">Owner Address:</span>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-sm">{selectedPassport.ownerAddress.substring(0, 20)}...</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(selectedPassport.ownerAddress, "Owner address")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium text-gray-700">Issuer Address:</span>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-sm">{selectedPassport.issuerAddress.substring(0, 20)}...</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(selectedPassport.issuerAddress, "Issuer address")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium text-gray-700">Registry Address:</span>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-sm">{selectedPassport.registryAddress.substring(0, 20)}...</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(selectedPassport.registryAddress, "Registry address")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium text-gray-700">Metadata URI:</span>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-sm">{selectedPassport.metadataUri.substring(0, 20)}...</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(selectedPassport.metadataUri, "Metadata URI")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.open(convertIPFSToHTTP(selectedPassport.metadataUri), '_blank')}
                            title="View metadata on IPFS"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium text-gray-700">Minted Date:</span>
                        <span>{formatDate(selectedPassport.mintedAt)}</span>
                      </div>

                      <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium text-gray-700">Transferable:</span>
                        <Badge className={selectedPassport.transferable ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}>
                          {selectedPassport.transferable ? "Yes" : "No"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
};

export default UserDashboard;
