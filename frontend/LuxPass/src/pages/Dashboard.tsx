import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, FileText, Users, Wrench, ArrowRight, Settings } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { WalletButton } from "@/components/WalletButton";
import { LoginButton } from "@/components/LoginButton";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useAuth } from "@/hooks/useAuth";

const Dashboard = () => {
  const { connected } = useWallet();
  const { isAuthenticated, user, isLoading } = useAuth();

  // Show loading state while auth is initializing
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // If authenticated, redirect to appropriate dashboard based on role
  if (isAuthenticated && user) {
    switch (user.role) {
      case "ADMIN":
        return <Navigate to="/admin" replace />;
      case "ISSUER":
        return <Navigate to="/issuer" replace />;
      case "USER":
      default:
        return <Navigate to="/user" replace />;
    }
  }

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
            <Link to="/verify">
              <Button variant="outline">Verify Product</Button>
            </Link>
            <WalletButton />
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Access Dashboard</h1>
            <p className="text-xl text-gray-600">
              Connect your wallet and authenticate to access role-based features
            </p>
          </div>

          {/* Authentication Section */}
          {!connected && (
            <Card className="mb-8 border-0 shadow-xl bg-white/80 backdrop-blur-sm">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Connect Your Wallet</CardTitle>
                <CardDescription>
                  Please connect your Aptos wallet to access the dashboard features
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                <WalletButton />
              </CardContent>
            </Card>
          )}

          {connected && !isAuthenticated && (
            <Card className="mb-8 border-0 shadow-xl bg-white/80 backdrop-blur-sm">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Authenticate</CardTitle>
                <CardDescription>
                  Sign a message with your wallet to authenticate and access dashboard features
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                <LoginButton />
              </CardContent>
            </Card>
          )}

          {/* Role Information */}
          <div className="grid md:grid-cols-3 gap-6">
            {/* User Role */}
            <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
              <CardHeader className="text-center pb-4">
                <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <Users className="h-8 w-8 text-blue-600" />
                </div>
                <CardTitle className="text-xl text-gray-900">User</CardTitle>
                <CardDescription className="text-sm">
                  Basic product passport access
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center text-sm text-gray-600">
                    <div className="w-2 h-2 bg-blue-400 rounded-full mr-3"></div>
                    View owned passports
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <div className="w-2 h-2 bg-blue-400 rounded-full mr-3"></div>
                    Transfer ownership
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <div className="w-2 h-2 bg-blue-400 rounded-full mr-3"></div>
                    Verify products
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Issuer Role */}
            <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
              <CardHeader className="text-center pb-4">
                <div className="mx-auto w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                  <FileText className="h-8 w-8 text-purple-600" />
                </div>
                <CardTitle className="text-xl text-gray-900">Issuer</CardTitle>
                <CardDescription className="text-sm">
                  Create and mint product passports
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center text-sm text-gray-600">
                    <div className="w-2 h-2 bg-purple-400 rounded-full mr-3"></div>
                    All user permissions
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <div className="w-2 h-2 bg-purple-400 rounded-full mr-3"></div>
                    Mint new passports
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <div className="w-2 h-2 bg-purple-400 rounded-full mr-3"></div>
                    View issued passports
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Admin Role */}
            <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
              <CardHeader className="text-center pb-4">
                <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                  <Settings className="h-8 w-8 text-red-600" />
                </div>
                <CardTitle className="text-xl text-gray-900">Admin</CardTitle>
                <CardDescription className="text-sm">
                  System administration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center text-sm text-gray-600">
                    <div className="w-2 h-2 bg-red-400 rounded-full mr-3"></div>
                    Initialize registry
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <div className="w-2 h-2 bg-red-400 rounded-full mr-3"></div>
                    Register issuers
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <div className="w-2 h-2 bg-red-400 rounded-full mr-3"></div>
                    Revoke permissions
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Verify Products - Always Available */}
          <div className="mt-8">
            <Card className="border-0 shadow-xl hover:shadow-2xl transition-all duration-300 bg-white/80 backdrop-blur-sm group cursor-pointer">
              <Link to="/verify">
                <CardHeader className="text-center pb-4">
                  <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors">
                    <Shield className="h-8 w-8 text-green-600" />
                  </div>
                  <CardTitle className="text-2xl text-gray-900">Verify Products</CardTitle>
                  <CardDescription className="text-base">
                    Anyone can verify product authenticity - no login required
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button className="w-full bg-green-600 hover:bg-green-700 group-hover:bg-green-700">
                    Verify Product Now
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Link>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;