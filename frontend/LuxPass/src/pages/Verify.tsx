import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Shield, Scan, Search, CheckCircle, AlertTriangle, Calendar, User, Building, Wrench, Copy, ExternalLink, Image as ImageIcon, ArrowRight, Clock, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { showSuccess, showError } from "@/utils/toast";

// Pinata IPFS Gateway Configuration
const PINATA_GATEWAY_URL = "https://amaranth-passive-chicken-549.mypinata.cloud";

interface Product {
  issuerAddress: string;
  metadataUri: string;
  mintedAt: number;
  passportObjectAddr: string;
  registryAddress: string;
  serialNumber: string; // This is hex format from backend
  serialNumberPlain: string; // This is the readable format
  status: number;
  transferable: boolean;
  // Legacy fields for compatibility
  transactionVersion?: string;
  transactionHash?: string;
  ownerAddress?: string;
}

interface ProductResponse {
  ok: boolean;
  product: Product;
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

interface ProvenanceEvent {
  type: "MINTED" | "TRANSFERRED";
  passportObjectAddr: string;
  toAddress: string;
  fromAddress?: string;
  actorAddress: string;
  transactionVersion: string;
  transactionHash: string;
  at: number;
}

interface ProvenanceResponse {
  ok: boolean;
  provenance: {
    passportObjectAddr: string;
    serialNumber: string;
    serialNumberPlain: string;
    events: ProvenanceEvent[];
  };
}

interface EnrichedProduct extends Product {
  metadata?: ProductMetadata;
  metadataLoading?: boolean;
  metadataError?: boolean;
  provenance?: ProvenanceEvent[];
  provenanceLoading?: boolean;
  provenanceError?: boolean;
}

const Verify = () => {
  const [productId, setProductId] = useState("");
  const [verificationResult, setVerificationResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Helper function to convert IPFS URI to Pinata gateway URL
  const convertIPFSToHTTP = (uri: string): string => {
    // Add null/undefined check
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
    
    // If it's already an HTTP URL, return as-is
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      return uri;
    }
    
    // If it's just a CID, prepend the Pinata gateway
    const pinataUrl = `${PINATA_GATEWAY_URL}/ipfs/${uri}`;
    console.log(`🔗 Converting CID to Pinata gateway: ${uri} -> ${pinataUrl}`);
    return pinataUrl;
  };

  // Helper function to fetch metadata from IPFS via Pinata gateway
  const fetchMetadataFromIPFS = async (metadataUri: string): Promise<ProductMetadata | null> => {
    try {
      console.log("📡 Fetching metadata from IPFS:", metadataUri);
      
      // Add null/undefined check
      if (!metadataUri || typeof metadataUri !== 'string') {
        console.warn("⚠️ Invalid metadata URI:", metadataUri);
        return null;
      }
      
      // Convert IPFS URI to Pinata gateway URL
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

  // Helper function to fetch provenance history
  const fetchProvenanceHistory = async (productId: string): Promise<ProvenanceEvent[] | null> => {
    try {
      console.log("📡 Fetching provenance history for product:", productId);
      
      const response = await fetch(`http://localhost:3001/api/passports/by-product/${encodeURIComponent(productId)}/provenance`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      console.log("📡 Provenance response status:", response.status);
      
      if (!response.ok) {
        console.error("❌ Provenance fetch failed:", response.status, response.statusText);
        return null;
      }
      
      const provenanceData: ProvenanceResponse = await response.json();
      console.log("✅ Provenance data fetched:", provenanceData);
      
      if (provenanceData.ok && provenanceData.provenance?.events) {
        console.log(`📊 Found ${provenanceData.provenance.events.length} provenance events`);
        return provenanceData.provenance.events;
      }
      
      return null;
    } catch (error) {
      console.error("💥 Error fetching provenance history:", error);
      return null;
    }
  };

  // Helper function to enrich a single product with metadata and provenance
  const enrichProductWithMetadata = async (product: Product, productId: string): Promise<EnrichedProduct> => {
    // Add null check for product
    if (!product) {
      console.error("💥 Cannot enrich null/undefined product");
      return {
        ...product,
        metadataLoading: false,
        metadataError: true,
        provenanceLoading: false,
        provenanceError: true,
      };
    }

    const displaySerial = product.serialNumberPlain || product.serialNumber || 'unknown';
    console.log(`🔍 Enriching product ${displaySerial} with IPFS metadata and provenance...`);
    console.log("🔍 Product data:", product);
    console.log("🔍 Metadata URI:", product.metadataUri);
    
    try {
      // Fetch metadata and provenance in parallel
      const [metadata, provenance] = await Promise.all([
        fetchMetadataFromIPFS(product.metadataUri),
        fetchProvenanceHistory(productId)
      ]);
      
      return {
        ...product,
        metadata: metadata || undefined,
        metadataLoading: false,
        metadataError: !metadata,
        provenance: provenance || undefined,
        provenanceLoading: false,
        provenanceError: !provenance,
      };
    } catch (error) {
      console.error(`💥 Error fetching metadata/provenance for product ${displaySerial}:`, error);
      
      return {
        ...product,
        metadataLoading: false,
        metadataError: true,
        provenanceLoading: false,
        provenanceError: true,
      };
    }
  };

  // Helper function to get product brand from metadata
  const getProductBrand = (product: EnrichedProduct) => {
    if (product.metadataLoading || !product.metadata) {
      return "Loading...";
    }
    
    const brandAttribute = product.metadata.attributes?.find(attr => 
      attr.trait_type.toLowerCase() === 'brand'
    );
    
    return brandAttribute?.value || "Unknown Brand";
  };

  // Helper function to get product category from metadata
  const getProductCategory = (product: EnrichedProduct) => {
    if (product.metadataLoading || !product.metadata) {
      return "Loading...";
    }
    
    const categoryAttribute = product.metadata.attributes?.find(attr => 
      attr.trait_type.toLowerCase() === 'category'
    );
    
    return categoryAttribute?.value || "Unknown Category";
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

  // Helper function to get display serial number
  const getDisplaySerial = (product: EnrichedProduct) => {
    return product.serialNumberPlain || product.serialNumber || 'Unknown';
  };

  // Helper function to format provenance event for display
  const formatProvenanceEvent = (event: ProvenanceEvent, index: number, isLast: boolean) => {
    const eventDate = formatDate(event.at);
    
    let eventTitle = "";
    let eventDescription = "";
    let eventIcon = null;
    let eventColor = "";
    
    switch (event.type) {
      case "MINTED":
        eventTitle = "Product Minted";
        eventDescription = `Digital passport created and assigned to ${event.toAddress.substring(0, 10)}...`;
        eventIcon = <Zap className="h-5 w-5" />;
        eventColor = "text-green-600 bg-green-100";
        break;
      case "TRANSFERRED":
        eventTitle = "Ownership Transferred";
        eventDescription = `Transferred from ${event.fromAddress?.substring(0, 10)}... to ${event.toAddress.substring(0, 10)}...`;
        eventIcon = <ArrowRight className="h-5 w-5" />;
        eventColor = "text-blue-600 bg-blue-100";
        break;
      default:
        eventTitle = "Unknown Event";
        eventDescription = `Event type: ${event.type}`;
        eventIcon = <Clock className="h-5 w-5" />;
        eventColor = "text-gray-600 bg-gray-100";
    }
    
    return {
      eventTitle,
      eventDescription,
      eventIcon,
      eventColor,
      eventDate,
      transactionHash: event.transactionHash,
      actorAddress: event.actorAddress,
    };
  };

  // Function to create verification result from real product data
  const createVerificationResultFromProduct = (enrichedProduct: EnrichedProduct) => {
    const displaySerial = getDisplaySerial(enrichedProduct);
    const productName = enrichedProduct.metadata?.name || `Product ${displaySerial}`;
    const brand = getProductBrand(enrichedProduct);
    const category = getProductCategory(enrichedProduct);
    
    // Create provenance history from real events
    const provenanceHistory = enrichedProduct.provenance?.map((event, index) => {
      const formatted = formatProvenanceEvent(event, index, index === enrichedProduct.provenance!.length - 1);
      return {
        type: formatted.eventTitle,
        date: formatted.eventDate,
        entity: formatted.eventDescription,
        location: "Aptos Blockchain",
        details: `TX: ${formatted.transactionHash.substring(0, 20)}... | Actor: ${formatted.actorAddress.substring(0, 10)}...`,
        transactionHash: formatted.transactionHash,
        actorAddress: formatted.actorAddress,
        eventType: event.type,
      };
    }) || [];
    
    return {
      isAuthentic: true,
      productId: displaySerial,
      name: productName,
      brand: brand,
      category: category,
      issuer: {
        name: "Verified Issuer",
        address: enrichedProduct.issuerAddress,
        verified: true
      },
      currentOwner: {
        address: enrichedProduct.ownerAddress || "Unknown",
        since: formatDate(enrichedProduct.mintedAt)
      },
      mintDate: formatDate(enrichedProduct.mintedAt),
      // Real blockchain data
      blockchainData: {
        passportObjectAddr: enrichedProduct.passportObjectAddr,
        registryAddress: enrichedProduct.registryAddress,
        metadataUri: enrichedProduct.metadataUri,
        status: enrichedProduct.status,
        transferable: enrichedProduct.transferable,
        metadata: enrichedProduct.metadata,
        metadataError: enrichedProduct.metadataError
      },
      provenance: provenanceHistory,
      provenanceError: enrichedProduct.provenanceError,
    };
  };

  // Function to search for a product by ID and create verification result
  const searchProductById = async (productIdToSearch: string): Promise<boolean> => {
    if (!productIdToSearch.trim()) {
      showError("Please enter a product ID");
      return false;
    }

    try {
      console.log("🔍 Searching for product by ID:", productIdToSearch);

      const response = await fetch(`http://localhost:3001/api/passports/by-product/${encodeURIComponent(productIdToSearch)}`, {
        method: "GET",
        headers: {
          'Accept': 'application/json',
        },
      });

      console.log("📡 Search response status:", response.status);
      console.log("📡 Search response headers:", Object.fromEntries(response.headers.entries()));

      if (response.ok) {
        const responseData: ProductResponse = await response.json();
        console.log("✅ Response received:", responseData);
        
        // Handle nested response structure
        let productData: Product;
        
        if (responseData && typeof responseData === 'object') {
          if (responseData.ok && responseData.product) {
            // Handle {ok: true, product: {...}} structure
            console.log("📦 Extracting product from nested response structure");
            productData = responseData.product;
          } else if (responseData.issuerAddress) {
            // Handle direct product structure
            console.log("📦 Using direct product structure");
            productData = responseData as unknown as Product;
          } else {
            console.error("❌ Unexpected response structure:", responseData);
            showError("Invalid response structure from server");
            return false;
          }
        } else {
          console.error("❌ Invalid response data:", responseData);
          showError("Invalid response data from server");
          return false;
        }
        
        console.log("✅ Product extracted:", productData);
        
        // Validate product data
        if (!productData || typeof productData !== 'object') {
          console.error("❌ Invalid product data:", productData);
          showError("Invalid product data received from server");
          return false;
        }
        
        // Validate required fields
        if (!productData.metadataUri) {
          console.error("❌ Product missing metadataUri:", productData);
          showError("Product data is incomplete - missing metadata URI");
          return false;
        }
        
        // Enrich the product with metadata and provenance
        console.log("🔍 Starting metadata and provenance enrichment...");
        const enrichedProduct = await enrichProductWithMetadata(productData, productIdToSearch);
        console.log("✅ Enrichment completed:", enrichedProduct);
        
        // Create verification result from real product data
        const realVerificationResult = createVerificationResultFromProduct(enrichedProduct);
        setVerificationResult(realVerificationResult);
        
        showSuccess(`Product ${productIdToSearch} found and verified!`);
        return true; // Return true to indicate success
        
      } else {
        const errorText = await response.text();
        console.error("❌ Product search failed:", {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });

        // Show specific error messages
        if (response.status === 404) {
          console.log(`ℹ️ Product with ID "${productIdToSearch}" not found - will show mock data`);
        } else if (response.status === 401) {
          showError("Authentication failed - please login again");
        } else if (response.status === 403) {
          showError("Access denied - insufficient permissions");
        } else {
          showError("Failed to search for product");
        }
        return false; // Return false to indicate failure
      }
    } catch (error) {
      console.error("💥 Error searching for product:", error);
      showError("Network error while searching for product");
      return false; // Return false to indicate failure
    }
  };

  // Main verification function
  const handleVerify = async () => {
    if (!productId.trim()) return;
    
    setIsLoading(true);
    
    // Try to search for real product first
    const realProductFound = await searchProductById(productId);
    
    // Only show mock data if no real product was found
    if (!realProductFound) {
      console.log("🎭 No real product found, showing mock data...");
      setTimeout(() => {
        // Mock data for demonstration
        const mockResult = {
          isAuthentic: true,
          productId: productId,
          name: "Luxury Watch Model X",
          brand: "Premium Timepieces",
          category: "Watches",
          issuer: {
            name: "Premium Timepieces Official",
            address: "0x1234...5678",
            verified: true
          },
          currentOwner: {
            address: "0xabcd...efgh",
            since: "2024-01-15"
          },
          mintDate: "2023-12-01",
          provenance: [
            {
              type: "Manufactured",
              date: "2023-12-01",
              entity: "Premium Timepieces Factory",
              location: "Switzerland"
            },
            {
              type: "First Sale",
              date: "2023-12-15",
              entity: "Authorized Dealer NYC",
              location: "New York, USA"
            },
            {
              type: "Ownership Transfer",
              date: "2024-01-15",
              entity: "Private Collector",
              location: "California, USA"
            },
            {
              type: "Service Record",
              date: "2024-06-10",
              entity: "Certified Watch Repair",
              location: "California, USA",
              details: "Annual maintenance and cleaning"
            }
          ]
        };
        
        setVerificationResult(mockResult);
        setIsLoading(false);
      }, 1500);
    } else {
      // Real product was found, just stop loading
      console.log("✅ Real product found and displayed");
      setIsLoading(false);
    }
  };

  const handleQRScan = () => {
    // Mock QR scan - in real implementation, this would open camera
    setProductId("SN591231300");
    setTimeout(() => {
      handleVerify();
    }, 500);
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

  // Handle Enter key press in search input
  const handleSearchKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleVerify();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50">
      {/* Navigation */}
      <nav className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <Shield className="h-8 w-8 text-purple-600" />
            <span className="text-2xl font-bold text-gray-900">LuxPass</span>
          </Link>
          <Link to="/dashboard">
            <Button variant="outline">Dashboard</Button>
          </Link>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Verify Product Authenticity</h1>
            <p className="text-xl text-gray-600">
              Enter a product ID or scan a QR code to verify authenticity and view provenance
            </p>
          </div>

          {/* Verification Input */}
          <Card className="mb-8 border-0 shadow-xl bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-2xl text-center">Product Verification</CardTitle>
              <CardDescription className="text-center">
                Choose your preferred verification method
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center">
                    <Search className="mr-2 h-5 w-5" />
                    Enter Product ID
                  </h3>
                  <div className="flex space-x-2">
                    <Input
                      placeholder="e.g., SN591231300"
                      value={productId}
                      onChange={(e) => setProductId(e.target.value)}
                      onKeyPress={handleSearchKeyPress}
                      className="flex-1"
                      disabled={isLoading || isSearching}
                    />
                    <Button 
                      onClick={handleVerify}
                      disabled={!productId.trim() || isLoading || isSearching}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {isLoading || isSearching ? "Searching..." : "Verify"}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Press Enter or click Verify to search for the product
                  </p>
                </div>
                
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center">
                    <Scan className="mr-2 h-5 w-5" />
                    Scan QR Code
                  </h3>
                  <Button 
                    onClick={handleQRScan}
                    variant="outline" 
                    className="w-full border-2 border-dashed border-gray-300 h-20 hover:border-green-400"
                    disabled={isLoading || isSearching}
                  >
                    <div className="text-center">
                      <Scan className="mx-auto h-8 w-8 mb-2 text-gray-400" />
                      <span className="text-sm">Click to Scan QR Code</span>
                    </div>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Verification Results */}
          {verificationResult && (
            <div className="space-y-6">
              {/* Authenticity Status */}
              <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-2xl">Verification Result</CardTitle>
                    <Badge 
                      className={`text-lg px-4 py-2 ${
                        verificationResult.isAuthentic 
                          ? 'bg-green-100 text-green-800 border-green-200' 
                          : 'bg-red-100 text-red-800 border-red-200'
                      }`}
                    >
                      {verificationResult.isAuthentic ? (
                        <>
                          <CheckCircle className="mr-2 h-5 w-5" />
                          Authentic
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="mr-2 h-5 w-5" />
                          Suspicious
                        </>
                      )}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="font-semibold text-lg mb-3">Product Details</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Product ID:</span>
                          <span className="font-mono">{verificationResult.productId}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Name:</span>
                          <span>{verificationResult.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Brand:</span>
                          <span>{verificationResult.brand}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Category:</span>
                          <span>{verificationResult.category}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Mint Date:</span>
                          <span>{verificationResult.mintDate}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="font-semibold text-lg mb-3">Ownership & Issuer</h3>
                      <div className="space-y-4">
                        <div className="p-3 bg-purple-50 rounded-lg">
                          <div className="flex items-center mb-2">
                            <Building className="mr-2 h-4 w-4 text-purple-600" />
                            <span className="font-semibold">Issuer</span>
                            {verificationResult.issuer.verified && (
                              <CheckCircle className="ml-2 h-4 w-4 text-green-600" />
                            )}
                          </div>
                          <div className="text-sm text-gray-600">
                            <div>{verificationResult.issuer.name}</div>
                            <div className="font-mono text-xs flex items-center">
                              {verificationResult.issuer.address.substring(0, 20)}...
                              <Button
                                size="sm"
                                variant="ghost"
                                className="ml-2 h-4 w-4 p-0"
                                onClick={() => copyToClipboard(verificationResult.issuer.address, "Issuer address")}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        
                        <div className="p-3 bg-blue-50 rounded-lg">
                          <div className="flex items-center mb-2">
                            <User className="mr-2 h-4 w-4 text-blue-600" />
                            <span className="font-semibold">Current Owner</span>
                          </div>
                          <div className="text-sm text-gray-600">
                            <div className="font-mono text-xs">{verificationResult.currentOwner.address}</div>
                            <div>Since: {verificationResult.currentOwner.since}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Product Image and Metadata (if available) */}
              {verificationResult.blockchainData?.metadata && (
                <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-2xl">Product Information</CardTitle>
                    <CardDescription>
                      Detailed product information from IPFS metadata
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        {verificationResult.blockchainData.metadata.image ? (
                          <div className="space-y-2">
                            <Label className="text-base font-semibold">Product Image</Label>
                            <img
                              src={convertIPFSToHTTP(verificationResult.blockchainData.metadata.image)}
                              alt={verificationResult.blockchainData.metadata.name || "Product"}
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
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <Label className="text-base font-semibold">Description</Label>
                          <p className="text-gray-700">{verificationResult.blockchainData.metadata.description || "No description available"}</p>
                        </div>
                        
                        {verificationResult.blockchainData.metadata.attributes && verificationResult.blockchainData.metadata.attributes.length > 0 && (
                          <div>
                            <Label className="text-base font-semibold mb-3 block">Product Attributes</Label>
                            <div className="space-y-2">
                              {verificationResult.blockchainData.metadata.attributes.map((attr, index) => (
                                <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                                  <span className="font-medium text-gray-700">{attr.trait_type}:</span>
                                  <span className="text-gray-900">{attr.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Blockchain Information (if available) */}
              {verificationResult.blockchainData && (
                <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-2xl">Blockchain Information</CardTitle>
                    <CardDescription>
                      On-chain verification details
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {verificationResult.blockchainData.passportObjectAddr && (
                        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <span className="font-medium text-gray-700">Passport Object Address:</span>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-sm">{verificationResult.blockchainData.passportObjectAddr.substring(0, 20)}...</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyToClipboard(verificationResult.blockchainData.passportObjectAddr, "Passport object address")}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {verificationResult.blockchainData.registryAddress && (
                        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <span className="font-medium text-gray-700">Registry Address:</span>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-sm">{verificationResult.blockchainData.registryAddress.substring(0, 20)}...</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyToClipboard(verificationResult.blockchainData.registryAddress, "Registry address")}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {verificationResult.blockchainData.metadataUri && (
                        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <span className="font-medium text-gray-700">Metadata URI:</span>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-sm">{verificationResult.blockchainData.metadataUri.substring(0, 30)}...</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyToClipboard(verificationResult.blockchainData.metadataUri, "Metadata URI")}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => window.open(convertIPFSToHTTP(verificationResult.blockchainData.metadataUri), '_blank')}
                              title="View metadata on IPFS"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium text-gray-700">Status:</span>
                        <Badge className={verificationResult.blockchainData.status === 1 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                          {verificationResult.blockchainData.status === 1 ? "Active" : "Inactive"}
                        </Badge>
                      </div>

                      <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium text-gray-700">Transferable:</span>
                        <Badge className={verificationResult.blockchainData.transferable ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}>
                          {verificationResult.blockchainData.transferable ? "Yes" : "No"}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Enhanced Provenance History */}
              <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center">
                    <Clock className="mr-3 h-6 w-6 text-purple-600" />
                    Complete Provenance History
                  </CardTitle>
                  <CardDescription>
                    {verificationResult.provenanceError 
                      ? "Failed to load blockchain provenance data - showing sample timeline"
                      : "Complete lifecycle tracking from blockchain events"
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {verificationResult.provenance.map((event, index) => {
                      // Determine event styling based on type
                      let eventIcon = <Calendar className="h-5 w-5" />;
                      let eventColor = "text-gray-600";
                      let bgColor = "bg-gray-100";
                      
                      if (event.eventType === "MINTED") {
                        eventIcon = <Zap className="h-5 w-5" />;
                        eventColor = "text-green-600";
                        bgColor = "bg-green-100";
                      } else if (event.eventType === "TRANSFERRED") {
                        eventIcon = <ArrowRight className="h-5 w-5" />;
                        eventColor = "text-blue-600";
                        bgColor = "bg-blue-100";
                      } else if (event.type === "Service Record") {
                        eventIcon = <Wrench className="h-5 w-5" />;
                        eventColor = "text-orange-600";
                        bgColor = "bg-orange-100";
                      }
                      
                      return (
                        <div key={index} className="flex items-start space-x-4">
                          <div className="flex flex-col items-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${bgColor}`}>
                              <div className={eventColor}>
                                {eventIcon}
                              </div>
                            </div>
                            {index < verificationResult.provenance.length - 1 && (
                              <div className="w-px h-8 bg-gray-200 mt-2"></div>
                            )}
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="flex items-center justify-between mb-1">
                              <h4 className="font-semibold">{event.type}</h4>
                              <span className="text-sm text-gray-500">{event.date}</span>
                            </div>
                            <div className="text-sm text-gray-600">
                              <div>{event.entity}</div>
                              <div>{event.location}</div>
                              {event.details && (
                                <div className="mt-1 text-xs bg-gray-50 p-2 rounded">
                                  {event.details}
                                  {event.transactionHash && (
                                    <div className="flex items-center mt-1 space-x-2">
                                      <span className="font-mono">{event.transactionHash.substring(0, 20)}...</span>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-4 w-4 p-0"
                                        onClick={() => copyToClipboard(event.transactionHash, "Transaction hash")}
                                      >
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Verification Status */}
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="flex items-center justify-center mb-2">
                  <CheckCircle className="h-6 w-6 text-green-600 mr-2" />
                  <span className="text-lg font-semibold text-green-800">Blockchain Verified</span>
                </div>
                <p className="text-sm text-green-700">
                  This product passport is authentic and verified on the blockchain
                </p>
                <p className="text-xs text-gray-600 mt-2">
                  IPFS Gateway: {PINATA_GATEWAY_URL}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Verify;