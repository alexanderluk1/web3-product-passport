import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Shield, Settings, Users, UserPlus, UserX, Database, RefreshCw,
  Store, Package, CheckCircle2, Truck, RotateCcw, Loader2,
  ClipboardList, MapPin, ChevronDown, ChevronUp, Upload, AlertCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { showSuccess, showError } from "@/utils/toast";
import { fetchListingsByStatusMap } from "@/utils/listings";
import { Textarea } from "@/components/ui/textarea";

const BASE_URL = "http://localhost:3001";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ListingRequest {
  id: string;
  passport_object_address: string;
  owner_address: string;
  status: string;
  has_passport: boolean;
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

interface NoPassportMintForm {
  tempObjectAddress: string;
  productName: string;
  brand: string;
  category: string;
  serialNumber: string;
  manufacturingDate: string;
  materials: string;
  countryOfOrigin: string;
  description: string;
  image: File | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const LISTING_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:        { label: "Pending Receipt",    color: "bg-yellow-100 text-yellow-800"  },
  verifying:      { label: "Verifying",          color: "bg-blue-100 text-blue-800"      },
  listed:         { label: "Listed",             color: "bg-green-100 text-green-800"    },
  request_return: { label: "Return Requested",   color: "bg-orange-100 text-orange-800"  },
  returning:      { label: "Returning",          color: "bg-purple-100 text-purple-800"  },
  returned:       { label: "Returned",           color: "bg-gray-100 text-gray-800"      },
};

const formatDate = (ts: string | number) =>
  new Date(ts).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

// ─── Component ─────────────────────────────────────────────────────────────────

const AdminDashboard = () => {
  const { user, accessToken } = useAuth();
  const { signAndSubmitTransaction } = useWallet();

  // Registry / issuer state (unchanged)
  const [issuers, setIssuers]                   = useState<any[]>([]);
  const [newIssuerAddress, setNewIssuerAddress] = useState("");
  const [isRegistering, setIsRegistering]       = useState(false);
  const [isInitializing, setIsInitializing]     = useState(false);
  const [registryStatus, setRegistryStatus]     = useState<any>(null);
  const [isRefreshingIssuers, setIsRefreshingIssuers] = useState(false);

  // Marketplace listing state
  const [listings, setListings]                 = useState<Record<string, ListingRequest[]>>({});
  const [delistRequests, setDelistRequests]     = useState<DelistRequest[]>([]);
  const [listingsLoading, setListingsLoading]   = useState(false);
  const [expandedListing, setExpandedListing]   = useState<string | null>(null);

  // Action loading states
  const [processingAddr, setProcessingAddr]     = useState<string | null>(null);

  // No-passport mint modal
  const [mintModalOpen, setMintModalOpen]       = useState(false);
  const [mintForm, setMintForm]                 = useState<NoPassportMintForm>({
    tempObjectAddress: "", productName: "", brand: "", category: "",
    serialNumber: "", manufacturingDate: "", materials: "", countryOfOrigin: "",
    description: "", image: null,
  });
  const [isMinting, setIsMinting]               = useState(false);

  useEffect(() => {
    if (user && accessToken) {
      fetchIssuers();
      fetchRegistryStatus();
      fetchAllListings();
    }
  }, [user, accessToken]);

  // ── Registry / Issuers (carry-over logic) ──────────────────────────────────

  const fetchIssuers = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshingIssuers(true);
    try {
      const res = await fetch(`${BASE_URL}/admin/issuers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setIssuers(data.issuers ?? []);
        if (showRefresh) showSuccess(`Issuer list refreshed! ${data.issuers?.length ?? 0} issuers.`);
      } else {
        showError("Failed to fetch issuers");
      }
    } catch { showError("Network error fetching issuers"); }
    finally { if (showRefresh) setIsRefreshingIssuers(false); }
  };

  const fetchRegistryStatus = async () => {
    try {
      const res = await fetch(`${BASE_URL}/admin/registry/status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) setRegistryStatus(await res.json());
      else showError("Failed to fetch registry status");
    } catch { showError("Network error fetching registry status"); }
  };

  const handleInitRegistry = async () => {
    setIsInitializing(true);
    try {
      const res = await fetch(`${BASE_URL}/admin/registry/init`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) { showSuccess("Registry initialized!"); fetchRegistryStatus(); }
      else showError("Failed to initialize registry");
    } catch { showError("Registry initialization failed"); }
    finally { setIsInitializing(false); }
  };

  const handleRegisterIssuer = async () => {
    if (!newIssuerAddress.trim()) { showError("Enter a wallet address"); return; }
    setIsRegistering(true);
    try {
      const res = await fetch(`${BASE_URL}/admin/issuers/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ issuerAddress: newIssuerAddress }),
      });
      if (res.ok) {
        showSuccess(`Issuer ${newIssuerAddress} registered!`);
        setNewIssuerAddress("");
        await fetchIssuers(true);
      } else {
        showError("Failed to register issuer");
      }
    } catch { showError("Issuer registration failed"); }
    finally { setIsRegistering(false); }
  };

  const handleRevokeIssuer = async (addr: string) => {
    try {
      const res = await fetch(`${BASE_URL}/admin/issuers/${addr}/revoke`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) { showSuccess(`Issuer ${addr} revoked!`); await fetchIssuers(true); }
      else showError("Failed to revoke issuer");
    } catch { showError("Issuer revocation failed"); }
  };

  // ── Marketplace – fetch all listings ───────────────────────────────────────

  const fetchAllListings = async () => {
    setListingsLoading(true);
    try {
      const byStatus = await fetchListingsByStatusMap({ baseUrl: BASE_URL, accessToken });
      setListings(byStatus);

      // Fetch delist requests pending
      const delistRes = await fetch(`${BASE_URL}/api/passports/de-listings/status/pending`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (delistRes.ok) {
        const delistData = await delistRes.json();
        setDelistRequests(delistData.payload ?? []);
      }
    } catch { showError("Failed to fetch listings"); }
    finally { setListingsLoading(false); }
  };

  // ── ADMIN ACTION: Receive passport (with passport) ──────────────────────────

  const handleReceiveWithPassport = async (passportAddr: string) => {
    setProcessingAddr(passportAddr);
    try {
      // Get tx payload to set status VERIFYING
      const prepRes = await fetch(`${BASE_URL}/api/passports/receive/passport`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ passportObjectAddress: passportAddr }),
      });
      if (!prepRes.ok) { showError("Failed to get receive transaction"); return; }
      const prepData = await prepRes.json();
      if (!prepData.success || !prepData.payload) throw new Error("Invalid payload");

      // Sign & submit on-chain
      const txRes = await signAndSubmitTransaction({
        data: { function: prepData.payload.function, functionArguments: prepData.payload.functionArguments },
        options: { maxGasAmount: 10000, gasUnitPrice: 100, expirationSecondsFromNow: 60 },
      });

      // Record status update
      const recRes = await fetch(`${BASE_URL}/api/passports/status/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ txHash: txRes.hash, passportObjectAddress: passportAddr }),
      });
      if (recRes.ok) {
        showSuccess("Product received! Status updated to Verifying.");
        setTimeout(() => fetchAllListings(), 1500);
      } else {
        showError("On-chain succeeded but failed to record DB status");
      }
    } catch (err: any) {
      if (err.message?.includes("rejected")) showError("Transaction cancelled");
      else showError("Failed to receive product");
    } finally { setProcessingAddr(null); }
  };

  // ── ADMIN ACTION: Receive product (no passport) ─────────────────────────────

  const handleReceiveNoPassport = async (tempAddr: string) => {
    setProcessingAddr(tempAddr);
    try {
      const res = await fetch(`${BASE_URL}/api/passports/receive/no-passport`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ tempObjectAddress: tempAddr, status: "verifying" }),
      });
      if (res.ok) {
        showSuccess("Product received! Listing status updated to Verifying.");
        setTimeout(() => fetchAllListings(), 1000);
      } else {
        const err = await res.json();
        showError(err.error ?? "Failed to update listing status");
      }
    } catch { showError("Network error"); }
    finally { setProcessingAddr(null); }
  };

  // ── ADMIN ACTION: Verify product (with passport) ────────────────────────────

  const handleVerifyWithPassport = async (passportAddr: string) => {
    setProcessingAddr(passportAddr);
    try {
      const prepRes = await fetch(`${BASE_URL}/api/passports/verify/passport`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ passportObjectAddress: passportAddr }),
      });
      if (!prepRes.ok) { showError("Failed to get verify transaction"); return; }
      const prepData = await prepRes.json();
      if (!prepData.success || !prepData.payload) throw new Error("Invalid payload");

      const txRes = await signAndSubmitTransaction({
        data: { function: prepData.payload.function, functionArguments: prepData.payload.functionArguments },
        options: { maxGasAmount: 10000, gasUnitPrice: 100, expirationSecondsFromNow: 60 },
      });

      const recRes = await fetch(`${BASE_URL}/api/passports/status/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ txHash: txRes.hash, passportObjectAddress: passportAddr }),
      });
      if (recRes.ok) {
        showSuccess("Product verified and listed on marketplace!");
        setTimeout(() => fetchAllListings(), 1500);
      } else {
        showError("On-chain succeeded but failed to record DB status");
      }
    } catch (err: any) {
      if (err.message?.includes("rejected")) showError("Transaction cancelled");
      else showError("Failed to verify product");
    } finally { setProcessingAddr(null); }
  };

  // ── ADMIN ACTION: Verify + mint (no passport) ───────────────────────────────

  const openMintModal = (tempAddr: string) => {
    setMintForm(f => ({ ...f, tempObjectAddress: tempAddr }));
    setMintModalOpen(true);
  };

  const handleMintNoPassport = async () => {
    const { tempObjectAddress, productName, brand, category, serialNumber,
            manufacturingDate, materials, countryOfOrigin, description, image } = mintForm;

    if (!productName || !brand || !category || !serialNumber || !manufacturingDate
        || !materials || !countryOfOrigin || !description || !image) {
      showError("Please fill in all fields and select an image");
      return;
    }

    setIsMinting(true);
    try {
      // Step 1: Upload and get mint payload
      const formData = new FormData();
      formData.append("tempObjectAddress", tempObjectAddress);
      formData.append("productName", productName);
      formData.append("brand", brand);
      formData.append("category", category);
      formData.append("serialNumber", serialNumber);
      formData.append("manufacturingDate", manufacturingDate);
      formData.append("materials", materials);
      formData.append("countryOfOrigin", countryOfOrigin);
      formData.append("description", description);
      formData.append("image", image);

      const prepRes = await fetch(`${BASE_URL}/api/passports/verify/no-passport`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });
      if (!prepRes.ok) {
        const err = await prepRes.json();
        showError(err.error ?? "Failed to prepare mint");
        return;
      }
      const prepData = await prepRes.json();
      if (!prepData.success || !prepData.payload) throw new Error("Invalid payload");

      // Step 2: Sign & submit on-chain
      const txRes = await signAndSubmitTransaction({
        data: { function: prepData.payload.function, functionArguments: prepData.payload.functionArguments },
        options: { maxGasAmount: 20000, gasUnitPrice: 100, expirationSecondsFromNow: 60 },
      });

      // Step 3: Record – need owner address from listing
      const listingRes = await fetch(
        `${BASE_URL}/api/passports/listings/address/${encodeURIComponent(tempObjectAddress)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const listingData = listingRes.ok ? await listingRes.json() : null;
      const ownerAddress = listingData?.payload?.owner_address ?? "";

      // We need the new passport object address from the tx – record with a placeholder
      // In practice the backend resolves it from the tx hash
      const recRes = await fetch(`${BASE_URL}/api/passports/verify/no-passport-record`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          txHash: txRes.hash,
          ownerAddress,
        }),
      });
      if (recRes.ok) {
        showSuccess("Passport minted and listed on marketplace!");
        setMintModalOpen(false);
        setMintForm({
          tempObjectAddress: "", productName: "", brand: "", category: "",
          serialNumber: "", manufacturingDate: "", materials: "", countryOfOrigin: "",
          description: "", image: null,
        });
        setTimeout(() => fetchAllListings(), 1500);
      } else {
        showError("Minted on-chain but failed to record in backend");
      }
    } catch (err: any) {
      if (err.message?.includes("rejected")) showError("Transaction cancelled");
      else showError("Failed to mint passport");
    } finally { setIsMinting(false); }
  };

  // ── ADMIN ACTION: Approve delist ────────────────────────────────────────────

  const handleApproveDelist = async (passportAddr: string) => {
    setProcessingAddr(passportAddr);
    try {
      const prepRes = await fetch(`${BASE_URL}/api/passports/delist/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ passportObjectAddress: passportAddr }),
      });
      if (!prepRes.ok) { showError("Failed to get approve transaction"); return; }
      const prepData = await prepRes.json();
      if (!prepData.success || !prepData.payload) throw new Error("Invalid payload");

      const txRes = await signAndSubmitTransaction({
        data: { function: prepData.payload.function, functionArguments: prepData.payload.functionArguments },
        options: { maxGasAmount: 10000, gasUnitPrice: 100, expirationSecondsFromNow: 60 },
      });

      const recRes = await fetch(`${BASE_URL}/api/passports/status/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ txHash: txRes.hash, passportObjectAddress: passportAddr }),
      });
      if (recRes.ok) {
        showSuccess("Delist approved! Product will be returned to user.");
        setTimeout(() => fetchAllListings(), 1500);
      } else {
        showError("On-chain succeeded but failed to record DB status");
      }
    } catch (err: any) {
      if (err.message?.includes("rejected")) showError("Transaction cancelled");
      else showError("Failed to approve delist");
    } finally { setProcessingAddr(null); }
  };

  // ── Render helpers ──────────────────────────────────────────────────────────

  const actionInProgress = (addr: string) => processingAddr === addr;

  // Merge all listings into one flat list for the "All" view, excluding returned
  const activeListings: ListingRequest[] = [
    ...(listings["pending"] ?? []),
    ...(listings["verifying"] ?? []),
    ...(listings["listed"] ?? []),
    ...(listings["request_return"] ?? []),
    ...(listings["returning"] ?? []),
  ];

  // Build a map of passport address -> delist request for quick lookup
  const delistMap: Record<string, DelistRequest> = {};
  delistRequests.forEach(d => { delistMap[d.passport_object_address] = d; });

  // Truncate address helper
  const shortAddr = (addr: string) => addr.length > 26 ? `${addr.substring(0, 14)}...${addr.substring(addr.length - 6)}` : addr;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50">
      {/* Navigation */}
      <nav className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <Shield className="h-8 w-8 text-purple-600" />
            <span className="text-2xl font-bold text-gray-900">LuxPass</span>
          </Link>
          <div className="flex items-center space-x-4">
            <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">
              <Settings className="mr-1 h-3 w-3" />
              {user?.role}
            </Badge>
            <Link to="/dashboard"><Button variant="outline">Dashboard</Button></Link>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
            <p className="text-gray-600">System administration, issuer management, and marketplace operations</p>
            <div className="mt-2 text-sm text-gray-500">
              Wallet: {user?.walletAddress?.substring(0, 10)}... | Role: {user?.role}
            </div>
          </div>

          <Tabs defaultValue="marketplace" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 bg-white/80 backdrop-blur-sm">
              <TabsTrigger value="marketplace" className="flex items-center">
                <Store className="mr-2 h-4 w-4" />
                Marketplace
              </TabsTrigger>
              <TabsTrigger value="registry" className="flex items-center">
                <Database className="mr-2 h-4 w-4" />
                Registry
              </TabsTrigger>
              <TabsTrigger value="issuers" className="flex items-center">
                <Users className="mr-2 h-4 w-4" />
                Issuers
              </TabsTrigger>
            </TabsList>

            {/* ─── MARKETPLACE TAB ──────────────────────────────────────────────── */}
            <TabsContent value="marketplace">
              <div className="space-y-6">

                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {["pending", "verifying", "listed", "request_return", "returning"].map(s => (
                    <div key={s} className="bg-white/80 rounded-lg border p-3 text-center shadow-sm">
                      <p className="text-2xl font-bold text-gray-900">{(listings[s] ?? []).length}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{LISTING_STATUS_LABELS[s]?.label}</p>
                    </div>
                  ))}
                </div>

                {/* Listings table */}
                <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl flex items-center">
                          <ClipboardList className="mr-3 h-5 w-5 text-red-600" />
                          All Active Listings ({activeListings.length})
                        </CardTitle>
                        <CardDescription>Manage incoming products through the verification pipeline</CardDescription>
                      </div>
                      <Button variant="outline" size="sm" onClick={fetchAllListings} disabled={listingsLoading}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${listingsLoading ? "animate-spin" : ""}`} />
                        {listingsLoading ? "Refreshing..." : "Refresh"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {activeListings.length === 0 ? (
                      <div className="text-center py-12">
                        <Store className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                        <p className="text-gray-500">No active listings at the moment.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {activeListings.map(listing => {
                          const statusInfo  = LISTING_STATUS_LABELS[listing.status] ?? { label: listing.status, color: "bg-gray-100 text-gray-800" };
                          const isExpanded  = expandedListing === listing.id;
                          const inProgress  = actionInProgress(listing.passport_object_address);
                          const delistReq   = delistMap[listing.passport_object_address];

                          return (
                            <div key={listing.id} className="border rounded-lg bg-white/50 overflow-hidden">
                              {/* Header row */}
                              <div
                                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                                onClick={() => setExpandedListing(isExpanded ? null : listing.id)}
                              >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                                    listing.status === "pending" ? "bg-yellow-400" :
                                    listing.status === "verifying" ? "bg-blue-400" :
                                    listing.status === "listed" ? "bg-green-400" :
                                    listing.status === "request_return" ? "bg-orange-400" : "bg-purple-400"
                                  }`} />
                                  <div className="min-w-0">
                                    <p className="font-mono text-sm text-gray-700 truncate">{shortAddr(listing.passport_object_address)}</p>
                                    <p className="text-xs text-gray-500">
                                      {listing.has_passport ? "Has passport" : "No passport"} •{" "}
                                      {listing.owner_address ? `Owner: ${shortAddr(listing.owner_address)}` : ""}  •{" "}
                                      {formatDate(listing.created_at)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                                  {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                                </div>
                              </div>

                              {/* Expanded actions */}
                              {isExpanded && (
                                <div className="border-t px-4 pb-4 pt-3 bg-gray-50/50 space-y-4">

                                  {/* Listing details */}
                                  <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div><span className="text-gray-500">ID:</span> <span className="font-mono text-xs">{listing.id}</span></div>
                                    <div><span className="text-gray-500">Updated:</span> {formatDate(listing.updated_at)}</div>
                                    <div className="col-span-2">
                                      <span className="text-gray-500">Full address:</span>
                                      <p className="font-mono text-xs break-all">{listing.passport_object_address}</p>
                                    </div>
                                  </div>

                                  {/* Delist request details (if any) */}
                                  {delistReq && (
                                    <div className="p-3 bg-orange-50 rounded-lg border border-orange-200 text-sm space-y-1">
                                      <p className="font-semibold text-orange-800 flex items-center gap-1">
                                        <MapPin className="h-3.5 w-3.5" /> Return Address
                                      </p>
                                      <p>{delistReq.address_line1}</p>
                                      {delistReq.address_line2 && <p>{delistReq.address_line2}</p>}
                                      <p>{delistReq.city}{delistReq.state ? `, ${delistReq.state}` : ""} {delistReq.postal_code}</p>
                                      <p>{delistReq.country}</p>
                                    </div>
                                  )}

                                  {/* Action buttons based on status */}
                                  <div className="flex flex-wrap gap-2">

                                    {/* PENDING: Receive */}
                                    {listing.status === "pending" && (
                                      listing.has_passport ? (
                                        <Button
                                          size="sm"
                                          className="bg-blue-600 hover:bg-blue-700"
                                          disabled={inProgress}
                                          onClick={() => handleReceiveWithPassport(listing.passport_object_address)}
                                        >
                                          {inProgress ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Package className="mr-1 h-3 w-3" />}
                                          {inProgress ? "Processing..." : "Mark Received (with passport)"}
                                        </Button>
                                      ) : (
                                        <Button
                                          size="sm"
                                          className="bg-blue-600 hover:bg-blue-700"
                                          disabled={inProgress}
                                          onClick={() => handleReceiveNoPassport(listing.passport_object_address)}
                                        >
                                          {inProgress ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Package className="mr-1 h-3 w-3" />}
                                          {inProgress ? "Processing..." : "Mark Received (no passport)"}
                                        </Button>
                                      )
                                    )}

                                    {/* VERIFYING: Verify / Mint */}
                                    {listing.status === "verifying" && (
                                      listing.has_passport ? (
                                        <Button
                                          size="sm"
                                          className="bg-green-600 hover:bg-green-700"
                                          disabled={inProgress}
                                          onClick={() => handleVerifyWithPassport(listing.passport_object_address)}
                                        >
                                          {inProgress ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                                          {inProgress ? "Processing..." : "Verify & List (with passport)"}
                                        </Button>
                                      ) : (
                                        <Button
                                          size="sm"
                                          className="bg-purple-600 hover:bg-purple-700"
                                          onClick={() => openMintModal(listing.passport_object_address)}
                                        >
                                          <Upload className="mr-1 h-3 w-3" />
                                          Mint Passport & List
                                        </Button>
                                      )
                                    )}

                                    {/* REQUEST_RETURN: Approve delist */}
                                    {listing.status === "request_return" && (
                                      <Button
                                        size="sm"
                                        className="bg-orange-600 hover:bg-orange-700"
                                        disabled={inProgress}
                                        onClick={() => handleApproveDelist(listing.passport_object_address)}
                                      >
                                        {inProgress ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RotateCcw className="mr-1 h-3 w-3" />}
                                        {inProgress ? "Processing..." : "Approve Return"}
                                      </Button>
                                    )}

                                    {/* RETURNING: informational */}
                                    {listing.status === "returning" && (
                                      <div className="flex items-center text-sm text-purple-700">
                                        <Truck className="mr-1.5 h-4 w-4" />
                                        Awaiting user to confirm receipt
                                      </div>
                                    )}

                                    {/* LISTED: informational */}
                                    {listing.status === "listed" && (
                                      <div className="flex items-center text-sm text-green-700">
                                        <CheckCircle2 className="mr-1.5 h-4 w-4" />
                                        Live on marketplace — no action needed
                                      </div>
                                    )}
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

            {/* ─── REGISTRY TAB ──────────────────────────────────────────────────── */}
            <TabsContent value="registry">
              <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center">
                    <Database className="mr-3 h-6 w-6 text-red-600" />
                    Registry Management
                  </CardTitle>
                  <CardDescription>Initialize and manage the product passport registry</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {registryStatus && (
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h3 className="font-semibold mb-2">Registry Status</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Status:</span>
                          <Badge className={registryStatus.initialized ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                            {registryStatus.initialized ? "Initialized" : "Not Initialized"}
                          </Badge>
                        </div>
                        {registryStatus.contractAddress && (
                          <div className="flex justify-between">
                            <span>Contract Address:</span>
                            <span className="font-mono text-xs">{registryStatus.contractAddress}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {!registryStatus?.initialized ? (
                    <div className="text-center py-8">
                      <Database className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <p className="text-gray-600 mb-4">The registry needs to be initialized before issuers can mint passports.</p>
                      <Button onClick={handleInitRegistry} disabled={isInitializing} className="bg-red-600 hover:bg-red-700">
                        {isInitializing ? "Initializing..." : "Initialize Registry"}
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Database className="mx-auto h-12 w-12 text-green-600 mb-4" />
                      <p className="text-green-600 font-semibold">Registry is initialized and ready!</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── ISSUERS TAB ───────────────────────────────────────────────────── */}
            <TabsContent value="issuers">
              <div className="space-y-6">
                <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-xl flex items-center">
                      <UserPlus className="mr-3 h-5 w-5 text-blue-600" />
                      Register New Issuer
                    </CardTitle>
                    <CardDescription>Add a new issuer wallet address to the registry</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex space-x-4">
                      <div className="flex-1">
                        <Label htmlFor="issuerAddress">Issuer Wallet Address</Label>
                        <Input
                          id="issuerAddress"
                          placeholder="0x..."
                          value={newIssuerAddress}
                          onChange={e => setNewIssuerAddress(e.target.value)}
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          onClick={handleRegisterIssuer}
                          disabled={isRegistering || !newIssuerAddress.trim()}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {isRegistering ? "Registering..." : "Register Issuer"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl flex items-center">
                          <Users className="mr-3 h-5 w-5 text-purple-600" />
                          Registered Issuers ({issuers.length})
                        </CardTitle>
                        <CardDescription>View and manage registered issuer accounts</CardDescription>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => fetchIssuers(true)} disabled={isRefreshingIssuers}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshingIssuers ? "animate-spin" : ""}`} />
                        {isRefreshingIssuers ? "Refreshing..." : "Refresh"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {issuers.length === 0 ? (
                      <div className="text-center py-8">
                        <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                        <p className="text-gray-500">No issuers registered yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {issuers.map((issuer: any) => (
                          <div key={issuer.issuerAddress} className="flex items-center justify-between p-4 border rounded-lg bg-white/50">
                            <div>
                              <p className="font-mono text-sm">{issuer.issuerAddress}</p>
                              <div className="text-xs text-gray-500 space-y-0.5">
                                <div>Registered: {formatDate(issuer.registeredAt)}</div>
                                {issuer.removedAt && <div>Removed: {formatDate(issuer.removedAt)}</div>}
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Badge className={issuer.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                                {issuer.status}
                              </Badge>
                              {issuer.status === "ACTIVE" && (
                                <Button size="sm" variant="destructive" onClick={() => handleRevokeIssuer(issuer.issuerAddress)}>
                                  <UserX className="mr-1 h-3 w-3" /> Revoke
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* ─── MINT PASSPORT MODAL ───────────────────────────────────────────────── */}
      <Dialog open={mintModalOpen} onOpenChange={setMintModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-purple-600" />
              Mint Passport & List Product
            </DialogTitle>
            <DialogDescription>
              Upload image and product details to mint a new passport on-chain and list it on the marketplace.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Temp Address Alert */}
            <div className="p-3 bg-blue-50 rounded-md border border-blue-200 text-xs text-blue-800">
              <AlertCircle className="inline mr-1 h-3 w-3" />
              Temp address: <span className="font-mono">{mintForm.tempObjectAddress}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Product Name */}
              <div>
                <Label htmlFor="productName">Product Name *</Label>
                <Input 
                  id="productName"
                  placeholder="e.g., Luxury Watch Model X" 
                  value={mintForm.productName}
                  onChange={e => setMintForm(f => ({ ...f, productName: e.target.value }))} 
                  className="mt-1" 
                />
              </div>

              {/* Brand */}
              <div>
                <Label htmlFor="brand">Brand *</Label>
                <Input 
                  id="brand"
                  placeholder="e.g., Premium Timepieces" 
                  value={mintForm.brand}
                  onChange={e => setMintForm(f => ({ ...f, brand: e.target.value }))} 
                  className="mt-1" 
                />
              </div>

              {/* Category - Converted to Select */}
              <div>
                <Label htmlFor="category">Category *</Label>
                <Select 
                  value={mintForm.category} 
                  onValueChange={(value) => setMintForm(f => ({ ...f, category: value }))}
                >
                  <SelectTrigger className="mt-1">
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

              {/* Serial Number */}
              <div>
                <Label htmlFor="serialNumber">Serial Number *</Label>
                <Input 
                  id="serialNumber"
                  placeholder="e.g., SN123456789" 
                  value={mintForm.serialNumber}
                  onChange={e => setMintForm(f => ({ ...f, serialNumber: e.target.value }))} 
                  className="mt-1" 
                />
              </div>

              {/* Manufacturing Date */}
              <div>
                <Label htmlFor="manufacturingDate">Manufacturing Date *</Label>
                <Input 
                  id="manufacturingDate"
                  type="date" 
                  value={mintForm.manufacturingDate}
                  onChange={e => setMintForm(f => ({ ...f, manufacturingDate: e.target.value }))} 
                  className="mt-1" 
                />
              </div>

              {/* Country of Origin */}
              <div>
                <Label htmlFor="origin">Country of Origin *</Label>
                <Input 
                  id="origin"
                  placeholder="e.g., Switzerland" 
                  value={mintForm.countryOfOrigin}
                  onChange={e => setMintForm(f => ({ ...f, countryOfOrigin: e.target.value }))} 
                  className="mt-1" 
                />
              </div>

              {/* Materials */}
              <div className="col-span-2">
                <Label htmlFor="materials">Materials *</Label>
                <Input 
                  id="materials"
                  placeholder="e.g., Leather, Canvas, Gold" 
                  value={mintForm.materials}
                  onChange={e => setMintForm(f => ({ ...f, materials: e.target.value }))} 
                  className="mt-1" 
                />
                <p className="text-xs text-gray-500 mt-1">Separate multiple materials with commas</p>
              </div>

              {/* Description */}
              <div className="col-span-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea 
                  id="description"
                  placeholder="Detailed product description..." 
                  value={mintForm.description}
                  onChange={e => setMintForm(f => ({ ...f, description: e.target.value }))} 
                  className="mt-1"
                  rows={3}
                />
              </div>

              {/* Image Upload */}
              <div className="col-span-2">
                <Label>Product Image * (JPEG/PNG, max 5 MB)</Label>
                <Input 
                  type="file" 
                  accept="image/jpeg,image/png,image/webp" 
                  className="mt-1"
                  onChange={e => setMintForm(f => ({ ...f, image: e.target.files?.[0] ?? null }))} 
                />
                {mintForm.image && (
                  <p className="text-xs text-green-600 mt-1">Selected: {mintForm.image.name}</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMintModalOpen(false)} disabled={isMinting}>Cancel</Button>
            <Button className="bg-purple-600 hover:bg-purple-700" onClick={handleMintNoPassport} disabled={isMinting}>
              {isMinting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Minting...</>
              ) : (
                <><Upload className="mr-2 h-4 w-4" /> Mint & List</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
