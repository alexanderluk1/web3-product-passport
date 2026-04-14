import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Shield, Store, Search, Tag, Image as ImageIcon, Loader2, ShoppingCart, ExternalLink,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { WalletButton } from "@/components/WalletButton";
import { fetchMarketplaceListings, type MarketplaceListing } from "@/utils/marketplace";
import { octasToApt, getAptUsdPrice, formatUsd } from "@/utils/price";

const PINATA_GATEWAY_URL = "https://amaranth-passive-chicken-549.mypinata.cloud";

interface EnrichedListing extends MarketplaceListing {
  metadata?: { name: string; description: string; image: string; attributes?: Array<{ trait_type: string; value: string }> };
  metadataLoading?: boolean;
}

function convertIPFSToHTTP(uri: string): string {
  if (uri.startsWith("ipfs://")) return `${PINATA_GATEWAY_URL}/ipfs/${uri.replace("ipfs://", "")}`;
  return uri;
}

const Marketplace = () => {
  const navigate = useNavigate();
  const [listings, setListings] = useState<EnrichedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [aptUsd, setAptUsd] = useState<number>(0);

  useEffect(() => {
    loadListings();
    getAptUsdPrice().then(setAptUsd);
  }, []);

  const loadListings = async () => {
    setLoading(true);
    try {
      const raw = await fetchMarketplaceListings();
      const enriched: EnrichedListing[] = raw.map((l) => ({ ...l, metadataLoading: true }));
      setListings(enriched);
      // Enrich metadata in parallel — use metadataUri from listing if available
      enriched.forEach((listing, i) => {
        const resolve = listing.metadataUri
          ? fetchMetadataFromUri(listing.metadataUri)
          : fetchMetadata(listing.passportObjectAddress);
        resolve.then((meta) => {
          setListings((prev) =>
            prev.map((l, j) =>
              j === i ? { ...l, metadata: meta ?? undefined, metadataLoading: false } : l,
            ),
          );
        });
      });
    } catch {
      // silent fail — empty marketplace
    } finally {
      setLoading(false);
    }
  };

  const fetchMetadataFromUri = async (metadataUri: string) => {
    try {
      const metaRes = await fetch(convertIPFSToHTTP(metadataUri));
      if (!metaRes.ok) return null;
      return await metaRes.json();
    } catch {
      return null;
    }
  };

  const fetchMetadata = async (passportAddr: string) => {
    try {
      // Use the passport object address endpoint (not by-product which expects a serial/product ID)
      const res = await fetch(`http://localhost:3001/api/passports/${passportAddr}`);
      if (!res.ok) return null;
      const data = await res.json();
      const metadataUri = data.data?.metadataUri;
      if (!metadataUri) return null;
      const metaRes = await fetch(convertIPFSToHTTP(metadataUri));
      if (!metaRes.ok) return null;
      return await metaRes.json();
    } catch {
      return null;
    }
  };

  const filtered = listings.filter((l) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      l.productName?.toLowerCase().includes(q) ||
      l.brand?.toLowerCase().includes(q) ||
      l.category?.toLowerCase().includes(q) ||
      l.metadata?.name?.toLowerCase().includes(q) ||
      l.passportObjectAddress.toLowerCase().includes(q)
    );
  });

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
            <Link to="/verify">
              <Button variant="ghost">Verify</Button>
            </Link>
            <Link to="/marketplace">
              <Button variant="ghost" className="text-purple-600 font-semibold">Marketplace</Button>
            </Link>
            <WalletButton />
            <Link to="/dashboard">
              <Button className="bg-purple-600 hover:bg-purple-700">Dashboard</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="container mx-auto px-4 pt-12 pb-8">
        <div className="flex items-center gap-3 mb-2">
          <Store className="h-8 w-8 text-purple-600" />
          <h1 className="text-4xl font-bold text-gray-900">Marketplace</h1>
        </div>
        <p className="text-gray-500 text-lg mb-6">
          Browse verified luxury items with escrow-protected purchases
        </p>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by name, brand, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </section>

      <Separator />

      {/* Grid */}
      <section className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            <span className="ml-3 text-gray-500">Loading marketplace...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Store className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-400 mb-2">
              {searchQuery ? "No items match your search" : "No items listed yet"}
            </h3>
            <p className="text-gray-400">
              {searchQuery ? "Try a different search term" : "Check back soon for new listings"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((listing) => (
              <Card
                key={listing.passportObjectAddress}
                className="overflow-hidden hover:shadow-xl transition-all cursor-pointer group border-0 shadow-md bg-white"
                onClick={() => navigate(`/marketplace/${listing.passportObjectAddress}`)}
              >
                {/* Image */}
                <CardHeader className="p-0">
                  <div className="aspect-square bg-gray-100 relative overflow-hidden">
                    {listing.metadataLoading ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
                      </div>
                    ) : listing.metadata?.image ? (
                      <img
                        src={convertIPFSToHTTP(listing.metadata.image)}
                        alt={listing.metadata.name ?? "Product"}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <ImageIcon className="h-12 w-12 text-gray-300" />
                      </div>
                    )}
                    <Badge className="absolute top-3 right-3 bg-green-500/90 text-white border-0">
                      Verified
                    </Badge>
                  </div>
                </CardHeader>

                {/* Info */}
                <CardContent className="p-4">
                  <h3 className="font-semibold text-gray-900 truncate text-lg">
                    {listing.metadata?.name ?? listing.productName ?? "Luxury Item"}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    {(listing.brand || listing.metadata?.attributes?.find((a) => a.trait_type === "Brand")?.value) && (
                      <Badge variant="outline" className="text-xs">
                        <Tag className="h-3 w-3 mr-1" />
                        {listing.brand || listing.metadata?.attributes?.find((a) => a.trait_type === "Brand")?.value}
                      </Badge>
                    )}
                    {listing.category && (
                      <Badge variant="secondary" className="text-xs">{listing.category}</Badge>
                    )}
                  </div>
                </CardContent>

                {/* Price */}
                <CardFooter className="p-4 pt-0 flex items-center justify-between">
                  <div>
                    <p className="text-xl font-bold text-purple-600">
                      {octasToApt(listing.priceOctas)} APT
                    </p>
                    {aptUsd > 0 && (
                      <p className="text-sm text-gray-400">
                        {formatUsd(Number(octasToApt(listing.priceOctas)) * aptUsd)}
                      </p>
                    )}
                  </div>
                  <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
                    <ShoppingCart className="h-4 w-4 mr-1" />
                    View
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Marketplace;
