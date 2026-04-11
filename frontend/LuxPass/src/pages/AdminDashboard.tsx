import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Settings, Users, UserPlus, UserX, Database, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { showSuccess, showError } from "@/utils/toast";

const AdminDashboard = () => {
  const { user, accessToken } = useAuth();
  const [issuers, setIssuers] = useState([]);
  const [newIssuerAddress, setNewIssuerAddress] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [registryStatus, setRegistryStatus] = useState(null);
  const [isRefreshingIssuers, setIsRefreshingIssuers] = useState(false);

  useEffect(() => {
    if (user && accessToken) {
      fetchIssuers();
      fetchRegistryStatus();
    }
  }, [user, accessToken]);

  const fetchIssuers = async (showRefreshIndicator = false, context = "initial") => {
    try {
      if (showRefreshIndicator) {
        setIsRefreshingIssuers(true);
      }
      
      console.log(`📡 Fetching issuers with GET /admin/issuers... (Context: ${context})`);
      console.log("📡 Using token:", accessToken?.substring(0, 20) + "...");
      
      const response = await fetch("http://localhost:3001/admin/issuers", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      });
      
      console.log(`📡 Issuers response status: ${response.status} (Context: ${context})`);
      console.log("📡 Issuers response headers:", Object.fromEntries(response.headers.entries()));
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Issuers response data (Context: ${context}):`, data);
        
        // Handle the response shape: { "issuers": [...] }
        if (data.issuers && Array.isArray(data.issuers)) {
          console.log(`✅ Issuers array (Context: ${context}):`, data.issuers);
          console.log(`📊 Found ${data.issuers.length} issuers (Context: ${context})`);
          
          // Log each issuer for detailed tracking
          data.issuers.forEach((issuer, index) => {
            console.log(`   ${index + 1}. ${issuer.issuerAddress} - Status: ${issuer.status} - Registered: ${new Date(issuer.registeredAt).toISOString()}`);
          });
          
          setIssuers(data.issuers);
          
          if (showRefreshIndicator) {
            const message = `Issuer list refreshed! Found ${data.issuers.length} issuers.`;
            console.log(`🎉 ${message} (Context: ${context})`);
            showSuccess(message);
          }
        } else {
          console.warn(`⚠️ Unexpected response format - no 'issuers' array found (Context: ${context})`);
          setIssuers([]);
        }
      } else {
        const errorText = await response.text();
        console.error(`❌ Failed to fetch issuers (Context: ${context}):`, {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        
        // Show specific error messages
        if (response.status === 401) {
          showError("Authentication failed - please login again");
        } else if (response.status === 403) {
          showError("Access denied - admin role required");
        } else if (response.status === 404) {
          showError("Admin router not mounted - check backend configuration");
        } else {
          showError("Failed to fetch issuers");
        }
      }
    } catch (error) {
      console.error(`💥 Error fetching issuers (Context: ${context}):`, error);
      showError("Network error fetching issuers");
    } finally {
      if (showRefreshIndicator) {
        setIsRefreshingIssuers(false);
      }
    }
  };

  const fetchRegistryStatus = async () => {
    try {
      console.log("📡 Fetching registry status with GET /admin/registry/status...");
      console.log("📡 Using token:", accessToken?.substring(0, 20) + "...");
      
      const response = await fetch("http://localhost:3001/admin/registry/status", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      });
      
      console.log("📡 Registry status response status:", response.status);
      console.log("📡 Registry status response headers:", Object.fromEntries(response.headers.entries()));
      
      if (response.ok) {
        const data = await response.json();
        console.log("✅ Registry status data:", data);
        setRegistryStatus(data);
      } else {
        const errorText = await response.text();
        console.error("❌ Failed to fetch registry status:", {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        
        // Show specific error messages based on status code
        if (response.status === 401) {
          showError("Authentication failed - please login again");
        } else if (response.status === 403) {
          showError("Access denied - admin role required");
        } else if (response.status === 404) {
          showError("Admin router not mounted - check backend configuration");
        } else {
          showError("Failed to fetch registry status");
        }
      }
    } catch (error) {
      console.error("💥 Error fetching registry status:", error);
      showError("Network error fetching registry status");
    }
  };

  const handleInitRegistry = async () => {
    setIsInitializing(true);
    try {
      console.log("📡 Initializing registry with POST /admin/registry/init...");
      const response = await fetch("http://localhost:3001/admin/registry/init", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      });

      console.log("📡 Init registry response status:", response.status);

      if (response.ok) {
        const data = await response.json();
        console.log("✅ Registry initialized:", data);
        showSuccess("Registry initialized successfully!");
        fetchRegistryStatus();
      } else {
        const errorText = await response.text();
        console.error("❌ Failed to initialize registry:", {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        showError("Failed to initialize registry");
      }
    } catch (error) {
      console.error("💥 Registry initialization error:", error);
      showError("Registry initialization failed");
    } finally {
      setIsInitializing(false);
    }
  };

  const handleRegisterIssuer = async () => {
    if (!newIssuerAddress.trim()) {
      showError("Please enter a valid wallet address");
      return;
    }

    setIsRegistering(true);
    try {
      console.log("📡 Registering issuer with POST /admin/issuers/register...");
      console.log("📡 Issuer address:", newIssuerAddress);
      
      const requestBody = {
        issuerAddress: newIssuerAddress,
      };
      console.log("📡 Request body:", requestBody);

      const response = await fetch("http://localhost:3001/admin/issuers/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestBody),
      });

      console.log("📡 Register issuer response status:", response.status);
      console.log("📡 Register issuer response headers:", Object.fromEntries(response.headers.entries()));

      if (response.ok) {
        const data = await response.json();
        console.log("✅ Issuer registered successfully:", data);
        showSuccess(`Issuer ${newIssuerAddress} registered successfully!`);
        setNewIssuerAddress("");
        
        // Refresh the issuers list with visual feedback and detailed logging
        console.log("🔄 Refreshing issuer list after successful registration...");
        console.log(`🔄 Previous issuer count: ${issuers.length}`);
        await fetchIssuers(true, "post-registration");
        console.log("🔄 Issuer list refresh completed after registration");
      } else {
        const errorText = await response.text();
        console.error("❌ Failed to register issuer:", {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        
        // Show specific error messages
        if (response.status === 401) {
          showError("Authentication failed - please login again");
        } else if (response.status === 403) {
          showError("Access denied - admin role required");
        } else if (response.status === 400) {
          showError("Invalid issuer address format");
        } else {
          showError("Failed to register issuer");
        }
      }
    } catch (error) {
      console.error("💥 Issuer registration error:", error);
      showError("Issuer registration failed");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleRevokeIssuer = async (issuerAddress: string) => {
    try {
      console.log("📡 Revoking issuer:", issuerAddress);
      const response = await fetch(`http://localhost:3001/admin/issuers/${issuerAddress}/revoke`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      });

      console.log("📡 Revoke issuer response status:", response.status);

      if (response.ok) {
        const data = await response.json();
        console.log("✅ Issuer revoked successfully:", data);
        showSuccess(`Issuer ${issuerAddress} revoked successfully!`);
        
        // Refresh the issuers list after revocation with detailed logging
        console.log("🔄 Refreshing issuer list after successful revocation...");
        console.log(`🔄 Previous issuer count: ${issuers.length}`);
        console.log(`🔄 Revoked issuer: ${issuerAddress}`);
        await fetchIssuers(true, "post-revocation");
        console.log("🔄 Issuer list refresh completed after revocation");
      } else {
        const errorText = await response.text();
        console.error("❌ Failed to revoke issuer:", {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        showError("Failed to revoke issuer");
      }
    } catch (error) {
      console.error("💥 Issuer revocation error:", error);
      showError("Issuer revocation failed");
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
            <Link to="/dashboard">
              <Button variant="outline">Dashboard</Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
            <p className="text-gray-600">System administration and issuer management</p>
            <div className="mt-2 text-sm text-gray-500">
              User ID: {user?.id} | Role: {user?.role} | Token: {accessToken?.substring(0, 20)}...
            </div>
          </div>

          <Tabs defaultValue="registry" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 bg-white/80 backdrop-blur-sm">
              <TabsTrigger value="registry" className="flex items-center">
                <Database className="mr-2 h-4 w-4" />
                Registry Management
              </TabsTrigger>
              <TabsTrigger value="issuers" className="flex items-center">
                <Users className="mr-2 h-4 w-4" />
                Issuer Management
              </TabsTrigger>
            </TabsList>

            {/* Registry Management Tab */}
            <TabsContent value="registry">
              <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center">
                    <Database className="mr-3 h-6 w-6 text-red-600" />
                    Registry Management
                  </CardTitle>
                  <CardDescription>
                    Initialize and manage the product passport registry
                  </CardDescription>
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

                  {!registryStatus?.initialized && (
                    <div className="text-center py-8">
                      <Database className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <p className="text-gray-600 mb-4">
                        The registry needs to be initialized before issuers can mint passports.
                      </p>
                      <Button 
                        onClick={handleInitRegistry}
                        disabled={isInitializing}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        {isInitializing ? "Initializing..." : "Initialize Registry"}
                      </Button>
                    </div>
                  )}

                  {registryStatus?.initialized && (
                    <div className="text-center py-8">
                      <Database className="mx-auto h-12 w-12 text-green-600 mb-4" />
                      <p className="text-green-600 font-semibold">Registry is initialized and ready!</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Issuer Management Tab */}
            <TabsContent value="issuers">
              <div className="space-y-6">
                {/* Register New Issuer */}
                <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-xl flex items-center">
                      <UserPlus className="mr-3 h-5 w-5 text-blue-600" />
                      Register New Issuer
                    </CardTitle>
                    <CardDescription>
                      Add a new issuer wallet address to the registry
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex space-x-4">
                      <div className="flex-1">
                        <Label htmlFor="issuerAddress">Issuer Wallet Address</Label>
                        <Input
                          id="issuerAddress"
                          placeholder="0x..."
                          value={newIssuerAddress}
                          onChange={(e) => setNewIssuerAddress(e.target.value)}
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

                {/* Existing Issuers */}
                <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl flex items-center">
                          <Users className="mr-3 h-5 w-5 text-purple-600" />
                          Registered Issuers ({issuers.length})
                        </CardTitle>
                        <CardDescription>
                          View and manage registered issuer accounts
                        </CardDescription>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => fetchIssuers(true, "manual-refresh")}
                        disabled={isRefreshingIssuers}
                      >
                        <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshingIssuers ? 'animate-spin' : ''}`} />
                        {isRefreshingIssuers ? "Refreshing..." : "Refresh"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {issuers.length === 0 ? (
                      <div className="text-center py-8">
                        <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                        <p className="text-gray-500">No issuers registered yet.</p>
                        <p className="text-xs text-gray-400 mt-2">Check console for API response details</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {issuers.map((issuer: any) => (
                          <div key={issuer.issuerAddress} className="flex items-center justify-between p-4 border rounded-lg bg-white/50">
                            <div>
                              <p className="font-mono text-sm">{issuer.issuerAddress}</p>
                              <div className="text-xs text-gray-500 space-y-1">
                                <div>Registered: {formatDate(issuer.registeredAt)}</div>
                                {issuer.removedAt && (
                                  <div>Removed: {formatDate(issuer.removedAt)}</div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Badge className={issuer.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                                {issuer.status}
                              </Badge>
                              {issuer.status === "ACTIVE" && (
                                <Button 
                                  size="sm" 
                                  variant="destructive"
                                  onClick={() => handleRevokeIssuer(issuer.issuerAddress)}
                                >
                                  <UserX className="mr-1 h-3 w-3" />
                                  Revoke
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
    </div>
  );
};

export default AdminDashboard;