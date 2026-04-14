import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { ArrowRightLeft, Flame, Gift, Loader2, RefreshCw, Send, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { showError, showSuccess } from "@/utils/toast";

const API_BASE_URL = "http://localhost:3001";
const DEFAULT_SERVICE_AMOUNT = "2";
const SIGNUP_CLAIM_STORAGE_PREFIX = "luxpass:lpt:signup-claimed:";

type PreparedPayload = {
  function: string;
  functionArguments: unknown[];
};

type PrepareResponse = {
  success: boolean;
  payload?: PreparedPayload;
  error?: string;
};

type TokenStatus = {
  initialised: boolean;
  adminAddress: string | null;
  error?: string;
};

type RewardConfig = {
  signupReward?: string;
  referralReward?: string;
};

type SignupClaimedResponse = {
  success: boolean;
  ownerAddress: string;
  claimed: boolean;
};

function isValidWalletAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{1,64}$/.test(address.trim());
}

function isPositiveInteger(value: string): boolean {
  return /^[1-9]\d*$/.test(value.trim());
}

function shortenAddress(address?: string | null): string {
  if (!address) {
    return "Not available";
  }

  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}

function getWalletAddress(account: unknown): string {
  const maybeAccount = account as {
    address?: string | { toString: () => string };
    publicKey?: { toString: () => string };
  } | null;

  if (!maybeAccount) {
    return "";
  }

  if (typeof maybeAccount.address === "string") {
    return maybeAccount.address;
  }

  if (maybeAccount.address && typeof maybeAccount.address.toString === "function") {
    return maybeAccount.address.toString();
  }

  return "";
}

