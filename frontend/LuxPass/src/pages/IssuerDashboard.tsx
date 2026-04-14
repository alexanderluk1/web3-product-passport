import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Shield, Plus, FileText, Package, Zap, Calendar, Building, Upload, X, Image as ImageIcon, Wallet, User, RefreshCw, ExternalLink, Loader2, Copy, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { showSuccess, showError } from "@/utils/toast";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { LptPanel } from "@/components/LptPanel";

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const API_BASE_URL = "http://localhost:3001";
const FIXED_PASSPORT_SERVICE_LPT_FEE = "5";
const FIXED_PASSPORT_SERVICE_APT_FEE = "0.05";

type PassportFeeMode = "apt" | "lpt";

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
  mintedAt?: number;
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

const IssuerDashboard = () => {
  const { user, accessToken } = useAuth();
  const { account, signAndSubmitTransaction } = useWallet();
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState("create");
  const [lptWalletRefreshKey, setLptWalletRefreshKey] = useState(0);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [products, setProducts] = useState<EnrichedProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsSource, setProductsSource] = useState<"cache" | "chain" | null>(null);
  const [productsSyncedAt, setProductsSyncedAt] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<EnrichedProduct | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchProductId, setSearchProductId] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [lptBalance, setLptBalance] = useState("0");
  const [lptBalanceLoading, setLptBalanceLoading] = useState(false);
  const [mintFeeMode, setMintFeeMode] = useState<PassportFeeMode>("apt");
  const [formData, setFormData] = useState({
    name: "",
    brand: "",
    category: "",
    description: "",
    serialNumber: "",
    manufacturingDate: "",
    materials: "",
    origin: "",
    ownerWalletAddress: "",
    transferable: true // Add transferable field with default true
  });

  // Fetch products when component mounts or when accessToken changes
  useEffect(() => {
    if (accessToken) {
      fetchProducts();
    }
  }, [accessToken]);

  useEffect(() => {
    fetchLptBalance();
  }, [accessToken, user?.walletAddress, account]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);

    if (value === "create") {
      fetchLptBalance();
    }

    if (value === "lpt") {
      setLptWalletRefreshKey((current) => current + 1);
    }
  };

  // Helper function to convert IPFS URI to Pinata gateway URL
  const convertIPFSToHTTP = (uri: string): string => {
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
      
      // Convert IPFS URI to Pinata gateway URL
      const fetchUrl = convertIPFSToHTTP(metadataUri);
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

  // Helper function to enrich a single product with metadata
  const enrichProductWithMetadata = async (product: Product): Promise<EnrichedProduct> => {
    console.log(`🔍 Enriching product ${product.serialNumber} with IPFS metadata...`);
    
    try {
      const metadata = await fetchMetadataFromIPFS(product.metadataUri);
      
      return {
        ...product,
        metadata: metadata || undefined,
        metadataLoading: false,
        metadataError: !metadata,
      };
    } catch (error) {
      console.error(`💥 Error fetching metadata for product ${product.serialNumber}:`, error);
      
      return {
        ...product,
        metadataLoading: false,
        metadataError: true,
      };
    }
  };

  // Helper function to enrich products with metadata
  const enrichProductsWithMetadata = async (products: Product[]): Promise<EnrichedProduct[]> => {
    console.log(`🔍 Enriching ${products.length} products with IPFS metadata via Pinata gateway...`);
    
    const enrichedProducts: EnrichedProduct[] = products.map(product => ({
      ...product,
      metadataLoading: true,
      metadataError: false,
    }));
    
    // Update state immediately to show loading indicators
    setProducts(enrichedProducts);
    
    // Fetch metadata for each product
    const metadataPromises = products.map(async (product, index) => {
      try {
        const metadata = await fetchMetadataFromIPFS(product.metadataUri);
        
        // Update the specific product in the array
        setProducts(prevProducts => {
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
        setProducts(prevProducts => {
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
    
    console.log("✅ Metadata enrichment completed via Pinata gateway");
    return enrichedProducts;
  };

  // Function to search for a product by ID
  const searchProductById = async (productId: string) => {
    if (!productId.trim()) {
      showError("Please enter a product ID");
      return;
    }

    if (!accessToken) {
      showError("Please login to search for products");
      return;
    }

    setIsSearching(true);
    
    try {
      console.log("🔍 Searching for product by ID:", productId);
      console.log("📡 Using token:", accessToken?.substring(0, 20) + "...");

      const response = await fetch(`http://localhost:3001/api/passports/by-product/${encodeURIComponent(productId)}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      });

      console.log("📡 Search response status:", response.status);
      console.log("📡 Search response headers:", Object.fromEntries(response.headers.entries()));

      if (response.ok) {
        const productData: Product = await response.json();
        console.log("✅ Product found:", productData);
        
        // Enrich the product with metadata
        const enrichedProduct = await enrichProductWithMetadata(productData);
        
        // Open the modal with the found product
        setSelectedProduct(enrichedProduct);
        setIsModalOpen(true);
        
        showSuccess(`Product ${productId} found and loaded!`);
        
        // Clear the search input
        setSearchProductId("");
        
      } else {
        const errorText = await response.text();
        console.error("❌ Product search failed:", {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });

        // Show specific error messages
        if (response.status === 404) {
          showError(`Product with ID "${productId}" not found`);
        } else if (response.status === 401) {
          showError("Authentication failed - please login again");
        } else if (response.status === 403) {
          showError("Access denied - insufficient permissions");
        } else {
          showError("Failed to search for product");
        }
      }
    } catch (error) {
      console.error("💥 Error searching for product:", error);
      showError("Network error while searching for product");
    } finally {
      setIsSearching(false);
    }
  };

  const fetchProducts = async (showRefreshIndicator = false) => {
    if (!accessToken) {
      console.log("⚠️ No access token available for fetching products");
      return;
    }

    try {
      if (showRefreshIndicator) {
        setProductsLoading(true);
      }

      console.log("📡 Fetching products from GET /api/passports/products...");
      console.log("📡 Using token:", accessToken?.substring(0, 20) + "...");

      const response = await fetch("http://localhost:3001/api/passports/products", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      });

      console.log("📡 Products response status:", response.status);
      console.log("📡 Products response headers:", Object.fromEntries(response.headers.entries()));

      if (response.ok) {
        const data: ProductsResponse = await response.json();
        console.log("✅ Products response data:", data);
        console.log(`📊 Found ${data.products.length} products from ${data.source}`);
        console.log(`🕒 Data synced at: ${new Date(data.syncedAt).toISOString()}`);

        // Log each product for detailed tracking
        data.products.forEach((product, index) => {
          console.log(`   ${index + 1}. Serial: ${product.serialNumber} - Owner: ${product.ownerAddress.substring(0, 10)}... - Minted: ${product.mintedAt ? new Date(product.mintedAt).toISOString() : 'N/A'}`);
        });

        setProductsSource(data.source);
        setProductsSyncedAt(data.syncedAt);

        // Enrich products with IPFS metadata
        await enrichProductsWithMetadata(data.products);

        if (showRefreshIndicator) {
          const message = `Products refreshed! Found ${data.products.length} products from ${data.source}.`;
          console.log(`🎉 ${message}`);
          showSuccess(message);
        }
      } else {
        const errorText = await response.text();
        console.error("❌ Failed to fetch products:", {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });

        // Show specific error messages
        if (response.status === 401) {
          showError("Authentication failed - please login again");
        } else if (response.status === 403) {
          showError("Access denied - issuer role required");
        } else if (response.status === 404) {
          showError("Products API not found - check backend configuration");
        } else {
          showError("Failed to fetch products");
        }
      }
    } catch (error) {
      console.error("💥 Error fetching products:", error);
      showError("Network error fetching products");
    } finally {
      if (showRefreshIndicator) {
        setProductsLoading(false);
      }
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type (must match backend validation)
      if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
        showError("Unsupported image type. Please upload JPG, PNG, or WEBP.");
        return;
      }

      // Validate file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        showError("Image size must be less than 5MB");
        return;
      }

      console.log("📸 Image selected:", {
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
        type: file.type
      });

      setSelectedImage(file);

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      showSuccess("Image uploaded successfully!");
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    // Reset the file input
    const fileInput = document.getElementById('productImage') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
    console.log("📸 Image removed");
  };

  const validateWalletAddress = (address: string) => {
    // Basic validation for Aptos wallet address format
    if (!address) return true; // Optional field
    
    // Aptos addresses are typically 64 characters long and start with 0x
    const aptosAddressRegex = /^0x[a-fA-F0-9]{1,64}$/;
    return aptosAddressRegex.test(address);
  };

  // Helper function to safely get address string
  const getAddressString = (account: any) => {
    if (!account) return "";
    
    if (typeof account.address === 'string') {
      return account.address;
    } else if (account.address && typeof account.address.toString === 'function') {
      return account.address.toString();
    }
    
    return "";
  };

  const getActiveWalletAddress = () => getAddressString(account) || user?.walletAddress;

  const formatLptBalance = () => {
    if (lptBalanceLoading) return "Loading...";
    return `${lptBalance} LPT`;
  };

  const fetchLptBalance = async () => {
    if (!accessToken) {
      setLptBalance("0");
      return;
    }

    const walletAddress = getActiveWalletAddress();
    if (!walletAddress) {
      setLptBalance("0");
      return;
    }

    setLptBalanceLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/tokens/balance/${encodeURIComponent(walletAddress)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Failed to load LPT balance.");
      }

      setLptBalance(String(data.balance ?? "0"));
    } catch (error) {
      console.error("Failed to fetch issuer LPT balance:", error);
      setLptBalance("0");
    } finally {
      setLptBalanceLoading(false);
    }
  };

  // Helper function to convert byte vectors to arrays
  const convertToByteArray = (data: any): number[] => {
    console.log("🔧 Converting to byte array:", { data, type: typeof data });
    
    if (Array.isArray(data)) {
      console.log("🔧 Already an array:", data);
      return data;
    }
    
    if (data instanceof Uint8Array) {
      const result = Array.from(data);
      console.log("🔧 Converted Uint8Array to array:", result);
      return result;
    }
    
    if (typeof data === 'object' && data !== null) {
      // Handle object maps like { "0": 123, "1": 45, ... }
      const keys = Object.keys(data).map(Number).sort((a, b) => a - b);
      const result = keys.map(key => data[key]);
      console.log("🔧 Converted object map to array:", { keys, result });
      return result;
    }
    
    if (typeof data === 'string') {
      // Handle hex strings
      if (data.startsWith('0x')) {
        const hex = data.slice(2);
        const result = [];
        for (let i = 0; i < hex.length; i += 2) {
          result.push(parseInt(hex.substr(i, 2), 16));
        }
        console.log("🔧 Converted hex string to array:", result);
        return result;
      }
      
      // Handle regular strings as UTF-8 bytes
      const result = Array.from(new TextEncoder().encode(data));
      console.log("🔧 Converted string to UTF-8 byte array:", result);
      return result;
    }
    
    console.warn("⚠️ Unknown data type for byte conversion:", data);
    return [];
  };

  const handleCreateProduct = async () => {
    const requiredFields = [
      formData.name,
      formData.brand,
      formData.category,
      formData.description,
      formData.serialNumber,
      formData.manufacturingDate,
      formData.materials,
      formData.origin,
    ];

    if (requiredFields.some((value) => !value.trim())) {
      showError("Please fill in all required fields before submitting.");
      return;
    }

    // Validate wallet address if provided
    if (formData.ownerWalletAddress && !validateWalletAddress(formData.ownerWalletAddress)) {
      showError("Please enter a valid wallet address (0x...)");
      return;
    }

    if (!accessToken) {
      showError("Please login to create products");
      return;
    }

    if (!selectedImage) {
      showError("Product image is required.");
      return;
    }

    const connectedWalletAddress = getAddressString(account).toLowerCase();
    const authenticatedWalletAddress = user?.walletAddress?.toLowerCase();
    if (!connectedWalletAddress) {
      showError("Please connect your wallet before minting a passport.");
      return;
    }
    if (authenticatedWalletAddress && connectedWalletAddress !== authenticatedWalletAddress) {
      showError("Connected wallet must match the wallet you logged in with.");
      return;
    }

    if (mintFeeMode === "lpt") {
      const currentBalance = BigInt(/^\d+$/.test(lptBalance) ? lptBalance : "0");
      if (BigInt(FIXED_PASSPORT_SERVICE_LPT_FEE) > currentBalance) {
        showError(`You need ${FIXED_PASSPORT_SERVICE_LPT_FEE} LPT for this passport mint.`);
        return;
      }
    }

    setIsCreating(true);
    
    try {
      console.log("📦 Creating product with multipart/form-data...");
      console.log("🔄 Transferable setting:", formData.transferable);
      
      // Create FormData for multipart/form-data request
      const formDataToSend = new FormData();
      
      // Add all form fields with backend expected field names
      formDataToSend.append('productName', formData.name);
      formDataToSend.append('brand', formData.brand);
      formDataToSend.append('category', formData.category);
      formDataToSend.append('description', formData.description);
      formDataToSend.append('serialNumber', formData.serialNumber);
      formDataToSend.append('manufacturingDate', formData.manufacturingDate);
      formDataToSend.append('countryOfOrigin', formData.origin);
      
      // Handle materials - send as comma-separated string
      formDataToSend.append('materials', formData.materials);
      
      // Add transferable setting
      formDataToSend.append('transferable', formData.transferable.toString());
      
      // Add owner address (use connected wallet if not provided in the form)
      const ownerAddress = formData.ownerWalletAddress || getAddressString(account);
      if (!ownerAddress) {
        showError("Owner wallet address is required.");
        return;
      }
      if (!validateWalletAddress(ownerAddress)) {
        showError("Please enter a valid owner wallet address (0x...)");
        return;
      }
      formDataToSend.append('ownerAddress', ownerAddress);
      
      // Add image (required)
      formDataToSend.append('image', selectedImage);
      console.log("📸 Adding image to form data:", selectedImage.name);

      // Log form data contents
      console.log("📡 Form data contents:");
      for (let [key, value] of formDataToSend.entries()) {
        if (value instanceof File) {
          console.log(`  ${key}: [File] ${value.name} (${(value.size / 1024 / 1024).toFixed(2)}MB)`);
        } else {
          console.log(`  ${key}: ${value}`);
        }
      }

      // Send multipart/form-data request to backend
      console.log("📡 Sending multipart request to backend...");
      const mintEndpoint =
        mintFeeMode === "lpt"
          ? "/api/passports/mint-with-burn-lpt/prepare"
          : "/api/passports/mint-with-burn/prepare";
      console.log("Sending mint prepare request to backend:", mintEndpoint);
      const response = await fetch(`${API_BASE_URL}${mintEndpoint}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          // Don't set Content-Type - let browser set it with boundary for multipart
        },
        body: formDataToSend,
      });

      console.log("📡 Backend response status:", response.status);
      console.log("📡 Backend response headers:", Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Backend request failed:", {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`Backend request failed: ${response.status} ${response.statusText}`);
      }

      const backendData = await response.json();
      console.log("✅ Backend response data:", backendData);

      if (!backendData.success) {
        throw new Error("Backend returned success: false");
      }

      // Show success message with IPFS details
      showSuccess(`Product passport created! Metadata: ${backendData.metadataCid}`);
      
      console.log("🎯 IPFS Upload Results:");
      console.log("  📸 Image CID:", backendData.imageCid);
      console.log("  📸 Image IPFS URI:", backendData.imageIpfsUri);
      console.log("  📄 Metadata CID:", backendData.metadataCid);
      console.log("  📄 Metadata IPFS URI:", backendData.metadataIpfsUri);
      console.log("  📋 Metadata:", backendData.metadata);

      // Now handle blockchain minting with wallet
      if (backendData.payload && account) {
        console.log("🔗 Initiating blockchain transaction...");
        console.log("🔗 Raw transaction payload:", backendData.payload);
        
        try {
          const rawArgs = backendData.payload.functionArguments;
          console.log("🔧 Raw arguments received:", rawArgs);
          console.log("🔧 Arguments length:", Array.isArray(rawArgs) ? rawArgs.length : "not array");
          console.log("🔧 Arguments types:", rawArgs?.map((arg, i) => `${i}: ${typeof arg} = ${arg}`));

          if (!Array.isArray(rawArgs)) {
            throw new Error("Invalid payload: functionArguments is not an array");
          }

          // Handle different argument lengths flexibly
          let processedArgs = [];
          
          if (rawArgs.length === 3) {
            // Handle 3-argument format: [owner, serialNumber, metadataUri]
            console.log("🔧 Processing 3-argument format");
            const [ownerAddr, serialPlain, metadataUri] = rawArgs;
            
            processedArgs = [
              ownerAddr,
              convertToByteArray(serialPlain),
              metadataUri,
            ];
          } else if (rawArgs.length === 6 || rawArgs.length === 8 || rawArgs.length === 10) {
            // Handle 6-argument mint, 8-argument mint_with_burn,
            // and 10-argument mint_with_burn_lpt payloads.
            console.log(`🔧 Processing ${rawArgs.length}-argument mint format`);
            const [
              registryAddr,
              ownerAddr,
              serialPlain,
              metadataUri,
              metadataBytes,
              transferable,
              ...extraArgs
            ] = rawArgs;

            processedArgs = [
              registryAddr,
              ownerAddr,
              convertToByteArray(serialPlain),
              metadataUri,
              convertToByteArray(metadataBytes),
              // Properly convert transferable to boolean
              transferable === true || transferable === "true" || transferable === 1,
              ...extraArgs,
            ];
          } else {
            throw new Error(
              `Unsupported payload format. Expected 3, 6, 8, or 10 arguments, got ${rawArgs.length}. Args: ${JSON.stringify(rawArgs)}`
            );
          }

          // Show loading state for blockchain transaction
          showSuccess("Initiating blockchain transaction...");
          
          console.log("🔧 Original arguments:", rawArgs);
          console.log("🔧 Processed arguments:", processedArgs);
          console.log("🔧 Processed argument types:", processedArgs.map((arg, i) => `${i}: ${typeof arg} = ${Array.isArray(arg) ? `array[${arg.length}]` : typeof arg}`));
          if (mintFeeMode === "apt" && backendData.feePayload) {
            showSuccess(`Paying ${backendData.feeAmountApt ?? FIXED_PASSPORT_SERVICE_APT_FEE} APT service fee...`);
            const feeTx = await signAndSubmitTransaction({
              data: {
                function: backendData.feePayload.function,
                functionArguments: backendData.feePayload.functionArguments,
              },
              options: {
                maxGasAmount: 200000,
                gasUnitPrice: 100,
                expirationSecondsFromNow: 60,
              },
            });
            console.log("APT service fee transaction submitted:", feeTx);
          }

          // Submit transaction to Aptos blockchain via wallet
          const transactionPayload = {
            data: {
              function: backendData.payload.function,
              functionArguments: processedArgs,
            },
            options: {
              maxGasAmount: 200000,
              gasUnitPrice: 100,
              expirationSecondsFromNow: 60,
            },
          };
          
          console.log("🔗 Final transaction payload:", transactionPayload);
          
          const transactionResponse = await signAndSubmitTransaction(transactionPayload);

          console.log("✅ Blockchain transaction submitted:", transactionResponse);
          console.log("🔗 Transaction hash:", transactionResponse.hash);
          
          showSuccess(
            mintFeeMode === "lpt"
              ? `Product minted with ${FIXED_PASSPORT_SERVICE_LPT_FEE} LPT charged! TX: ${transactionResponse.hash.substring(0, 10)}...`
              : `Product minted after ${FIXED_PASSPORT_SERVICE_APT_FEE} APT service fee! TX: ${transactionResponse.hash.substring(0, 10)}...`
          );
          
          // Reset form after successful creation and minting
          setFormData({
            name: "",
            brand: "",
            category: "",
            description: "",
            serialNumber: "",
            manufacturingDate: "",
            materials: "",
            origin: "",
            ownerWalletAddress: "",
            transferable: true // Reset to default true
          });
          
          // Reset image
          setSelectedImage(null);
          setImagePreview(null);
          const fileInput = document.getElementById('productImage') as HTMLInputElement;
          if (fileInput) {
            fileInput.value = '';
          }

          // Refresh products list after successful minting
          console.log("🔄 Refreshing products list after successful minting...");
          setTimeout(() => {
            fetchProducts(true);
            fetchLptBalance();
          }, 2000); // Wait 2 seconds for blockchain to process
          
        } catch (walletError) {
          console.error("💥 Wallet transaction error:", walletError);
          console.error("💥 Error details:", {
            message: walletError.message,
            stack: walletError.stack,
            payload: backendData.payload
          });
          showError("Blockchain transaction failed. Product created but not minted.");
        }
      } else {
        console.log("⚠️ No payload or account available for blockchain transaction");
        showError("Product created but blockchain minting skipped (no wallet or payload)");
      }

    } catch (error) {
      console.error("💥 Error creating product:", error);
      showError("Failed to create product passport");
    } finally {
      setIsCreating(false);
    }
  };

  const fillCurrentUserAddress = () => {
    if (user?.walletAddress) {
      setFormData(prev => ({ ...prev, ownerWalletAddress: user.walletAddress }));
      showSuccess("Current user wallet address filled");
    } else {
      showError("No wallet address found for current user");
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
    setSelectedProduct(product);
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

  // Handle Enter key press in search input
  const handleSearchKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      searchProductById(searchProductId);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Navigation */}
      <nav className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <Shield className="h-8 w-8 text-purple-600" />
            <span className="text-2xl font-bold text-gray-900">LuxPass</span>
          </Link>
          <div className="flex items-center space-x-4">
            <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">
              <Building className="mr-1 h-3 w-3" />
              Issuer
            </Badge>
            <Link to="/dashboard">
              <Button variant="outline">Dashboard</Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Issuer Dashboard</h1>
            <p className="text-gray-600">Create and manage product passports for your luxury goods</p>
            <div className="mt-2 text-xs text-gray-500">
              IPFS Gateway: {PINATA_GATEWAY_URL}
            </div>
          </div>

          {/* Product Search Section */}
          <Card className="mb-6 border-0 shadow-xl bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-xl flex items-center">
                <Search className="mr-3 h-5 w-5 text-blue-600" />
                Search Product by ID
              </CardTitle>
              <CardDescription>
                Enter a product ID to view its details and open the product modal
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex space-x-4">
                <Input
                  placeholder="Enter product ID (e.g., SN123456789)"
                  value={searchProductId}
                  onChange={(e) => setSearchProductId(e.target.value)}
                  onKeyPress={handleSearchKeyPress}
                  className="flex-1"
                  disabled={isSearching}
                />
                <Button 
                  onClick={() => searchProductById(searchProductId)}
                  disabled={isSearching || !searchProductId.trim()}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Search className="mr-2 h-4 w-4" />
                  {isSearching ? "Searching..." : "Search"}
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Press Enter or click Search to find a product by its ID
              </p>
            </CardContent>
          </Card>

          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 bg-white/80 backdrop-blur-sm">
              <TabsTrigger value="create" className="flex items-center">
                <Plus className="mr-2 h-4 w-4" />
                Create Product
              </TabsTrigger>
              <TabsTrigger value="manage" className="flex items-center">
                <Package className="mr-2 h-4 w-4" />
                Manage Products ({products.length})
              </TabsTrigger>
              <TabsTrigger value="lpt" className="flex items-center">
                <Wallet className="mr-2 h-4 w-4" />
                LPT Wallet
              </TabsTrigger>
            </TabsList>

            {/* Create Product Tab */}
            <TabsContent value="create">
              <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center">
                    <FileText className="mr-3 h-6 w-6 text-purple-600" />
                    Create New Product Passport
                  </CardTitle>
                  <CardDescription>
                    Enter product details to create a new digital passport and mint it on the blockchain
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Image Upload Section */}
                  <div className="space-y-4">
                    <Label htmlFor="productImage" className="text-base font-semibold">Product Image</Label>
                    
                    {!imagePreview ? (
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-purple-400 transition-colors">
                        <input
                          id="productImage"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                        <label
                          htmlFor="productImage"
                          className="cursor-pointer flex flex-col items-center space-y-4"
                        >
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                            <Upload className="h-8 w-8 text-gray-400" />
                          </div>
                          <div>
                            <p className="text-lg font-medium text-gray-700">Upload Product Image</p>
                            <p className="text-sm text-gray-500">Click to browse or drag and drop</p>
                            <p className="text-xs text-gray-400 mt-1">PNG, JPG, JPEG up to 5MB</p>
                          </div>
                        </label>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="border rounded-lg p-4 bg-gray-50">
                          <div className="flex items-start space-x-4">
                            <div className="relative">
                              <img
                                src={imagePreview}
                                alt="Product preview"
                                className="w-32 h-32 object-cover rounded-lg border"
                              />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-gray-900">{selectedImage?.name}</p>
                                  <p className="text-sm text-gray-500">
                                    {selectedImage ? `${(selectedImage.size / 1024 / 1024).toFixed(2)}MB` : ''}
                                  </p>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={removeImage}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Remove
                                </Button>
                              </div>
                              <div className="mt-2">
                                <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                                  <ImageIcon className="mr-1 h-3 w-3" />
                                  Image Ready
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="name">Product Name *</Label>
                        <Input
                          id="name"
                          placeholder="e.g., Luxury Watch Model X"
                          value={formData.name}
                          onChange={(e) => handleInputChange("name", e.target.value)}
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="brand">Brand *</Label>
                        <Input
                          id="brand"
                          placeholder="e.g., Premium Timepieces"
                          value={formData.brand}
                          onChange={(e) => handleInputChange("brand", e.target.value)}
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="category">Category *</Label>
                        <Select value={formData.category} onValueChange={(value) => handleInputChange("category", value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="watches">Watches</SelectItem>
                            <SelectItem value="jewelry">Jewelry</SelectItem>
                            <SelectItem value="accessories">Accessories</SelectItem>
                            <SelectItem value="clothing">Clothing</SelectItem>
                            <SelectItem value="art">Art & Collectibles</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label htmlFor="serialNumber">Serial Number *</Label>
                        <Input
                          id="serialNumber"
                          placeholder="e.g., SN123456789"
                          value={formData.serialNumber}
                          onChange={(e) => handleInputChange("serialNumber", e.target.value)}
                        />
                      </div>

                      <div>
                        <Label htmlFor="ownerWalletAddress">Owner Wallet Address *</Label>
                        <div className="flex space-x-2">
                          <Input
                            id="ownerWalletAddress"
                            placeholder="0x... (optional - uses your wallet if empty)"
                            value={formData.ownerWalletAddress}
                            onChange={(e) => handleInputChange("ownerWalletAddress", e.target.value)}
                            className={`flex-1 ${
                              formData.ownerWalletAddress && !validateWalletAddress(formData.ownerWalletAddress)
                                ? 'border-red-300 focus:border-red-500'
                                : ''
                            }`}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={fillCurrentUserAddress}
                            className="shrink-0"
                            title="Use my wallet address"
                          >
                            <User className="h-4 w-4" />
                          </Button>
                        </div>
                        {formData.ownerWalletAddress && !validateWalletAddress(formData.ownerWalletAddress) && (
                          <p className="text-sm text-red-600 mt-1">
                            Please enter a valid wallet address starting with 0x
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          Leave empty to use your connected wallet address
                        </p>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="manufacturingDate">Manufacturing Date *</Label>
                        <Input
                          id="manufacturingDate"
                          type="date"
                          value={formData.manufacturingDate}
                          onChange={(e) => handleInputChange("manufacturingDate", e.target.value)}
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="materials">Materials *</Label>
                        <Input
                          id="materials"
                          placeholder="e.g., Leather, Canvas, Gold"
                          value={formData.materials}
                          onChange={(e) => handleInputChange("materials", e.target.value)}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Separate multiple materials with commas
                        </p>
                      </div>
                      
                      <div>
                        <Label htmlFor="origin">Country of Origin *</Label>
                        <Input
                          id="origin"
                          placeholder="e.g., Switzerland"
                          value={formData.origin}
                          onChange={(e) => handleInputChange("origin", e.target.value)}
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="description">Description *</Label>
                        <Textarea
                          id="description"
                          placeholder="Detailed product description..."
                          value={formData.description}
                          onChange={(e) => handleInputChange("description", e.target.value)}
                          rows={3}
                        />
                      </div>

                      {/* Transferable Toggle */}
                      <div className="space-y-2">
                        <Label htmlFor="transferable" className="text-base font-semibold">Transfer Settings</Label>
                        <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                          <Switch
                            id="transferable"
                            checked={formData.transferable}
                            onCheckedChange={(checked) => handleInputChange("transferable", checked)}
                          />
                          <div className="flex-1">
                            <Label htmlFor="transferable" className="text-sm font-medium cursor-pointer">
                              Allow ownership transfers
                            </Label>
                            <p className="text-xs text-gray-500 mt-1">
                              {formData.transferable 
                                ? "This passport can be transferred to other wallets" 
                                : "This passport will be permanently locked to the owner's wallet"
                              }
                            </p>
                          </div>
                          <Badge className={formData.transferable ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                            {formData.transferable ? "Transferable" : "Non-transferable"}
                          </Badge>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <Label className="text-base font-semibold">Passport Mint Payment</Label>
                            <p className="text-xs text-gray-600">
                              LuxPass charges a fixed passport mint service fee. Choose APT or LPT.
                            </p>
                          </div>
                          <Badge className="bg-white text-emerald-700 border border-emerald-200">
                            {formatLptBalance()}
                          </Badge>
                        </div>

                        <RadioGroup
                          value={mintFeeMode}
                          onValueChange={(value) => setMintFeeMode(value as PassportFeeMode)}
                          className="grid gap-3 sm:grid-cols-2"
                        >
                          <Label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3">
                            <RadioGroupItem value="apt" className="mt-1" />
                            <span>
                              <span className="block font-semibold">Pay service fee with APT</span>
                              <span className="block text-xs font-normal text-gray-600">
                                Pays 0.05 APT service fee before the passport mint transaction.
                              </span>
                            </span>
                          </Label>
                          <Label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3">
                            <RadioGroupItem value="lpt" className="mt-1" />
                            <span>
                              <span className="block font-semibold">Pay platform fee with LPT</span>
                              <span className="block text-xs font-normal text-gray-600">
                                Uses mint_with_burn_lpt and charges 5 LPT.
                              </span>
                            </span>
                          </Label>
                        </RadioGroup>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end space-x-4">
                    <Button variant="outline" onClick={() => {
                      setFormData({
                        name: "", brand: "", category: "", description: "",
                        serialNumber: "", manufacturingDate: "", materials: "", origin: "",
                        ownerWalletAddress: "", transferable: true
                      });
                      removeImage();
                    }}>
                      Clear Form
                    </Button>
                    <Button 
                      onClick={handleCreateProduct}
                      disabled={
                        isCreating ||
                        !account ||
                        lptBalanceLoading
                      }
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      <Zap className="mr-2 h-4 w-4" />
                      {isCreating ? "Creating & Minting..." : "Create & Mint Product"}
                    </Button>
                  </div>
                  
                  {!account && (
                    <div className="text-center p-4 bg-yellow-50 rounded-lg">
                      <p className="text-sm text-yellow-800">
                        <Wallet className="inline mr-1 h-4 w-4" />
                        Please connect your wallet to create and mint products
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Manage Products Tab */}
            <TabsContent value="manage">
              <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-2xl flex items-center">
                        <Package className="mr-3 h-6 w-6 text-purple-600" />
                        Product Management ({products.length})
                      </CardTitle>
                      <CardDescription>
                        View and manage your created product passports
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
                      onClick={() => fetchProducts(true)}
                      disabled={productsLoading}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${productsLoading ? 'animate-spin' : ''}`} />
                      {productsLoading ? "Refreshing..." : "Refresh"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {products.length === 0 ? (
                    <div className="text-center py-8">
                      <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <p className="text-gray-500">No products found.</p>
                      <p className="text-xs text-gray-400 mt-2">Create your first product passport to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {products.map((product) => (
                        <div 
                          key={`${product.transactionHash}-${product.serialNumber}`} 
                          className="border rounded-lg p-4 bg-white/50 cursor-pointer hover:bg-white/70 hover:shadow-md transition-all duration-200"
                          onClick={() => handleViewProductDetails(product)}
                          title="Click to view product details"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <h3 className="font-semibold text-lg">{getProductDisplayName(product)}</h3>
                                {product.metadataLoading && (
                                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                                )}
                              </div>
                              <div className="space-y-1">
                                {getProductBrand(product) && getProductCategory(product) && (
                                  <p className="text-sm text-gray-600">{getProductBrand(product)} • {getProductCategory(product)}</p>
                                )}
                                <p className="text-sm text-gray-600">Serial: {product.serialNumber}</p>
                                <p className="text-xs text-gray-500 font-mono">TX: {product.transactionHash.substring(0, 20)}...</p>
                              </div>
                            </div>
                            <div className="text-right space-y-2">
                              <Badge className="bg-green-100 text-green-800 border-green-200">
                                Minted
                              </Badge>
                              <div>
                                <Badge className={product.transferable ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}>
                                  {product.transferable ? "Transferable" : "Non-transferable"}
                                </Badge>
                              </div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 gap-4 text-sm text-gray-600">
                            <div>
                              <span className="font-medium">Owner:</span>
                              <span className="font-mono text-xs ml-2">{product.ownerAddress.substring(0, 10)}...{product.ownerAddress.substring(product.ownerAddress.length - 6)}</span>
                            </div>
                            {product.mintedAt && (
                              <div className="flex items-center">
                                <Calendar className="mr-2 h-4 w-4" />
                                Minted on {formatDate(product.mintedAt)}
                              </div>
                            )}
                            {product.metadataError && (
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
              <LptPanel mode="issuer" refreshKey={lptWalletRefreshKey} />
            </TabsContent>
          </Tabs>

          {/* Product Details Modal */}
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-2xl flex items-center">
                  <Package className="mr-3 h-6 w-6 text-purple-600" />
                  Product Passport Details
                </DialogTitle>
                <DialogDescription>
                  Complete information for this product passport
                </DialogDescription>
              </DialogHeader>
              
              {selectedProduct && (
                <div className="space-y-6">
                  {/* Product Image and Basic Info */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      {selectedProduct.metadata?.image ? (
                        <div className="space-y-2">
                          <Label className="text-base font-semibold">Product Image</Label>
                          <img
                            src={convertIPFSToHTTP(selectedProduct.metadata.image)}
                            alt={selectedProduct.metadata.name || "Product"}
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
                        <Label className="text-base font-semibold">Product Name</Label>
                        <p className="text-lg">{selectedProduct.metadata?.name || `Product ${selectedProduct.serialNumber}`}</p>
                      </div>
                      
                      <div>
                        <Label className="text-base font-semibold">Description</Label>
                        <p className="text-gray-700">{selectedProduct.metadata?.description || "No description available"}</p>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium">Serial Number</Label>
                        <div className="flex items-center space-x-2">
                          <p className="font-mono text-sm">{selectedProduct.serialNumber}</p>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(selectedProduct.serialNumber, "Serial number")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Product Attributes */}
                  {selectedProduct.metadata?.attributes && selectedProduct.metadata.attributes.length > 0 && (
                    <div>
                      <Label className="text-base font-semibold mb-3 block">Product Attributes</Label>
                      <div className="grid md:grid-cols-2 gap-4">
                        {selectedProduct.metadata.attributes.map((attr, index) => (
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
                          <span className="font-mono text-sm">{selectedProduct.transactionHash.substring(0, 20)}...</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(selectedProduct.transactionHash, "Transaction hash")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium text-gray-700">Owner Address:</span>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-sm">{selectedProduct.ownerAddress.substring(0, 20)}...</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(selectedProduct.ownerAddress, "Owner address")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium text-gray-700">Issuer Address:</span>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-sm">{selectedProduct.issuerAddress.substring(0, 20)}...</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(selectedProduct.issuerAddress, "Issuer address")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium text-gray-700">Metadata URI:</span>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-sm">{selectedProduct.metadataUri.substring(0, 20)}...</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(selectedProduct.metadataUri, "Metadata URI")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.open(convertIPFSToHTTP(selectedProduct.metadataUri), '_blank')}
                            title="View metadata on IPFS"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      {selectedProduct.mintedAt && (
                        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <span className="font-medium text-gray-700">Minted Date:</span>
                          <span>{formatDate(selectedProduct.mintedAt)}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium text-gray-700">Transferable:</span>
                        <Badge className={selectedProduct.transferable ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}>
                          {selectedProduct.transferable ? "Yes" : "No"}
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

export default IssuerDashboard;
