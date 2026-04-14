import { useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Flame, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { showError, showSuccess } from "@/utils/toast";

const API_BASE_URL = "http://localhost:3001";

type PreparedPayload = {
  function: string;
  functionArguments: unknown[];
};

type PrepareResponse = {
  success: boolean;
  payload?: PreparedPayload;
  error?: string;
};

type PassportServicePaymentProps = {
  passportLabel: string;
};

function isPositiveInteger(value: string): boolean {
  return /^[1-9]\d*$/.test(value.trim());
}

export function PassportServicePayment({ passportLabel }: PassportServicePaymentProps) {
  const { accessToken } = useAuth();
  const { connected, signAndSubmitTransaction } = useWallet();
  const [serviceLabel, setServiceLabel] = useState("Authenticity service");
  const [serviceAmount, setServiceAmount] = useState("2");
  const [isPaying, setIsPaying] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  const fetchJson = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(url, init);
    const responseText = await response.text();
    let data: any = {};

    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { message: responseText };
      }
    }

    if (!response.ok) {
      throw new Error(data?.error || data?.message || response.statusText);
    }

    return data as T;
  };

  const payForService = async () => {
    if (!accessToken) {
      showError("Please login before paying with LPT.");
      return;
    }

    if (!connected) {
      showError("Please connect your wallet before paying with LPT.");
      return;
    }

    if (!isPositiveInteger(serviceAmount)) {
      showError("Enter a positive whole-number LPT amount.");
      return;
    }

    setIsPaying(true);

    try {
      const prepared = await fetchJson<PrepareResponse>(
        `${API_BASE_URL}/api/tokens/burn-for-service/prepare`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ amount: serviceAmount }),
        }
      );

      if (!prepared.success || !prepared.payload) {
        throw new Error(prepared.error || "Passport service payment could not be prepared.");
      }

      const tx = await signAndSubmitTransaction({
        data: {
          function: prepared.payload.function,
          functionArguments: prepared.payload.functionArguments,
        },
        options: {
          maxGasAmount: 200000,
          gasUnitPrice: 100,
          expirationSecondsFromNow: 60,
        },
      });

      const txHash = (tx as { hash?: string }).hash ?? null;
      setLastTxHash(txHash);
      setIsDialogOpen(false);
      showSuccess(
        `${serviceLabel} paid for ${passportLabel} with ${serviceAmount} LPT${
          txHash ? `: ${txHash.slice(0, 10)}...` : "."
        }`
      );
    } catch (error) {
      console.error("Passport service payment failed:", error);
      const message = error instanceof Error ? error.message : "Passport service payment failed.";

      if (message.toLowerCase().includes("rejected")) {
        showError("Transaction cancelled by wallet.");
      } else {
        showError(message);
      }
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="border-orange-200 text-orange-700 hover:bg-orange-50"
        onClick={(event) => {
          event.stopPropagation();
          setIsDialogOpen(true);
        }}
        disabled={!accessToken || !connected}
      >
        <Flame className="mr-1 h-3 w-3" />
        Service
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg" onClick={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Flame className="mr-2 h-5 w-5 text-orange-600" />
              Passport Service
            </DialogTitle>
            <DialogDescription>
              Burn LPT to pay for a service on this passport.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg bg-orange-50 p-3">
              <p className="text-sm text-gray-600">Passport</p>
              <p className="font-semibold">{passportLabel}</p>
            </div>

            <div>
              <Label htmlFor={`service-${passportLabel}`}>Service</Label>
              <select
                id={`service-${passportLabel}`}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={serviceLabel}
                onChange={(event) => setServiceLabel(event.target.value)}
              >
                <option>Authenticity service</option>
                <option>Repair request</option>
                <option>Premium provenance report</option>
              </select>
            </div>

            <div>
              <Label htmlFor={`service-cost-${passportLabel}`}>Cost</Label>
              <Input
                id={`service-cost-${passportLabel}`}
                inputMode="numeric"
                value={serviceAmount}
                onChange={(event) => setServiceAmount(event.target.value)}
              />
            </div>

            <Button
              className="w-full bg-orange-600 hover:bg-orange-700"
              onClick={payForService}
              disabled={isPaying || !accessToken || !connected}
            >
              {isPaying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Paying...
                </>
              ) : (
                <>
                  <Flame className="mr-2 h-4 w-4" />
                  Pay With LPT
                </>
              )}
            </Button>

            {lastTxHash && (
              <p className="text-xs text-gray-600">
                Last service payment: <span className="font-mono">{lastTxHash}</span>
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
