import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { ArrowRightLeft, Coins, Flame, Gift, Landmark, Loader2, RefreshCw, Send, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { showError, showSuccess } from "@/utils/toast";

const API_BASE_URL = "http://localhost:3001";
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

type LptPanelProps = {
  mode?: "user" | "admin";
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

export function LptPanel({ mode = "user" }: LptPanelProps) {
  const { accessToken, user } = useAuth();
  const { account, connected, signAndSubmitTransaction } = useWallet();
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [balance, setBalance] = useState<string>("0");
  const [totalSupply, setTotalSupply] = useState<string>("0");
  const [subsidyPoolBalance, setSubsidyPoolBalance] = useState<string>("0");
  const [tokenAdminAddress, setTokenAdminAddress] = useState<string | null>(null);
  const [rewardConfig, setRewardConfig] = useState<RewardConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [transferAmount, setTransferAmount] = useState("1");
  const [referrerAddress, setReferrerAddress] = useState("");
  const [burnAmount, setBurnAmount] = useState("1");
  const [depositAmount, setDepositAmount] = useState("1");
  const [feeAmount, setFeeAmount] = useState("1");
  const [initSignupReward, setInitSignupReward] = useState("10");
  const [initReferralReward, setInitReferralReward] = useState("7");
  const [mintRecipientAddress, setMintRecipientAddress] = useState("");
  const [mintAmount, setMintAmount] = useState("10");
  const [fiatBuyerAddress, setFiatBuyerAddress] = useState("");
  const [fiatAmount, setFiatAmount] = useState("25");
  const [allocateRecipientAddress, setAllocateRecipientAddress] = useState("");
  const [allocateAmount, setAllocateAmount] = useState("5");
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [signupRewardClaimed, setSignupRewardClaimed] = useState(false);
  const [isRewardDialogOpen, setIsRewardDialogOpen] = useState(false);

  const walletAddress = useMemo(() => {
    return user?.walletAddress || getWalletAddress(account);
  }, [account, user?.walletAddress]);

  const isAdmin = user?.role === "ADMIN";
  const showUserActions = mode === "user";
  const showAdminActions = mode === "admin" && isAdmin;

  const authHeaders = useMemo(() => {
    return {
      Authorization: `Bearer ${accessToken}`,
    };
  }, [accessToken]);

  const signupClaimStorageKey = useMemo(() => {
    return walletAddress ? `${SIGNUP_CLAIM_STORAGE_PREFIX}${walletAddress.toLowerCase()}` : "";
  }, [walletAddress]);

  const platformFeeTreasuryAddress = tokenAdminAddress || status?.adminAddress || "";

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
        const [
          balanceData,
          rewardData,
          signupClaimedData,
          supplyData,
          poolData,
          adminData,
        ] = await Promise.all([
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
          fetchJson<{ success: boolean; totalSupply: string }>(
            `${API_BASE_URL}/api/tokens/supply`,
            { headers: authHeaders }
          ),
          fetchJson<{ success: boolean; subsidyPoolBalance: string }>(
            `${API_BASE_URL}/api/tokens/pool`,
            { headers: authHeaders }
          ),
          fetchJson<{ success: boolean; adminAddress: string }>(
            `${API_BASE_URL}/api/tokens/admin`,
            { headers: authHeaders }
          ),
        ]);

        setBalance(String(balanceData.balance ?? "0"));
        setRewardConfig(rewardData);
        setTotalSupply(String(supplyData.totalSupply ?? "0"));
        setSubsidyPoolBalance(String(poolData.subsidyPoolBalance ?? "0"));
        setTokenAdminAddress(adminData.adminAddress ?? null);
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
        setTotalSupply("0");
        setSubsidyPoolBalance("0");
        setTokenAdminAddress(null);
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

  const validateAmount = (amount: string, label = "amount") => {
    if (!isPositiveInteger(amount)) {
      showError(`Enter a positive whole-number ${label}.`);
      return false;
    }

    return true;
  };

  const validateAddress = (address: string, label: string) => {
    if (!isValidWalletAddress(address)) {
      showError(`Enter a valid ${label} wallet address.`);
      return false;
    }

    return true;
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
        setIsRewardDialogOpen(false);
      }
    );
  };

  const sendLpt = () => {
    if (!validateAddress(recipientAddress, "recipient") || !validateAmount(transferAmount)) {
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

  const claimReferralReward = () => {
    if (!validateAddress(referrerAddress, "referrer")) {
      return;
    }

    if (walletAddress && referrerAddress.toLowerCase() === walletAddress.toLowerCase()) {
      showError("Referral reward needs a different referrer wallet.");
      return;
    }

    runTokenAction(
      "claim-referral",
      () => prepareTokenAction("/api/tokens/claim-referral/prepare", { referrerAddress }),
      (txHash) => `Referral reward claimed${txHash ? `: ${txHash.slice(0, 10)}...` : "."}`,
      () => setIsRewardDialogOpen(false)
    );
  };

  const burnLpt = () => {
    if (!validateAmount(burnAmount)) {
      return;
    }

    runTokenAction(
      "burn",
      () => prepareTokenAction("/api/tokens/burn/prepare", { amount: burnAmount }),
      (txHash) => `LPT burned${txHash ? `: ${txHash.slice(0, 10)}...` : "."}`
    );
  };

  const depositToPool = () => {
    if (!validateAmount(depositAmount)) {
      return;
    }

    runTokenAction(
      "deposit",
      () => prepareTokenAction("/api/tokens/deposit/prepare", { amount: depositAmount }),
      (txHash) => `LPT deposited${txHash ? `: ${txHash.slice(0, 10)}...` : "."}`
    );
  };

  const payPlatformFee = () => {
    if (!validateAddress(platformFeeTreasuryAddress, "platform fee treasury") || !validateAmount(feeAmount)) {
      return;
    }

    runTokenAction(
      "pay-fee",
      () =>
        prepareTokenAction("/api/tokens/pay-fee/prepare", {
          treasuryAddress: platformFeeTreasuryAddress,
          amount: feeAmount,
        }),
      (txHash) => `Platform fee paid${txHash ? `: ${txHash.slice(0, 10)}...` : "."}`
    );
  };

  const initialiseLpt = () => {
    if (!validateAmount(initSignupReward, "signup reward") || !validateAmount(initReferralReward, "referral reward")) {
      return;
    }

    runTokenAction(
      "init",
      () =>
        prepareTokenAction("/api/tokens/init/prepare", {
          signupRewardAmount: initSignupReward,
          referralRewardAmount: initReferralReward,
        }),
      (txHash) => `LPT initialised${txHash ? `: ${txHash.slice(0, 10)}...` : "."}`
    );
  };

  const mintLpt = () => {
    if (!validateAddress(mintRecipientAddress, "recipient") || !validateAmount(mintAmount)) {
      return;
    }

    runTokenAction(
      "mint",
      () =>
        prepareTokenAction("/api/tokens/mint/prepare", {
          recipientAddress: mintRecipientAddress,
          amount: mintAmount,
        }),
      (txHash) => `LPT minted${txHash ? `: ${txHash.slice(0, 10)}...` : "."}`
    );
  };

  const creditFiatPurchase = () => {
    if (!validateAddress(fiatBuyerAddress, "buyer") || !validateAmount(fiatAmount)) {
      return;
    }

    runTokenAction(
      "credit-fiat",
      () =>
        prepareTokenAction("/api/tokens/credit-fiat/prepare", {
          buyerAddress: fiatBuyerAddress,
          amount: fiatAmount,
        }),
      (txHash) => `Fiat purchase credited${txHash ? `: ${txHash.slice(0, 10)}...` : "."}`
    );
  };

  const allocateSubsidy = () => {
    if (!validateAddress(allocateRecipientAddress, "recipient") || !validateAmount(allocateAmount)) {
      return;
    }

    runTokenAction(
      "allocate",
      () =>
        prepareTokenAction("/api/tokens/allocate/prepare", {
          recipientAddress: allocateRecipientAddress,
          amount: allocateAmount,
        }),
      (txHash) => `Subsidy allocated${txHash ? `: ${txHash.slice(0, 10)}...` : "."}`
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
              Claim, transfer, spend, and administer LPT across the LuxPass demo.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {showUserActions && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setIsRewardDialogOpen(true)}
                disabled={isBusy || !accessToken || !connected}
              >
                <Gift className="mr-2 h-4 w-4" />
                Rewards
              </Button>
            )}
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
            <p className="text-sm text-gray-500">Total Supply</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{totalSupply}</p>
            <p className="mt-2 text-xs text-gray-500">Platform-wide LPT minted</p>
          </div>
          <div className="rounded-lg border bg-white/70 p-4">
            <p className="text-sm text-gray-500">Subsidy Pool</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{subsidyPoolBalance}</p>
            <p className="mt-2 text-xs text-gray-500">Available for admin allocation</p>
          </div>
        </div>

        {showUserActions && (
          <>
            <Separator />

            <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border bg-white/70 p-4">
            <div className="mb-4 flex items-center">
              <Send className="mr-2 h-5 w-5 text-blue-600" />
              <div>
                <h3 className="font-semibold">P2P Transfer</h3>
                <p className="text-sm text-gray-600">Send LPT to another wallet.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[1fr_120px]">
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
              <Landmark className="mr-2 h-5 w-5 text-cyan-700" />
              <div>
                <h3 className="font-semibold">Platform Fee</h3>
                <p className="text-sm text-gray-600">Transfer LPT to a treasury wallet as a platform fee.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label htmlFor="lptFeeAmount">Amount</Label>
                <Input
                  id="lptFeeAmount"
                  inputMode="numeric"
                  value={feeAmount}
                  onChange={(event) => setFeeAmount(event.target.value)}
                />
              </div>
              <Button
                className="w-full bg-cyan-700 hover:bg-cyan-800"
                onClick={payPlatformFee}
                disabled={isBusy || !accessToken || !connected}
              >
                {actionButtonLabel("pay-fee", "Pay Platform Fee")}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border bg-white/70 p-4">
            <div className="mb-4 flex items-center">
              <Coins className="mr-2 h-5 w-5 text-indigo-600" />
              <div>
                <h3 className="font-semibold">Subsidy Pool Deposit</h3>
                <p className="text-sm text-gray-600">Deposit LPT to support subsidised platform actions.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label htmlFor="lptDepositAmount">Amount</Label>
                <Input
                  id="lptDepositAmount"
                  inputMode="numeric"
                  value={depositAmount}
                  onChange={(event) => setDepositAmount(event.target.value)}
                />
              </div>
              <Button
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                onClick={depositToPool}
                disabled={isBusy || !accessToken || !connected}
              >
                {actionButtonLabel("deposit", "Deposit to Pool")}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border bg-white/70 p-4">
            <div className="mb-4 flex items-center">
              <Flame className="mr-2 h-5 w-5 text-red-600" />
              <div>
                <h3 className="font-semibold">Retire LPT</h3>
                <p className="text-sm text-gray-600">Burn LPT outside the passport-service flow.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label htmlFor="lptBurnAmount">Amount</Label>
                <Input
                  id="lptBurnAmount"
                  inputMode="numeric"
                  value={burnAmount}
                  onChange={(event) => setBurnAmount(event.target.value)}
                />
              </div>
              <Button
                variant="destructive"
                className="w-full"
                onClick={burnLpt}
                disabled={isBusy || !accessToken || !connected}
              >
                {actionButtonLabel("burn", "Burn LPT")}
              </Button>
            </div>
          </div>

            </div>
          </>
        )}

        <Dialog open={isRewardDialogOpen} onOpenChange={setIsRewardDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <Gift className="mr-2 h-5 w-5 text-emerald-600" />
                LPT Rewards
              </DialogTitle>
              <DialogDescription>
                Claim the reward that matches your LuxPass activity.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Signup Reward</h3>
                    <p className="text-sm text-gray-600">Mint starter LPT into your wallet.</p>
                  </div>
                  <Badge variant="outline">{rewardConfig?.signupReward ?? "-"} LPT</Badge>
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

              <div className="rounded-lg border p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Referral Reward</h3>
                    <p className="text-sm text-gray-600">Reward you and the wallet that referred you.</p>
                  </div>
                  <Badge variant="outline">{rewardConfig?.referralReward ?? "-"} LPT</Badge>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="lptReferrer">Referrer Wallet</Label>
                    <Input
                      id="lptReferrer"
                      placeholder="0x..."
                      value={referrerAddress}
                      onChange={(event) => setReferrerAddress(event.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full bg-teal-600 hover:bg-teal-700"
                    onClick={claimReferralReward}
                    disabled={isBusy || !accessToken || !connected}
                  >
                    {actionButtonLabel("claim-referral", "Claim Referral Reward")}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {showAdminActions && (
          <>
            <Separator />

            <div>
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Admin Token Controls</h3>
                <p className="text-sm text-gray-600">
                  Use the admin wallet for LPT initialisation, manual minting, fiat credits, and subsidy allocation.
                </p>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {!status?.initialised && (
                  <div className="rounded-lg border bg-white/70 p-4">
                    <h4 className="font-semibold">Initialise LPT</h4>
                    <p className="text-sm text-gray-600">Create the LPT state and reward settings.</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div>
                        <Label htmlFor="lptInitSignup">Signup Reward</Label>
                        <Input
                          id="lptInitSignup"
                          inputMode="numeric"
                          value={initSignupReward}
                          onChange={(event) => setInitSignupReward(event.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="lptInitReferral">Referral Reward</Label>
                        <Input
                          id="lptInitReferral"
                          inputMode="numeric"
                          value={initReferralReward}
                          onChange={(event) => setInitReferralReward(event.target.value)}
                        />
                      </div>
                    </div>
                    <Button
                      className="mt-4 w-full"
                      onClick={initialiseLpt}
                      disabled={isBusy || !accessToken || !connected}
                    >
                      {actionButtonLabel("init", "Initialise LPT")}
                    </Button>
                  </div>
                )}

                <div className="rounded-lg border bg-white/70 p-4">
                  <h4 className="font-semibold">Manual Mint</h4>
                  <p className="text-sm text-gray-600">Mint LPT directly to a wallet.</p>
                  <div className="mt-4 space-y-3">
                    <div>
                      <Label htmlFor="lptMintRecipient">Recipient Wallet</Label>
                      <Input
                        id="lptMintRecipient"
                        placeholder="0x..."
                        value={mintRecipientAddress}
                        onChange={(event) => setMintRecipientAddress(event.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="lptMintAmount">Amount</Label>
                      <Input
                        id="lptMintAmount"
                        inputMode="numeric"
                        value={mintAmount}
                        onChange={(event) => setMintAmount(event.target.value)}
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={mintLpt}
                      disabled={isBusy || !accessToken || !connected}
                    >
                      {actionButtonLabel("mint", "Mint LPT")}
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border bg-white/70 p-4">
                  <h4 className="font-semibold">Credit Fiat Purchase</h4>
                  <p className="text-sm text-gray-600">Credit LPT after an off-chain payment.</p>
                  <div className="mt-4 space-y-3">
                    <div>
                      <Label htmlFor="lptFiatBuyer">Buyer Wallet</Label>
                      <Input
                        id="lptFiatBuyer"
                        placeholder="0x..."
                        value={fiatBuyerAddress}
                        onChange={(event) => setFiatBuyerAddress(event.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="lptFiatAmount">Amount</Label>
                      <Input
                        id="lptFiatAmount"
                        inputMode="numeric"
                        value={fiatAmount}
                        onChange={(event) => setFiatAmount(event.target.value)}
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={creditFiatPurchase}
                      disabled={isBusy || !accessToken || !connected}
                    >
                      {actionButtonLabel("credit-fiat", "Credit Purchase")}
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border bg-white/70 p-4">
                  <h4 className="font-semibold">Allocate Subsidy</h4>
                  <p className="text-sm text-gray-600">Move LPT from the subsidy pool to a recipient wallet.</p>
                  <div className="mt-4 space-y-3">
                    <div>
                      <Label htmlFor="lptAllocateRecipient">Recipient Wallet</Label>
                      <Input
                        id="lptAllocateRecipient"
                        placeholder="0x..."
                        value={allocateRecipientAddress}
                        onChange={(event) => setAllocateRecipientAddress(event.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="lptAllocateAmount">Amount</Label>
                      <Input
                        id="lptAllocateAmount"
                        inputMode="numeric"
                        value={allocateAmount}
                        onChange={(event) => setAllocateAmount(event.target.value)}
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={allocateSubsidy}
                      disabled={isBusy || !accessToken || !connected}
                    >
                      {actionButtonLabel("allocate", "Allocate Subsidy")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {lastTxHash && (
          <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
            Last LPT transaction: <span className="font-mono">{lastTxHash}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
