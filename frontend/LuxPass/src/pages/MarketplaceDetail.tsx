import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Shield, ArrowLeft, ShoppingCart, User, Tag, Image as ImageIcon,
  Loader2, ExternalLink, CheckCircle2, AlertCircle, Clock, Wallet,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { WalletButton } from "@/components/WalletButton";
import { showSuccess, showError } from "@/utils/toast";
import { fetchEscrowListing, type EscrowListingDetail } from "@/utils/marketplace";
import { octasToApt, getAptUsdPrice, formatUsd } from "@/utils/price";

const PINATA_GATEWAY_URL = "https://amaranth-passive-chicken-549.mypinata.cloud";
const BASE_URL = "http://localhost:3001";

interface ProductMetadata {
  name: string;
  description: string;
  image: string;
  brand?: string;
  category?: string;
  serialNumber?: string;
  materials?: string[];
  countryOfOrigin?: string;
  manufacturingDate?: string;
  attributes?: Array<{ trait_type: string; value: string }>;
}

function convertIPFSToHTTP(uri: string): string {
  if (uri.startsWith("ipfs://")) return `https://${PINATA_GATEWAY_URL}/ipfs/${uri.replace("ipfs://", "")}`;
  return uri;
}

const MarketplaceDetail = () => {
  const { passportObjectAddress } = useParams<{ passportObjectAddress: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, accessToken, user } = useAuth();
  const { signAndSubmitTransaction } = useWallet();

  const [escrowListing, setEscrowListing] = useState<EscrowListingDetail | null>(null);
  const [metadata, setMetadata] = useState<ProductMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [aptUsd, setAptUsd] = useState<number>(0);
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [ownerAddress, setOwnerAddress] = useState<string>("");

  useEffect(() => {
    if (passportObjectAddress) {
      loadData();
      getAptUsdPrice().then(setAptUsd);
    }
  }, [passportObjectAddress]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [listing, meta, owner] = await Promise.all([
        fetchEscrowListing(passportObjectAddress!),
        fetchPassportMetadata(passportObjectAddress!),
        fetchOwner(passportObjectAddress!),
      ]);
      setEscrowListing(listing);
      setMetadata(meta);
      setOwnerAddress(owner);
    } catch {
      showError("Failed to load listing details");
    } finally {
      setLoading(false);
    }
  };

  const fetchPassportMetadata = async (addr: string): Promise<ProductMetadata | null> => {
    try {
      // Use the passport object address endpoint (not by-product which expects a serial/product ID)
      const res = await fetch(`${BASE_URL}/api/passports/${addr}`);
      if (!res.ok) return null;
      const data = await res.json();
      const metadataUri = data.data?.metadataUri;
      if (!metadataUri) return null;
      const metaRes = await fetch(convertIPFSToHTTP(metadataUri));
      if (!metaRes.ok) return null;
      return metaRes.json();
    } catch {
      return null;
    }
  };

  const fetchOwner = async (addr: string): Promise<string> => {
    try {
      const res = await fetch(
        `https://fullnode.devnet.aptoslabs.com/v1/accounts/${addr}/resource/0x1::object::ObjectCore`,
      );
      if (!res.ok) return "";
      const data = await res.json();
      return data.data?.owner ?? "";
    } catch {
      return "";
    }
  };

  const handlePurchase = async () => {
    if (!accessToken || !passportObjectAddress) return;
    setPurchasing(true);
    try {
      // 1. Prepare
      const prepRes = await fetch(`${BASE_URL}/api/escrow/purchase/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ passportObjectAddress }),
      });
      const prepData = await prepRes.json();
      if (!prepData.success) {
        showError(prepData.error ?? "Failed to prepare purchase");
        return;
      }

      // 2. Sign and submit
      const txRes = await signAndSubmitTransaction({
        data: {
          function: prepData.payload.function,
          functionArguments: prepData.payload.functionArguments,
        },
        options: { maxGasAmount: 10000, gasUnitPrice: 100, expirationSecondsFromNow: 60 },
      });

      // 3. Record
      const recRes = await fetch(`${BASE_URL}/api/escrow/purchase/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ txHash: txRes.hash, passportObjectAddress }),
      });
      const recData = await recRes.json();
      if (recData.success) {
        showSuccess("Purchase successful! The passport is now yours.");
        setShowPurchaseDialog(false);
        navigate("/user");
      } else {
        showError("Purchase completed on-chain but backend record failed.");
      }
    } catch (err: any) {
      if (err.message?.includes("rejected")) {
        showError("Transaction cancelled by user");
      } else {
        showError("Purchase failed. Please try again.");
      }
    } finally {
      setPurchasing(false);
    }
  };

  const getAttr = (key: string) =>
    metadata?.attributes?.find((a) => a.trait_type === key)?.value;

  const priceApt = escrowListing ? octasToApt(escrowListing.priceOctas) : "0";
  const priceUsd = aptUsd > 0 ? formatUsd(Number(priceApt) * aptUsd) : "";
  const isSeller = user?.walletAddress?.toLowerCase() === escrowListing?.seller?.toLowerCase();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Nav */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <Shield className="h-8 w-8 text-purple-600" />
            <span className="text-2xl font-bold text-gray-900">LuxPass</span>
          </Link>
          <div className="flex items-center space-x-4">
            <Link to="/marketplace">
              <Button variant="ghost">Marketplace</Button>
            </Link>
            <WalletButton />
            <Link to="/dashboard">
              <Button className="bg-purple-600 hover:bg-purple-700">Dashboard</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Back link */}
      <div className="container mx-auto px-4 pt-6">
        <Link to="/marketplace" className="inline-flex items-center text-gray-500 hover:text-purple-600 transition-colors">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Marketplace
        </Link>
      </div>

      {/* Content */}
      <section className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-10">
          {/* Left: Image */}
          <div className="aspect-square bg-white rounded-2xl shadow-lg overflow-hidden">
            {metadata?.image ? (
              <img
                src={convertIPFSToHTTP(metadata.image)}
                alt={metadata.name ?? "Product"}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-50">
                <ImageIcon className="h-24 w-24 text-gray-200" />
              </div>
            )}
          </div>

          {/* Right: Details */}
          <div className="space-y-6">
            {/* Title + badges */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-green-500/90 text-white border-0">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Verified Authentic
                </Badge>
                {escrowListing?.isActive && (
                  <Badge className="bg-purple-500/90 text-white border-0">
                    <Shield className="h-3 w-3 mr-1" />
                    Escrow Protected
                  </Badge>
                )}
              </div>
              <h1 className="text-3xl font-bold text-gray-900">
                {metadata?.name ?? "Luxury Item"}
              </h1>
              {(getAttr("Brand") || metadata?.brand) && (
                <p className="text-lg text-gray-500 mt-1">
                  {getAttr("Brand") || metadata?.brand}
                </p>
              )}
            </div>

            {/* Price */}
            <Card className="border-2 border-purple-200 bg-purple-50/50">
              <CardContent className="p-6">
                <p className="text-sm text-gray-500 mb-1">Price</p>
                <p className="text-4xl font-bold text-purple-600">{priceApt} APT</p>
                {priceUsd && (
                  <p className="text-lg text-gray-400 mt-1">~{priceUsd} USD</p>
                )}
              </CardContent>
            </Card>

            {/* Purchase button */}
            {escrowListing?.isActive ? (
              !isAuthenticated ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500 flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Connect your wallet and sign in to purchase
                  </p>
                  <WalletButton />
                </div>
              ) : isSeller ? (
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-amber-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    This is your listing. You cannot purchase your own item.
                  </p>
                </div>
              ) : (
                <Button
                  size="lg"
                  className="w-full bg-purple-600 hover:bg-purple-700 text-lg py-6"
                  onClick={() => setShowPurchaseDialog(true)}
                >
                  <ShoppingCart className="h-5 w-5 mr-2" />
                  Purchase for {priceApt} APT
                </Button>
              )
            ) : (
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-gray-500 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  This item is no longer available
                </p>
              </div>
            )}

            <Separator />

            {/* Details */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">Product Details</h3>
              {metadata?.description && (
                <p className="text-gray-600">{metadata.description}</p>
              )}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {getAttr("Category") && (
                  <div>
                    <p className="text-gray-400">Category</p>
                    <p className="font-medium">{getAttr("Category")}</p>
                  </div>
                )}
                {getAttr("Serial Number") && (
                  <div>
                    <p className="text-gray-400">Serial Number</p>
                    <p className="font-medium">{getAttr("Serial Number")}</p>
                  </div>
                )}
                {getAttr("Materials") && (
                  <div>
                    <p className="text-gray-400">Materials</p>
                    <p className="font-medium">{getAttr("Materials")}</p>
                  </div>
                )}
                {getAttr("Country of Origin") && (
                  <div>
                    <p className="text-gray-400">Origin</p>
                    <p className="font-medium">{getAttr("Country of Origin")}</p>
                  </div>
                )}
                {getAttr("Manufacturing Date") && (
                  <div>
                    <p className="text-gray-400">Manufactured</p>
                    <p className="font-medium">{getAttr("Manufacturing Date")}</p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Seller + passport info */}
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 flex items-center gap-1">
                  <User className="h-4 w-4" /> Seller
                </span>
                <span className="font-mono text-gray-600">
                  {escrowListing?.seller?.slice(0, 8)}...{escrowListing?.seller?.slice(-6)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 flex items-center gap-1">
                  <Tag className="h-4 w-4" /> Passport
                </span>
                <a
                  href={`https://explorer.aptoslabs.com/object/${passportObjectAddress}?network=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-purple-600 hover:underline flex items-center gap-1"
                >
                  {passportObjectAddress?.slice(0, 8)}...{passportObjectAddress?.slice(-6)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Purchase confirmation dialog */}
      <Dialog open={showPurchaseDialog} onOpenChange={setShowPurchaseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Purchase</DialogTitle>
            <DialogDescription>
              You are about to purchase this item through the escrow smart contract.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Item</span>
              <span className="font-semibold">{metadata?.name ?? "Luxury Item"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Price</span>
              <span className="font-bold text-purple-600 text-lg">{priceApt} APT</span>
            </div>
            {priceUsd && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500">USD equivalent</span>
                <span className="text-gray-600">~{priceUsd}</span>
              </div>
            )}
            <Separator />
            <div className="p-3 bg-amber-50 rounded-lg text-sm text-amber-700">
              This will transfer <strong>{priceApt} APT</strong> from your wallet.
              The passport will be transferred to you atomically via the escrow contract.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPurchaseDialog(false)} disabled={purchasing}>
              Cancel
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700"
              onClick={handlePurchase}
              disabled={purchasing}
            >
              {purchasing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Confirm Purchase
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MarketplaceDetail;
