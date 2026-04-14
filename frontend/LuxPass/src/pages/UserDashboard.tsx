import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Shield, Package, ArrowRightLeft, Search, User, Eye, Calendar,
  Copy, ExternalLink, Image as ImageIcon, RefreshCw, Loader2, Lock,
  Store, Truck, RotateCcw, MapPin, CheckCircle2, Clock, AlertCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { showSuccess, showError } from "@/utils/toast";
import { fetchListingsByStatusMap } from "@/utils/listings";
import { octasToApt, aptToOctas, getAptUsdPrice, formatUsd } from "@/utils/price";

const PINATA_GATEWAY_URL = "https://amaranth-passive-chicken-549.mypinata.cloud";
const BASE_URL = "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  passportObjectAddr?: string;
  onChainStatus?: number; // 1=ACTIVE, 4=STORING, 5=VERIFYING, 6=LISTING, 7=RETURNING
}

interface ProductMetadata {
  name: string;
  description: string;
  image: string;
  attributes: Array<{ trait_type: string; value: string }>;
}

interface EnrichedProduct extends Product {
  metadata?: ProductMetadata;
  metadataLoading?: boolean;
  metadataError?: boolean;
}

interface ListingRequest {
  id: string;
  passport_object_address: string;
  owner_address: string;
  status: string;
  has_passport: boolean;
  price_octas: string | null; // Added
  escrow_tx_hash: string | null; // Added
  in_escrow: boolean;
  created_at: string;
  updated_at: string;
}