export function LptPanel() {
  const { accessToken, user } = useAuth();
  const { account, connected, signAndSubmitTransaction } = useWallet();
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [balance, setBalance] = useState<string>("0");
  const [rewardConfig, setRewardConfig] = useState<RewardConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [transferAmount, setTransferAmount] = useState("1");
  const [serviceAmount, setServiceAmount] = useState(DEFAULT_SERVICE_AMOUNT);
  const [serviceLabel, setServiceLabel] = useState("Authenticity service");
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [signupRewardClaimed, setSignupRewardClaimed] = useState(false);

  const walletAddress = useMemo(() => {
    return user?.walletAddress || getWalletAddress(account);
  }, [account, user?.walletAddress]);

  const authHeaders = useMemo(() => {
    return {
      Authorization: `Bearer ${accessToken}`,
    };
  }, [accessToken]);

  const signupClaimStorageKey = useMemo(() => {
    return walletAddress ? `${SIGNUP_CLAIM_STORAGE_PREFIX}${walletAddress.toLowerCase()}` : "";
  }, [walletAddress]);

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
      const message = data?.error || data?.message || response.statusText;
      throw new Error(message);
    }

    return data as T;
  };

  const refreshTokenData = async (showToast = false) => {
    setIsLoading(true);

    try {
      const tokenStatus = await fetchJson<TokenStatus>(`${API_BASE_URL}/api/tokens/status`);
      setStatus(tokenStatus);

      if (accessToken && walletAddress) {
        const [balanceData, rewardData, signupClaimedData] = await Promise.all([
          fetchJson<{ success: boolean; balance: string; ownerAddress: string }>(
            `${API_BASE_URL}/api/tokens/balance/${encodeURIComponent(walletAddress)}`,
            { headers: authHeaders }
          ),
          fetchJson<{ success: boolean } & RewardConfig>(
            `${API_BASE_URL}/api/tokens/reward-config`,
            { headers: authHeaders }
          ),
          fetchJson<SignupClaimedResponse>(
            `${API_BASE_URL}/api/tokens/signup-claimed/${encodeURIComponent(walletAddress)}`,
            { headers: authHeaders }
          ),
        ]);

        setBalance(String(balanceData.balance ?? "0"));
        setRewardConfig(rewardData);
        const claimedLocally =
          Boolean(signupClaimStorageKey) &&
          localStorage.getItem(signupClaimStorageKey) === "true";

        setSignupRewardClaimed(Boolean(signupClaimedData.claimed) || claimedLocally);

        if (signupClaimedData.claimed && signupClaimStorageKey) {
          localStorage.setItem(signupClaimStorageKey, "true");
        }
      } else {
        setBalance("0");
        setRewardConfig(null);
        setSignupRewardClaimed(false);
      }

      if (showToast) {
        showSuccess("LPT data refreshed.");
      }
    } catch (error) {
      console.error("LPT refresh failed:", error);
      showError(error instanceof Error ? error.message : "Failed to refresh LPT data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshTokenData();
  }, [accessToken, walletAddress]);

  useEffect(() => {
    if (!signupClaimStorageKey) {
      setSignupRewardClaimed(false);
      return;
    }

    setSignupRewardClaimed(localStorage.getItem(signupClaimStorageKey) === "true");
  }, [signupClaimStorageKey]);

  const prepareTokenAction = async (
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<PreparedPayload> => {
    if (!accessToken) {
      throw new Error("Please login before using LPT.");
    }

    const data = await fetchJson<PrepareResponse>(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: body ? JSON.stringify(body) : JSON.stringify({}),
    });

    if (!data.success || !data.payload) {
      throw new Error(data.error || "Token action could not be prepared.");
    }

    return data.payload;
  };

  const submitPreparedPayload = async (payload: PreparedPayload) => {
    const tx = await signAndSubmitTransaction({
      data: {
        function: payload.function,
        functionArguments: payload.functionArguments,
      },
      options: {
        maxGasAmount: 200000,
        gasUnitPrice: 100,
        expirationSecondsFromNow: 60,
      },
    });

    const txHash = (tx as { hash?: string }).hash ?? null;
    setLastTxHash(txHash);
    setTimeout(() => refreshTokenData(), 2000);
    return txHash;
  };

  const runTokenAction = async (
    actionName: string,
    prepare: () => Promise<PreparedPayload>,
    successMessage: (txHash: string | null) => string,
    onSuccess?: (txHash: string | null) => void
  ) => {
    setActiveAction(actionName);

    try {
      if (!connected) {
        throw new Error("Please connect your wallet before using LPT.");
      }

      const payload = await prepare();
      const txHash = await submitPreparedPayload(payload);
      onSuccess?.(txHash);
      showSuccess(successMessage(txHash));
    } catch (error) {
      console.error(`${actionName} failed:`, error);
      const message = error instanceof Error ? error.message : "LPT transaction failed.";

      if (message.toLowerCase().includes("rejected")) {
        showError("Transaction cancelled by wallet.");
      } else {
        showError(message);
      }
    } finally {
      setActiveAction(null);
    }
  };

  const claimSignupReward = () => {
    if (signupRewardClaimed) {
      showError("Signup reward has already been claimed for this wallet.");
      return;
    }

    runTokenAction(
      "claim-signup",
      () => prepareTokenAction("/api/tokens/claim-signup/prepare"),
      (txHash) => `Signup reward claimed${txHash ? `: ${txHash.slice(0, 10)}...` : "."}`,
      () => {
        if (signupClaimStorageKey) {
          localStorage.setItem(signupClaimStorageKey, "true");
        }
        setSignupRewardClaimed(true);
      }
    );
  };

  const sendLpt = () => {
    if (!isValidWalletAddress(recipientAddress)) {
      showError("Enter a valid recipient wallet address.");
      return;
    }

    if (!isPositiveInteger(transferAmount)) {
      showError("Enter a positive whole-number LPT amount.");
      return;
    }

    runTokenAction(
      "transfer",
      () =>
        prepareTokenAction("/api/tokens/transfer/prepare", {
          recipientAddress,
          amount: transferAmount,
        }),
      (txHash) => `LPT sent${txHash ? `: ${txHash.slice(0, 10)}...` : "."}`
    );
  };

  const burnForService = () => {
    if (!isPositiveInteger(serviceAmount)) {
      showError("Enter a positive whole-number service amount.");
      return;
    }

    runTokenAction(
      "burn-service",
      () =>
        prepareTokenAction("/api/tokens/burn-for-service/prepare", {
          amount: serviceAmount,
        }),
      (txHash) =>
        `${serviceLabel} paid with ${serviceAmount} LPT${txHash ? `: ${txHash.slice(0, 10)}...` : "."}`
    );
  };

  const actionButtonLabel = (actionName: string, idleLabel: string) => {
    return activeAction === actionName ? (
      <>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Processing...
      </>
    ) : (
      idleLabel
    );
  };

  const isBusy = Boolean(activeAction) || isLoading;

  return (
    <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
      <CardHeader>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="text-2xl flex items-center">
              <Wallet className="mr-3 h-6 w-6 text-emerald-600" />
              LuxPass Token Flow
            </CardTitle>
            <CardDescription>
              Claim LPT, send it to another wallet, and spend it on passport services.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshTokenData(true)}
            disabled={isLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-white/70 p-4">
            <p className="text-sm text-gray-500">Your Balance</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{balance} LPT</p>
            <p className="mt-2 text-xs text-gray-500 font-mono">{shortenAddress(walletAddress)}</p>
          </div>
          <div className="rounded-lg border bg-white/70 p-4">
            <p className="text-sm text-gray-500">Token Status</p>
            <div className="mt-3">
              <Badge className={status?.initialised ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                {status === null ? "Checking" : status.initialised ? "Initialised" : "Not initialised"}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-gray-500">Admin: {shortenAddress(status?.adminAddress)}</p>
          </div>
          <div className="rounded-lg border bg-white/70 p-4">
            <p className="text-sm text-gray-500">Rewards</p>
            <p className="mt-2 text-lg font-semibold text-gray-900">
              Signup: {rewardConfig?.signupReward ?? "-"} LPT
            </p>
            <p className="text-sm text-gray-600">
              Referral: {rewardConfig?.referralReward ?? "-"} LPT
            </p>
          </div>
        </div>

        <Separator />

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border bg-white/70 p-4">
            <div className="mb-4 flex items-center">
              <Gift className="mr-2 h-5 w-5 text-emerald-600" />
              <div>
                <h3 className="font-semibold">Signup Reward</h3>
                <p className="text-sm text-gray-600">Mint starter LPT into your wallet.</p>
              </div>
            </div>
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              onClick={claimSignupReward}
              disabled={isBusy || !accessToken || !connected || signupRewardClaimed}
            >
              {signupRewardClaimed
                ? "Signup Reward Claimed"
                : actionButtonLabel("claim-signup", "Claim Signup Reward")}
            </Button>
          </div>

          <div className="rounded-lg border bg-white/70 p-4">
            <div className="mb-4 flex items-center">
              <Send className="mr-2 h-5 w-5 text-blue-600" />
              <div>
                <h3 className="font-semibold">P2P Transfer</h3>
                <p className="text-sm text-gray-600">Send LPT to another wallet.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label htmlFor="lptRecipient">Recipient Wallet</Label>
                <Input
                  id="lptRecipient"
                  placeholder="0x..."
                  value={recipientAddress}
                  onChange={(event) => setRecipientAddress(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="lptTransferAmount">Amount</Label>
                <Input
                  id="lptTransferAmount"
                  inputMode="numeric"
                  value={transferAmount}
                  onChange={(event) => setTransferAmount(event.target.value)}
                />
              </div>
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={sendLpt}
                disabled={isBusy || !accessToken || !connected}
              >
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                {actionButtonLabel("transfer", "Send LPT")}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border bg-white/70 p-4">
            <div className="mb-4 flex items-center">
              <Flame className="mr-2 h-5 w-5 text-orange-600" />
              <div>
                <h3 className="font-semibold">Passport Service</h3>
                <p className="text-sm text-gray-600">Burn LPT to pay for a passport service.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label htmlFor="lptService">Service</Label>
                <select
                  id="lptService"
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
                <Label htmlFor="lptServiceAmount">Cost</Label>
                <Input
                  id="lptServiceAmount"
                  inputMode="numeric"
                  value={serviceAmount}
                  onChange={(event) => setServiceAmount(event.target.value)}
                />
              </div>
              <Button
                className="w-full bg-orange-600 hover:bg-orange-700"
                onClick={burnForService}
                disabled={isBusy || !accessToken || !connected}
              >
                <Flame className="mr-2 h-4 w-4" />
                {actionButtonLabel("burn-service", "Pay With LPT")}
              </Button>
            </div>
          </div>
        </div>

        {lastTxHash && (
          <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
            Last LPT transaction: <span className="font-mono">{lastTxHash}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
