import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Scan, Users, FileText, ArrowRight, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { WalletButton } from "@/components/WalletButton";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Navigation */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Shield className="h-8 w-8 text-purple-600" />
            <span className="text-2xl font-bold text-gray-900">LuxPass</span>
          </div>
          <div className="flex items-center space-x-4">
            <Link to="/verify">
              <Button variant="ghost">Verify Product</Button>
            </Link>
            <WalletButton />
            <Link to="/dashboard">
              <Button className="bg-purple-600 hover:bg-purple-700">Dashboard</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Digital Product Passports
            <span className="text-purple-600 block">On-Chain</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Tamper-resistant, portable records that support authenticity checks and provenance tracking throughout your product's entire lifecycle.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/verify">
              <Button size="lg" className="bg-purple-600 hover:bg-purple-700 text-lg px-8 py-3">
                <Scan className="mr-2 h-5 w-5" />
                Verify Product
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button size="lg" variant="outline" className="text-lg px-8 py-3">
                Access Dashboard
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Complete Lifecycle Management</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            From manufacturing to resale, LuxPass provides comprehensive tracking and verification for luxury goods.
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow bg-white/80 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <FileText className="h-6 w-6 text-purple-600" />
              </div>
              <CardTitle className="text-lg">Issuer Dashboard</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Create and mint new product passports at point of manufacture or authorized first sale.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow bg-white/80 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <CardTitle className="text-lg">Owner Dashboard</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                View passport details and transfer ownership to another wallet seamlessly.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow bg-white/80 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <Scan className="h-6 w-6 text-green-600" />
              </div>
              <CardTitle className="text-lg">Verify Products</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Verify authenticity by product ID or QR scan, showing issuer and provenance history.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow bg-white/80 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-orange-600" />
              </div>
              <CardTitle className="text-lg">Service Records</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Append repair and alteration records to maintain complete lifecycle history.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="bg-white/50 backdrop-blur-sm py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Why Choose LuxPass?</h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="flex flex-col items-center">
                <CheckCircle className="h-8 w-8 text-green-600 mb-4" />
                <h3 className="font-semibold text-lg mb-2">Tamper-Resistant</h3>
                <p className="text-gray-600 text-sm">Blockchain technology ensures records cannot be altered or falsified.</p>
              </div>
              <div className="flex flex-col items-center">
                <CheckCircle className="h-8 w-8 text-green-600 mb-4" />
                <h3 className="font-semibold text-lg mb-2">Portable</h3>
                <p className="text-gray-600 text-sm">Access your product history from anywhere, anytime.</p>
              </div>
              <div className="flex flex-col items-center">
                <CheckCircle className="h-8 w-8 text-green-600 mb-4" />
                <h3 className="font-semibold text-lg mb-2">Complete Lifecycle</h3>
                <p className="text-gray-600 text-sm">Track from manufacture through resale and service history.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Shield className="h-6 w-6 text-purple-400" />
            <span className="text-xl font-bold">LuxPass</span>
          </div>
          <p className="text-gray-400">
            Securing luxury goods with blockchain technology
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;