interface DelistRequest {
  id: string;
  passport_object_address: string;
  requester_address: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state?: string;
  postal_code: string;
  country: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ShippingAddress {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LISTING_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:        { label: "Pending Shipment",  color: "bg-yellow-100 text-yellow-800" },
  verifying:      { label: "Under Verification",color: "bg-blue-100 text-blue-800"   },
  listed:         { label: "Live on Market",    color: "bg-green-100 text-green-800"  },
  request_return: { label: "Return Requested",  color: "bg-orange-100 text-orange-800"},
  returning:      { label: "Being Returned",    color: "bg-purple-100 text-purple-800"},
  returned:       { label: "Returned",          color: "bg-gray-100 text-gray-800"    },
  sold:           { label: "Sold",              color: "bg-emerald-100 text-emerald-800"},
};

const formatDate = (ts: string | number) =>
  new Date(ts).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

// ─── Component ────────────────────────────────────────────────────────────────

const UserDashboard = () => {
  const { user, accessToken } = useAuth();
  const { signAndSubmitTransaction } = useWallet();

  // Passport state
  const [ownedPassports, setOwnedPassports]     = useState<EnrichedProduct[]>([]);
  const [productsLoading, setProductsLoading]   = useState(false);
  const [productsSource, setProductsSource]     = useState<"cache" | "chain" | null>(null);
  const [productsSyncedAt, setProductsSyncedAt] = useState<number | null>(null);

  // Transfer state
  const [selectedPassport, setSelectedPassport] = useState<EnrichedProduct | null>(null);
  const [transferAddress, setTransferAddress]   = useState("");
  const [isTransferring, setIsTransferring]     = useState(false);
  const [isModalOpen, setIsModalOpen]           = useState(false);

  // Marketplace – list state
  const [listPassportAddr, setListPassportAddr] = useState("");
  const [isListing, setIsListing]               = useState(false);
  const [isListingNoPassport, setIsListingNoPassport] = useState(false);

  // Marketplace – my listings state
  const [myListings, setMyListings]             = useState<ListingRequest[]>([]);
  const [listingsLoading, setListingsLoading]   = useState(false);

  // Delist / return state
  const [delistingPassportAddr, setDelistingPassportAddr] = useState<string | null>(null);
  const [shippingAddress, setShippingAddress]   = useState<ShippingAddress>({
    addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", country: "",
  });
  const [isDelisting, setIsDelisting]           = useState(false);

  // Receipt state
  const [isConfirmingReceipt, setIsConfirmingReceipt] = useState<string | null>(null);

  // Escrow state
  const [escrowPriceAddr, setEscrowPriceAddr]     = useState<string | null>(null);
  const [escrowPriceApt, setEscrowPriceApt]       = useState("");
  const [isEscrowListing, setIsEscrowListing]     = useState(false);
  const [aptUsdRate, setAptUsdRate]               = useState(0);

  useEffect(() => {
    if (user && accessToken) {
      fetchOwnedPassports();
      fetchMyListings();
    }
    getAptUsdPrice().then(setAptUsdRate);
  }, [user, accessToken]);

  // ── IPFS helpers ────────────────────────────────────────────────────────────

  const convertIPFSToHTTP = (uri: string): string => {
    if (!uri) return "";
    if (uri.startsWith("ipfs://")) return `${PINATA_GATEWAY_URL}/ipfs/${uri.replace("ipfs://", "")}`;
    if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;
    return `${PINATA_GATEWAY_URL}/ipfs/${uri}`;
  };

  const fetchMetadataFromIPFS = async (metadataUri: string): Promise<ProductMetadata | null> => {
    try {
      const url = convertIPFSToHTTP(metadataUri);
      if (!url) return null;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  };

  const enrichProductsWithMetadata = async (products: Product[]) => {
    const enriched: EnrichedProduct[] = products.map(p => ({ ...p, metadataLoading: true, metadataError: false }));
    setOwnedPassports(enriched);
    await Promise.all(products.map(async (product, index) => {
      const metadata = await fetchMetadataFromIPFS(product.metadataUri);
      setOwnedPassports(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], metadata: metadata ?? undefined, metadataLoading: false, metadataError: !metadata };
        return updated;
      });
    }));
  };

  // ── Fetch owned passports ────────────────────────────────────────────────────

  const fetchOwnedPassports = async (showIndicator = false) => {
    if (showIndicator) setProductsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/passports/owned`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProductsSource(data.source);
        setProductsSyncedAt(data.syncedAt);
        await enrichProductsWithMetadata(data.products);
        if (showIndicator) showSuccess(`Refreshed! ${data.products.length} passport(s) found.`);
      } else {
        showError("Failed to fetch owned passports");
      }
    } catch { showError("Network error fetching passports"); }
    finally { if (showIndicator) setProductsLoading(false); }
  };

  // ── Fetch my listings ────────────────────────────────────────────────────────

  const fetchMyListings = async () => {
    setListingsLoading(true);
    try {
      // Fetch all non-returned listing statuses for the current user
      const byStatus = await fetchListingsByStatusMap({ baseUrl: BASE_URL, accessToken });
      // Filter to only listings owned by this user
      const all: ListingRequest[] = Object.values(byStatus).flat();
      const mine = all.filter(l => l.owner_address === user?.walletAddress);
      setMyListings(mine);
    } catch { showError("Failed to fetch listings"); }
    finally { setListingsLoading(false); }
  };

  // ── Validate wallet address ──────────────────────────────────────────────────

  const validateWalletAddress = (addr: string) => /^0x[a-fA-F0-9]{1,64}$/.test(addr);

  // ── TRANSFER ─────────────────────────────────────────────────────────────────

  const handleTransfer = async (passport: EnrichedProduct) => {
    if (!transferAddress.trim() || !validateWalletAddress(transferAddress)) {
      showError("Please enter a valid wallet address (0x...)");
      return;
    }
    const passportObjectAddress = passport.passportObjectAddr || passport.transactionHash;
    setIsTransferring(true);
    try {
      const prepRes = await fetch(`${BASE_URL}/api/passports/transfer/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ passportObjectAddress, newOwnerAddress: transferAddress }),
      });
      if (!prepRes.ok) throw new Error("prepare");
      const prepData = await prepRes.json();
      if (!prepData.success || !prepData.payload) throw new Error("Invalid prepare response");

      const txRes = await signAndSubmitTransaction({
        data: { function: prepData.payload.function, functionArguments: prepData.payload.functionArguments },
        options: { maxGasAmount: 10000, gasUnitPrice: 100, expirationSecondsFromNow: 60 },
      });

      const recRes = await fetch(`${BASE_URL}/api/passports/transfer/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ txHash: txRes.hash, passportObjectAddress, newOwnerAddress: transferAddress }),
      });
      if (recRes.ok) showSuccess(`Transferred! TX: ${txRes.hash.substring(0, 10)}...`);
      else showError("Transferred on-chain but failed to record in backend");

      setTransferAddress("");
      setSelectedPassport(null);
      setTimeout(() => fetchOwnedPassports(true), 2000);
    } catch (err: any) {
      if (err.message?.includes("rejected")) showError("Transfer cancelled");
      else if (err.message === "prepare") showError("Failed to prepare transfer");
      else showError("Transfer failed. Please try again.");
    } finally { setIsTransferring(false); }
  };

  // ── LIST WITH PASSPORT ────────────────────────────────────────────────────────

  const handleListWithPassport = async () => {
    if (!listPassportAddr.trim()) { showError("Enter a passport object address"); return; }
    setIsListing(true);
    try {
      // Step 1: prepare
      const prepRes = await fetch(`${BASE_URL}/api/passports/list/passport-prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ passportObjectAddress: listPassportAddr }),
      });
      if (!prepRes.ok) { showError("Failed to prepare listing"); return; }
      const prepData = await prepRes.json();
      if (!prepData.success || !prepData.payload) throw new Error("Invalid prepare response");

      // Step 2: sign & submit on-chain
      const txRes = await signAndSubmitTransaction({
        data: { function: prepData.payload.function, functionArguments: prepData.payload.functionArguments },
        options: { maxGasAmount: 10000, gasUnitPrice: 100, expirationSecondsFromNow: 60 },
      });

      // Step 3: record
      const recRes = await fetch(`${BASE_URL}/api/passports/list/passport-record`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ txHash: txRes.hash, passportObjectAddress: listPassportAddr }),
      });
      if (recRes.ok) {
        showSuccess("Listing submitted! Ship your product to LuxPass.");
        setListPassportAddr("");
        setTimeout(() => fetchMyListings(), 1500);
      } else {
        showError("Listed on-chain but failed to record in backend");
      }
    } catch (err: any) {
      if (err.message?.includes("rejected")) showError("Listing cancelled");
      else showError("Listing failed. Please try again.");
    } finally { setIsListing(false); }
  };

  // ── LIST WITHOUT PASSPORT ─────────────────────────────────────────────────────

  const handleListWithoutPassport = async () => {
    setIsListingNoPassport(true);
    try {
      const res = await fetch(`${BASE_URL}/api/passports/list/no-passport-record`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        showSuccess(`Listing submitted! LuxPass will verify your item. Ref: ${data.tempObjectAddress?.substring(0, 16)}...`);
        setTimeout(() => fetchMyListings(), 1500);
      } else {
        showError("Failed to submit listing request");
      }
    } catch { showError("Network error"); }
    finally { setIsListingNoPassport(false); }
  };

  // ── DELIST REQUEST ────────────────────────────────────────────────────────────

  const handleDelistRequest = async (passportAddr: string) => {
    const { addressLine1, city, postalCode, country } = shippingAddress;
    if (!addressLine1 || !city || !postalCode || !country) {
      showError("Please fill in all required shipping address fields");
      return;
    }
    setIsDelisting(true);
    try {
      const res = await fetch(`${BASE_URL}/api/passports/delist/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          passportObjectAddress: passportAddr,
          addressLine1: shippingAddress.addressLine1,
          addressLine2: shippingAddress.addressLine2 || undefined,
          city: shippingAddress.city,
          state: shippingAddress.state,
          postalCode: shippingAddress.postalCode,
          country: shippingAddress.country,
        }),
      });
      if (res.ok) {
        showSuccess("Delist request submitted! Admin will review.");
        setDelistingPassportAddr(null);
        setShippingAddress({ addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", country: "" });
        setTimeout(() => fetchMyListings(), 1500);
      } else {
        const err = await res.json();
        showError(err.error ?? "Failed to submit delist request");
      }
    } catch { showError("Network error"); }
    finally { setIsDelisting(false); }
  };

  // ── CONFIRM RECEIPT ───────────────────────────────────────────────────────────

  const handleConfirmReceipt = async (passportAddr: string) => {
    setIsConfirmingReceipt(passportAddr);
    try {
      // Step 1: prepare
      const prepRes = await fetch(`${BASE_URL}/api/passports/receipt/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ passportObjectAddress: passportAddr }),
      });
      if (!prepRes.ok) { showError("Failed to prepare receipt confirmation"); return; }
      const prepData = await prepRes.json();
      if (!prepData.success || !prepData.payload) throw new Error("Invalid prepare response");

      // Step 2: sign & submit on-chain
      const txRes = await signAndSubmitTransaction({
        data: { function: prepData.payload.function, functionArguments: prepData.payload.functionArguments },
        options: { maxGasAmount: 10000, gasUnitPrice: 100, expirationSecondsFromNow: 60 },
      });

      // Step 3: record
      const recRes = await fetch(`${BASE_URL}/api/passports/receipt/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ txHash: txRes.hash, passportObjectAddress: passportAddr }),
      });
      if (recRes.ok) {
        showSuccess("Receipt confirmed! Your passport is now active.");
        setTimeout(() => fetchMyListings(), 1500);
      } else {
        showError("Confirmed on-chain but failed to record in backend");
      }
    } catch (err: any) {
      if (err.message?.includes("rejected")) showError("Confirmation cancelled");
      else showError("Failed to confirm receipt. Please try again.");
    } finally { setIsConfirmingReceipt(null); }
  };

  // ── ESCROW LISTING ─────────────────────────────────────────────────────────

  const handleEscrowListing = async (passportAddr: string) => {
    const priceNum = parseFloat(escrowPriceApt);
    if (!priceNum || priceNum <= 0) { showError("Enter a valid price"); return; }
    setIsEscrowListing(true);
    try {
      // 1. Prepare
      const prepRes = await fetch(`${BASE_URL}/api/escrow/listing/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ passportObjectAddress: passportAddr, priceOctas: aptToOctas(priceNum) }),
      });
      const prepData = await prepRes.json();
      if (!prepData.success) { showError(prepData.error ?? "Failed to prepare escrow listing"); return; }

      // 2. Sign
      const txRes = await signAndSubmitTransaction({
        data: { function: prepData.payload.function, functionArguments: prepData.payload.functionArguments },
        options: { maxGasAmount: 10000, gasUnitPrice: 100, expirationSecondsFromNow: 60 },
      });

      // 3. Record
      const recRes = await fetch(`${BASE_URL}/api/escrow/listing/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ txHash: txRes.hash, passportObjectAddress: passportAddr, priceOctas: aptToOctas(priceNum) }),
      });
      const recData = await recRes.json();
      if (recData.success) {
        showSuccess("Listed on marketplace with escrow! Buyers can now purchase.");
        setEscrowPriceAddr(null);
        setEscrowPriceApt("");
        setTimeout(() => fetchMyListings(), 1500);
      } else showError("On-chain but backend record failed");
    } catch (err: any) {
      if (err.message?.includes("rejected")) showError("Transaction cancelled");
      else showError("Escrow listing failed. Please try again.");
    } finally { setIsEscrowListing(false); }
  };

  // ── Display helpers ───────────────────────────────────────────────────────────

  const copyToClipboard = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); showSuccess(`${label} copied!`); }
    catch { showError("Failed to copy"); }
  };

  const getProductDisplayName = (p: EnrichedProduct) => {
    if (p.metadataLoading) return "Loading...";
    return p.metadata?.name ?? `Product ${p.serialNumber}`;
  };

  const getAttr = (p: EnrichedProduct, key: string) =>
    p.metadata?.attributes?.find(a => a.trait_type.toLowerCase() === key)?.value ?? null;

  // ── Render ────────────────────────────────────────────────────────────────────

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
            <Link to="/verify"><Button variant="outline">Verify Product</Button></Link>
            <Link to="/dashboard"><Button variant="outline">Dashboard</Button></Link>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">User Dashboard</h1>
            <p className="text-gray-600">Manage your product passports and marketplace listings</p>
            <div className="mt-2 text-sm text-gray-500">
              Wallet: {user?.walletAddress?.substring(0, 10)}...
              {productsSource && productsSyncedAt && (
                <span className="ml-4">Data from {productsSource} • Synced: {formatDate(productsSyncedAt)}</span>
              )}
            </div>
          </div>

          <Tabs defaultValue="owned" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 bg-white/80 backdrop-blur-sm">
              <TabsTrigger value="owned" className="flex items-center">
                <Package className="mr-2 h-4 w-4" />
                My Passports ({ownedPassports.length})
              </TabsTrigger>
              <TabsTrigger value="marketplace" className="flex items-center">
                <Store className="mr-2 h-4 w-4" />
                Marketplace ({myListings.length})
              </TabsTrigger>
              <TabsTrigger value="verify" className="flex items-center">
                <Search className="mr-2 h-4 w-4" />
                Verify
              </TabsTrigger>
            </TabsList>

            {/* ─── OWNED PASSPORTS TAB ──────────────────────────────────────────── */}
            <TabsContent value="owned">
              <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-2xl flex items-center">
                        <Package className="mr-3 h-6 w-6 text-blue-600" />
                        My Product Passports ({ownedPassports.length})
                      </CardTitle>
                      <CardDescription>View, transfer, and manage your owned passports</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => fetchOwnedPassports(true)} disabled={productsLoading}>
                      <RefreshCw className={`mr-2 h-4 w-4 ${productsLoading ? "animate-spin" : ""}`} />
                      {productsLoading ? "Refreshing..." : "Refresh"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {ownedPassports.length === 0 ? (
                    <div className="text-center py-12">
                      <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <p className="text-gray-500">You don't own any product passports yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {ownedPassports.map((passport) => (
                        <div
                          key={passport.passportObjectAddr ?? `${passport.transactionHash}-${passport.serialNumber}`}
                          className="border rounded-lg p-4 bg-white/50 cursor-pointer hover:bg-white/70 hover:shadow-md transition-all"
                          onClick={() => { setSelectedPassport(passport); setIsModalOpen(true); }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <h3 className="font-semibold text-lg">{getProductDisplayName(passport)}</h3>
                                {passport.metadataLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                              </div>
                              <p className="text-sm text-gray-600">
                                {getAttr(passport, "brand")} {getAttr(passport, "category") && `• ${getAttr(passport, "category")}`}
                              </p>
                              <p className="text-sm text-gray-600">Serial: {passport.serialNumber}</p>
                              <p className="text-xs text-gray-500 font-mono">TX: {passport.transactionHash.substring(0, 20)}...</p>
                            </div>
                            <div className="text-right space-y-2">
                              <Badge className="bg-green-100 text-green-800">Owned</Badge>
                              {passport.transferable ? (
                                <div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => { e.stopPropagation(); setSelectedPassport(passport); setIsModalOpen(false); }}
                                  >
                                    <ArrowRightLeft className="mr-1 h-3 w-3" /> Transfer
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center text-xs text-gray-500 justify-end">
                                  <Lock className="mr-1 h-3 w-3" /> Non-transferable
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Transfer form inline */}
                          {selectedPassport?.transactionHash === passport.transactionHash && !isModalOpen && passport.transferable && (
                            <div className="mt-4 p-4 bg-blue-50 rounded-lg" onClick={e => e.stopPropagation()}>
                              <h4 className="font-semibold mb-3">Transfer Ownership</h4>
                              <Label className="text-sm">Recipient Wallet Address</Label>
                              <Input
                                placeholder="0x..."
                                value={transferAddress}
                                onChange={e => setTransferAddress(e.target.value)}
                                className="mt-1 mb-3"
                              />
                              {transferAddress && !validateWalletAddress(transferAddress) && (
                                <p className="text-sm text-red-600 mb-2">Please enter a valid 0x... address</p>
                              )}
                              <div className="flex space-x-2">
                                <Button
                                  onClick={() => handleTransfer(passport)}
                                  disabled={isTransferring || !transferAddress || !validateWalletAddress(transferAddress)}
                                  className="bg-blue-600 hover:bg-blue-700"
                                >
                                  {isTransferring ? "Transferring..." : "Transfer"}
                                </Button>
                                <Button variant="outline" onClick={() => { setSelectedPassport(null); setTransferAddress(""); }}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}

                          <div className="mt-3 text-sm text-gray-600 flex items-center gap-4">
                            <span className="flex items-center"><Calendar className="mr-1 h-3 w-3" /> {formatDate(passport.mintedAt)}</span>
                            <Badge className={passport.transferable ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"} >
                              {passport.transferable ? "Transferable" : "Non-transferable"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── MARKETPLACE TAB ───────────────────────────────────────────────── */}
            <TabsContent value="marketplace">
              <div className="space-y-6">

                {/* ── List product section ── */}
                <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-xl flex items-center">
                      <Store className="mr-3 h-5 w-5 text-purple-600" />
                      List a Product for Sale
                    </CardTitle>
                    <CardDescription>
                      Choose how to list your product — with or without an existing LuxPass passport
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-6">

                      {/* With passport */}
                      <div className="border rounded-lg p-5 bg-purple-50/50 space-y-4">
                        <div>
                          <h3 className="font-semibold text-gray-900 mb-1">I have a LuxPass Passport</h3>
                          <p className="text-sm text-gray-600">
                            Using existing on-chain passport. You'll sign a transaction to mark it as STORING, then ship it to LuxPass.
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="listPassportAddr">Passport Object Address</Label>
                          <Input
                            id="listPassportAddr"
                            placeholder="0x..."
                            value={listPassportAddr}
                            onChange={e => setListPassportAddr(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <Button
                          onClick={handleListWithPassport}
                          disabled={isListing || !listPassportAddr.trim()}
                          className="w-full bg-purple-600 hover:bg-purple-700"
                        >
                          {isListing ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                          ) : (
                            <><Store className="mr-2 h-4 w-4" /> List with Passport</>
                          )}
                        </Button>
                      </div>

                      {/* Without passport */}
                      <div className="border rounded-lg p-5 bg-blue-50/50 space-y-4">
                        <div>
                          <h3 className="font-semibold text-gray-900 mb-1">I don't have a Passport yet</h3>
                          <p className="text-sm text-gray-600">
                            Ship your product to LuxPass. Our admin team will physically verify it and mint a new passport on your behalf.
                          </p>
                        </div>
                        <div className="p-3 bg-yellow-50 rounded-md border border-yellow-200">
                          <p className="text-xs text-yellow-800">
                            <AlertCircle className="inline mr-1 h-3 w-3" />
                            No on-chain transaction needed — a listing request is created immediately.
                          </p>
                        </div>
                        <Button
                          onClick={handleListWithoutPassport}
                          disabled={isListingNoPassport}
                          className="w-full bg-blue-600 hover:bg-blue-700"
                        >
                          {isListingNoPassport ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                          ) : (
                            <><Package className="mr-2 h-4 w-4" /> List without Passport</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* ── My listings ── */}
                <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl flex items-center">
                          <Truck className="mr-3 h-5 w-5 text-blue-600" />
                          My Listings ({myListings.length})
                        </CardTitle>
                        <CardDescription>Track and manage your marketplace listings</CardDescription>
                      </div>
                      <Button variant="outline" size="sm" onClick={fetchMyListings} disabled={listingsLoading}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${listingsLoading ? "animate-spin" : ""}`} />
                        {listingsLoading ? "Refreshing..." : "Refresh"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {myListings.length === 0 ? (
                      <div className="text-center py-12">
                        <Store className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                        <p className="text-gray-500">No active listings. List a product above to get started.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {myListings.map(listing => {
                          const statusInfo = LISTING_STATUS_LABELS[listing.status] ?? { label: listing.status, color: "bg-gray-100 text-gray-800" };
                          const isReturning = listing.status === "returning";
                          const isListed    = listing.status === "listed";
                          const isSold      = listing.status === "sold";
                          const isDelistFormOpen = delistingPassportAddr === listing.passport_object_address;
                          const inEscrow = listing.in_escrow;

                          return (
                            <div key={listing.id} className="border rounded-lg p-4 bg-white/50 space-y-3">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-mono text-sm text-gray-700">
                                    {listing.passport_object_address.length > 30
                                      ? `${listing.passport_object_address.substring(0, 20)}...`
                                      : listing.passport_object_address}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-gray-500">
                                      {listing.has_passport ? "Has passport" : "No passport"}
                                    </span>
                                    <span className="text-xs text-gray-400">•</span>
                                    <span className="text-xs text-gray-500">Listed {formatDate(listing.created_at)}</span>
                                  </div>
                                </div>
                                <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                              </div>

                              {/* Status progress indicator */}
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                {["pending", "verifying", "listed", "sold", "request_return", "returning", "returned"].map((s, i) => (
                                  <div key={s} className="flex items-center">
                                    <div className={`h-2 w-2 rounded-full ${
                                      listing.status === s ? "bg-blue-500" :
                                      ["pending", "verifying", "listed", "sold", "request_return", "returning", "returned"].indexOf(listing.status) > i
                                        ? "bg-green-400" : "bg-gray-200"
                                    }`} />
                                    {i < 5 && <div className="h-px w-4 bg-gray-200 mx-0.5" />}
                                  </div>
                                ))}
                              </div>

                              {/* Status-specific descriptions */}
                              <div className="text-xs text-gray-500 flex items-start gap-1">
                                {listing.status === "pending" && <><Clock className="h-3 w-3 mt-0.5 flex-shrink-0" /> Ship your product to LuxPass. Awaiting receipt.</>}
                                {listing.status === "verifying" && <><Clock className="h-3 w-3 mt-0.5 flex-shrink-0" /> LuxPass has received your product and is verifying it.</>}
                                {listing.status === "listed" && (
                                  <>
                                    <CheckCircle2 className={`h-3 w-3 mt-0.5 flex-shrink-0 ${listing.in_escrow ? "text-green-500" : "text-yellow-500"}`} /> 
                                    {listing.in_escrow 
                                      ? "Product is on marketplace" 
                                      : "Your product is ready to list on the marketplace"}
                                  </>
                                )}

                                {listing.status === "sold" && (
                                  <>
                                    <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0 text-green-500" /> 
                                    {listing.in_escrow 
                                      ? "Product is on marketplace" 
                                      : "Product has been sold to you can request it to be shipped to you or put it back up on marketplace"}
                                  </>
                                )}
                                {listing.status === "request_return" && <><Clock className="h-3 w-3 mt-0.5 flex-shrink-0" /> Delist requested. Awaiting admin approval.</>}
                                {listing.status === "returning" && <><Truck className="h-3 w-3 mt-0.5 flex-shrink-0" /> Your product is on its way back. Confirm receipt when it arrives.</>}
                                {listing.status === "returned" && <><CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0 text-green-500" /> Listing closed. Product returned successfully.</>}
                              </div>

                              {/* Action buttons */}
                              <div className="flex gap-2 flex-wrap">
                                {/* Set price for escrow marketplace (only when listed and not already in escrow) */}
                                {(isListed || isSold) && !inEscrow && !isDelistFormOpen && escrowPriceAddr !== listing.passport_object_address && (
                                  <Button
                                    size="sm"
                                    className="bg-purple-600 hover:bg-purple-700"
                                    onClick={() => { setEscrowPriceAddr(listing.passport_object_address); setEscrowPriceApt(""); }}
                                  >
                                    <Store className="mr-1 h-3 w-3" /> Set Price &amp; Sell
                                  </Button>
                                )}

                                {/* Delist request (only when listed) */}
                                {(isListed || isSold) && !inEscrow && !isDelistFormOpen && escrowPriceAddr !== listing.passport_object_address && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setDelistingPassportAddr(listing.passport_object_address)}
                                  >
                                    <RotateCcw className="mr-1 h-3 w-3" /> Request Return
                                  </Button>
                                )}

                                {/* Confirm receipt (only when returning) */}
                                {isReturning && (
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700"
                                    disabled={isConfirmingReceipt === listing.passport_object_address}
                                    onClick={() => handleConfirmReceipt(listing.passport_object_address)}
                                  >
                                    {isConfirmingReceipt === listing.passport_object_address ? (
                                      <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Confirming...</>
                                    ) : (
                                      <><CheckCircle2 className="mr-1 h-3 w-3" /> Confirm Receipt</>
                                    )}
                                  </Button>
                                )}
                              </div>

                              {/* Escrow pricing form */}
                              {escrowPriceAddr === listing.passport_object_address && (
                                <div className="mt-2 p-4 bg-purple-50 rounded-lg border border-purple-200 space-y-3">
                                  <h4 className="font-semibold text-sm flex items-center gap-2">
                                    <Store className="h-4 w-4 text-purple-600" /> Set Price for Marketplace
                                  </h4>
                                  <p className="text-xs text-gray-500">
                                    This will transfer your passport to the escrow contract for custody until it sells or you cancel.
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0.01"
                                      placeholder="0.00"
                                      value={escrowPriceApt}
                                      onChange={(e) => setEscrowPriceApt(e.target.value)}
                                      className="w-40 text-sm"
                                    />
                                    <span className="font-semibold text-gray-700">APT</span>
                                    {aptUsdRate > 0 && escrowPriceApt && (
                                      <span className="text-xs text-gray-400">
                                        ~{formatUsd(parseFloat(escrowPriceApt || "0") * aptUsdRate)} USD
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      className="bg-purple-600 hover:bg-purple-700"
                                      disabled={isEscrowListing || !escrowPriceApt}
                                      onClick={() => handleEscrowListing(listing.passport_object_address)}
                                    >
                                      {isEscrowListing ? (
                                        <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Listing...</>
                                      ) : (
                                        "List on Marketplace"
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => { setEscrowPriceAddr(null); setEscrowPriceApt(""); }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              )}

                              {/* Delist / shipping address form */}
                              {isDelistFormOpen && (
                                <div className="mt-2 p-4 bg-orange-50 rounded-lg border border-orange-200 space-y-3">
                                  <h4 className="font-semibold text-sm flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-orange-600" /> Shipping Address for Return
                                  </h4>

                                  <div className="grid grid-cols-1 gap-2">
                                    <div>
                                      <Label className="text-xs">Address Line 1 *</Label>
                                      <Input
                                        placeholder="123 Main St"
                                        value={shippingAddress.addressLine1}
                                        onChange={e => setShippingAddress(p => ({ ...p, addressLine1: e.target.value }))}
                                        className="mt-0.5 text-sm"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs">Address Line 2</Label>
                                      <Input
                                        placeholder="Unit / Apt (optional)"
                                        value={shippingAddress.addressLine2}
                                        onChange={e => setShippingAddress(p => ({ ...p, addressLine2: e.target.value }))}
                                        className="mt-0.5 text-sm"
                                      />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label className="text-xs">City *</Label>
                                        <Input
                                          placeholder="Singapore"
                                          value={shippingAddress.city}
                                          onChange={e => setShippingAddress(p => ({ ...p, city: e.target.value }))}
                                          className="mt-0.5 text-sm"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs">State / Region *</Label>
                                        <Input
                                          placeholder="SG"
                                          value={shippingAddress.state}
                                          onChange={e => setShippingAddress(p => ({ ...p, state: e.target.value }))}
                                          className="mt-0.5 text-sm"
                                        />
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label className="text-xs">Postal Code *</Label>
                                        <Input
                                          placeholder="123456"
                                          value={shippingAddress.postalCode}
                                          onChange={e => setShippingAddress(p => ({ ...p, postalCode: e.target.value }))}
                                          className="mt-0.5 text-sm"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs">Country *</Label>
                                        <Input
                                          placeholder="Singapore"
                                          value={shippingAddress.country}
                                          onChange={e => setShippingAddress(p => ({ ...p, country: e.target.value }))}
                                          className="mt-0.5 text-sm"
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      className="bg-orange-600 hover:bg-orange-700"
                                      disabled={isDelisting}
                                      onClick={() => handleDelistRequest(listing.passport_object_address)}
                                    >
                                      {isDelisting ? (
                                        <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Submitting...</>
                                      ) : (
                                        "Submit Return Request"
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setDelistingPassportAddr(null);
                                        setShippingAddress({ addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", country: "" });
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ─── VERIFY TAB ─────────────────────────────────────────────────────── */}
            <TabsContent value="verify">
              <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center">
                    <Eye className="mr-3 h-6 w-6 text-green-600" />
                    Verify Product Authenticity
                  </CardTitle>
                  <CardDescription>Check the authenticity of any product passport</CardDescription>
                </CardHeader>
                <CardContent className="text-center py-8">
                  <Search className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-4">Use our verification tool to check product authenticity</p>
                  <Link to="/verify">
                    <Button className="bg-green-600 hover:bg-green-700">Go to Verification Tool</Button>
                  </Link>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* ─── PASSPORT DETAILS MODAL ───────────────────────────────────────────── */}
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-2xl flex items-center">
                  <Package className="mr-3 h-6 w-6 text-blue-600" />
                  Product Passport Details
                </DialogTitle>
                <DialogDescription>Complete information for this owned product passport</DialogDescription>
              </DialogHeader>

              {selectedPassport && isModalOpen && (
                <div className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      {selectedPassport.metadata?.image ? (
                        <div className="space-y-2">
                          <Label className="text-base font-semibold">Product Image</Label>
                          <img
                            src={convertIPFSToHTTP(selectedPassport.metadata.image)}
                            alt={selectedPassport.metadata.name || "Product"}
                            className="w-full h-64 object-cover rounded-lg border"
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
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
                          <Button size="sm" variant="ghost" onClick={() => copyToClipboard(selectedPassport.serialNumber, "Serial number")}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {selectedPassport.metadata?.attributes && selectedPassport.metadata.attributes.length > 0 && (
                    <div>
                      <Label className="text-base font-semibold mb-3 block">Product Attributes</Label>
                      <div className="grid md:grid-cols-2 gap-4">
                        {selectedPassport.metadata.attributes.map((attr, i) => (
                          <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                            <span className="font-medium text-gray-700">{attr.trait_type}:</span>
                            <span className="text-gray-900">{attr.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Separator />

                  <div>
                    <Label className="text-base font-semibold mb-3 block">Blockchain Information</Label>
                    <div className="space-y-3">
                      {[
                        { label: "Transaction Hash", value: selectedPassport.transactionHash },
                        ...(selectedPassport.passportObjectAddr ? [{ label: "Passport Object Address", value: selectedPassport.passportObjectAddr }] : []),
                        { label: "Owner Address", value: selectedPassport.ownerAddress },
                        { label: "Issuer Address", value: selectedPassport.issuerAddress },
                        { label: "Registry Address", value: selectedPassport.registryAddress },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <span className="font-medium text-gray-700">{label}:</span>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-sm">{value.substring(0, 20)}...</span>
                            <Button size="sm" variant="ghost" onClick={() => copyToClipboard(value, label)}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium text-gray-700">Metadata URI:</span>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-sm">{selectedPassport.metadataUri.substring(0, 20)}...</span>
                          <Button size="sm" variant="ghost" onClick={() => copyToClipboard(selectedPassport.metadataUri, "Metadata URI")}>
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => window.open(convertIPFSToHTTP(selectedPassport.metadataUri), "_blank")}>
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
