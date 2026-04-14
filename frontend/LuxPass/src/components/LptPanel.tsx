import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import {
  ArrowRightLeft,
  CreditCard,
  Gift,
  Loader2,
  RefreshCw,
  ScrollText,
  Send,
  Wallet,
} from "lucide-react";
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

type AptPurchasePrepareResponse = PrepareResponse & {
  buyerAddress?: string;
  treasuryAddress?: string;
  lptAmount?: string;
  aptAmountOctas?: string;
  priceOctasPerLpt?: string;
};

type AptPurchaseCompleteResponse = {
  success: boolean;
  buyerAddress?: string;
  lptAmount?: string;
  aptAmountOctas?: string;
  priceOctasPerLpt?: string;
  treasuryAddress?: string;
  paymentTransactionHash?: string;
  creditTransactionHash?: string;
  creditVmStatus?: string;
  error?: string;
};

type AptPurchaseRateResponse = {
  success: boolean;
  priceOctasPerLpt?: string;
  treasuryAddress?: string;
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

type LptEventFeedItem = {
  tag: string;
  source: string;
  version: string;
  sequenceNumber: string;
  eventType: string | null;
  data: Record<string, unknown>;
  transactionVersion: string | null;
  /** ISO 8601 UTC from chain transaction timestamp when resolved. */
  occurredAt: string | null;
};

type LptEventFeedResponse = {
  success: boolean;
  items?: LptEventFeedItem[];
  maxItems?: number;
  perSourceLimit?: number;
  viewerWalletAddress?: string;
  error?: string;
};

type LptPanelProps = {
  mode?: "user" | "admin" | "issuer";
  refreshKey?: number;
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

function strField(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

/** Match backend canonical Aptos account hex for comparisons. */
function normalizeAptosAddress(address: string): string {
  const normalized = address.trim().toLowerCase();
  if (!normalized.startsWith("0x")) {
    return normalized;
  }
  const hex = normalized.slice(2).replace(/^0+/, "");
  return `0x${hex || "0"}`;
}

function dataAddr(data: Record<string, unknown>, key: string): string {
  const raw = data[key];
  if (raw === undefined || raw === null) {
    return "";
  }
  const s = String(raw).trim();
  if (!s) {
    return "";
  }
  return normalizeAptosAddress(s);
}

type LptFlowDirection = "in" | "out" | "neutral";

function getLptEventAmountDisplay(item: LptEventFeedItem): string {
  const d = item.data;
  let n = strField(d, "amount");
  if (!n && item.tag === "LPT_REFERRAL_REWARD") {
    n = strField(d, "amount_each");
  }
  if (!n) {
    return "—";
  }
  return `${n} LPT`;
}

function getLptActivityDirection(item: LptEventFeedItem, viewer: string): LptFlowDirection {
  if (!viewer) {
    return "neutral";
  }
  const v = viewer;
  const d = item.data;

  switch (item.tag) {
    case "LPT_MINT":
    case "LPT_SIGNUP_REWARD":
    case "LPT_FIAT_CREDIT":
      return "in";
    case "LPT_REFERRAL_REWARD":
      return "in";
    case "LPT_BURN":
      return "out";
    case "LPT_PASSPORT_SERVICE":
      return "out";
    case "LPT_TRANSFER": {
      const from = dataAddr(d, "from");
      const to = dataAddr(d, "to");
      if (from === v && to === v) {
        return "neutral";
      }
      if (to === v) {
        return "in";
      }
      if (from === v) {
        return "out";
      }
      return "neutral";
    }
    case "LPT_PLATFORM_FEE":
      return dataAddr(d, "payer") === v ? "out" : dataAddr(d, "treasury") === v ? "in" : "neutral";
    case "LPT_SUBSIDY": {
      const kind = strField(d, "kind");
      const acct = dataAddr(d, "account");
      if (kind === "0") {
        return acct === v ? "out" : "neutral";
      }
      if (kind === "1") {
        return acct === v ? "in" : "neutral";
      }
      return "neutral";
    }
    default:
      return "neutral";
  }
}

function getLptActivityFlowDescription(item: LptEventFeedItem, viewer: string): string {
  const v = viewer;
  const d = item.data;

  switch (item.tag) {
    case "LPT_MINT": {
      const sub = formatMintSubtag(d);
      return sub ? `Mint · ${sub}` : "Mint · credited to your wallet";
    }
    case "LPT_BURN":
      return "Burned from your balance";
    case "LPT_TRANSFER": {
      const from = dataAddr(d, "from");
      const to = dataAddr(d, "to");
      if (from === v && to === v) {
        return "Transfer within your wallet";
      }
      if (to === v) {
        return `Received from ${shortenAddress(strField(d, "from"))}`;
      }
      if (from === v) {
        return `Sent to ${shortenAddress(strField(d, "to"))}`;
      }
      return `${shortenAddress(strField(d, "from"))} → ${shortenAddress(strField(d, "to"))}`;
    }
    case "LPT_SIGNUP_REWARD":
      return "Signup reward";
    case "LPT_REFERRAL_REWARD": {
      if (dataAddr(d, "referrer") === v) {
        return `Referral credit · referee ${shortenAddress(strField(d, "referee"))}`;
      }
      if (dataAddr(d, "referee") === v) {
        return `Referral credit · referrer ${shortenAddress(strField(d, "referrer"))}`;
      }
      return `Referrer ${shortenAddress(strField(d, "referrer"))} · referee ${shortenAddress(strField(d, "referee"))}`;
    }
    case "LPT_FIAT_CREDIT":
      return "Purchase / fiat credit to your wallet";
    case "LPT_PLATFORM_FEE": {
      if (dataAddr(d, "payer") === v) {
        return `Platform fee · treasury ${shortenAddress(strField(d, "treasury"))}`;
      }
      if (dataAddr(d, "treasury") === v) {
        return `Platform fee received · from ${shortenAddress(strField(d, "payer"))}`;
      }
      return `${shortenAddress(strField(d, "payer"))} → treasury ${shortenAddress(strField(d, "treasury"))}`;
    }
    case "LPT_PASSPORT_SERVICE":
      return "Passport service (LPT burn) · your issuer wallet";
    case "LPT_SUBSIDY": {
      const kind = strField(d, "kind");
      if (kind === "0") {
        return "Subsidy pool deposit (from your wallet)";
      }
      if (kind === "1") {
        return "Subsidy allocation to your wallet";
      }
      return `Subsidy · account ${shortenAddress(strField(d, "account"))}`;
    }
    default:
      return "";
  }
}

function amountTextClass(direction: LptFlowDirection): string {
  switch (direction) {
    case "in":
      return "font-semibold tabular-nums text-green-600";
    case "out":
      return "font-semibold tabular-nums text-red-600";
    default:
      return "font-semibold tabular-nums text-gray-700";
  }
}

function lptEventBadgeClass(tag: string): string {
  switch (tag) {
    case "LPT_MINT":
      return "bg-emerald-100 text-emerald-900 border-emerald-200";
    case "LPT_BURN":
    case "LPT_PASSPORT_SERVICE":
      return "bg-orange-100 text-orange-900 border-orange-200";
    case "LPT_TRANSFER":
      return "bg-blue-100 text-blue-900 border-blue-200";
    case "LPT_PLATFORM_FEE":
      return "bg-violet-100 text-violet-900 border-violet-200";
    case "LPT_SIGNUP_REWARD":
    case "LPT_REFERRAL_REWARD":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "LPT_FIAT_CREDIT":
      return "bg-cyan-100 text-cyan-900 border-cyan-200";
    case "LPT_SUBSIDY":
      return "bg-slate-100 text-slate-900 border-slate-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

function formatLptEventLocalDateTime(isoUtc: string | null | undefined): string {
  if (!isoUtc) {
    return "Time pending";
  }
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) {
    return "Time pending";
  }
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatMintSubtag(data: Record<string, unknown>): string | null {
  const t = strField(data, "tag");
  if (!t) {
    return null;
  }
  const map: Record<string, string> = {
    "0": "admin mint",
    "1": "signup",
    "2": "referral",
    "3": "fiat",
  };
  return map[t] ?? `mint tag ${t}`;
}

function formatAptFromOctas(octas?: string): string {
  if (!octas || !/^\d+$/.test(octas)) {
    return "-";
  }

  const value = BigInt(octas);
  const whole = value / 100000000n;
  const fraction = (value % 100000000n).toString().padStart(8, "0").replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : whole.toString();
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

export function LptPanel({ mode = "user", refreshKey = 0 }: LptPanelProps) {
  const { accessToken, user } = useAuth();
  const { account, connected, signAndSubmitTransaction } = useWallet();
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [balance, setBalance] = useState<string>("0");
  const [totalSupply, setTotalSupply] = useState<string>("0");
  const [tokenAdminAddress, setTokenAdminAddress] = useState<string | null>(null);
  const [rewardConfig, setRewardConfig] = useState<RewardConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [transferAmount, setTransferAmount] = useState("1");
  const [aptPurchaseAmount, setAptPurchaseAmount] = useState("10");
  const [aptPurchaseQuote, setAptPurchaseQuote] = useState<AptPurchasePrepareResponse | null>(null);
  const [aptPurchaseRateOctas, setAptPurchaseRateOctas] = useState<string | null>(null);
  const [referrerAddress, setReferrerAddress] = useState("");
  const [initSignupReward, setInitSignupReward] = useState("10");
  const [initReferralReward, setInitReferralReward] = useState("7");
  const [mintRecipientAddress, setMintRecipientAddress] = useState("");
  const [mintAmount, setMintAmount] = useState("10");
  const [fiatBuyerAddress, setFiatBuyerAddress] = useState("");
  const [fiatAmount, setFiatAmount] = useState("25");
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [signupRewardClaimed, setSignupRewardClaimed] = useState(false);
  const [isRewardDialogOpen, setIsRewardDialogOpen] = useState(false);
  const [lptEvents, setLptEvents] = useState<LptEventFeedItem[]>([]);
  const [lptEventsLoading, setLptEventsLoading] = useState(false);
  const [lptEventsError, setLptEventsError] = useState<string | null>(null);
  /** Canonical 0x address used to classify in/out flows (from API when available). */
  const [lptEventViewerCanon, setLptEventViewerCanon] = useState("");

  const walletAddress = useMemo(() => {
    return user?.walletAddress || getWalletAddress(account);
  }, [account, user?.walletAddress]);
  const connectedWalletAddress = useMemo(() => getWalletAddress(account), [account]);

  const isAdmin = user?.role === "ADMIN";
  const showUserActions = mode === "user";
  const showPurchaseActions = mode === "user" || mode === "issuer";
  const showAdminActions = mode === "admin" && isAdmin;

  const authHeaders = useMemo(() => {
    return {
      Authorization: `Bearer ${accessToken}`,
    };
  }, [accessToken]);

  const signupClaimStorageKey = useMemo(() => {
    return walletAddress ? `${SIGNUP_CLAIM_STORAGE_PREFIX}${walletAddress.toLowerCase()}` : "";
  }, [walletAddress]);

  const lptActivityViewer = useMemo(
    () => lptEventViewerCanon || normalizeAptosAddress(walletAddress || ""),
    [lptEventViewerCanon, walletAddress]
  );

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

      if (mode === "issuer") {
        if (accessToken && walletAddress) {
          const balanceData = await fetchJson<{
            success: boolean;
            balance: string;
            ownerAddress: string;
          }>(
            `${API_BASE_URL}/api/tokens/balance/${encodeURIComponent(walletAddress)}`,
            { headers: authHeaders }
          );
          setBalance(String(balanceData.balance ?? "0"));
        } else {
          setBalance("0");
        }

        setRewardConfig(null);
        setTotalSupply("0");
        setTokenAdminAddress(null);
        setSignupRewardClaimed(false);

        if (showToast) {
          showSuccess("LPT data refreshed.");
        }
        return;
      }

      if (accessToken && walletAddress) {
        const [
          balanceData,
          rewardData,
          signupClaimedData,
          supplyData,
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
          fetchJson<{ success: boolean; adminAddress: string }>(
            `${API_BASE_URL}/api/tokens/admin`,
            { headers: authHeaders }
          ),
        ]);

        setBalance(String(balanceData.balance ?? "0"));
        setRewardConfig(rewardData);
        setTotalSupply(String(supplyData.totalSupply ?? "0"));
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
        setTokenAdminAddress(null);
        setSignupRewardClaimed(false);
      }

      if (showUserActions && accessToken) {
        setLptEventsLoading(true);
        setLptEventsError(null);
        try {
          const feed = await fetchJson<LptEventFeedResponse>(
            `${API_BASE_URL}/api/tokens/events?limit=100`,
            { headers: authHeaders }
          );
          setLptEvents(Array.isArray(feed.items) ? feed.items : []);
          setLptEventViewerCanon(
            normalizeAptosAddress(feed.viewerWalletAddress || walletAddress || "")
          );
        } catch (eventError) {
          console.error("LPT event feed failed:", eventError);
          setLptEvents([]);
          setLptEventViewerCanon("");
          setLptEventsError(eventError instanceof Error ? eventError.message : "Could not load LPT activity.");
        } finally {
          setLptEventsLoading(false);
        }
      } else {
        setLptEvents([]);
        setLptEventViewerCanon("");
        setLptEventsError(null);
        setLptEventsLoading(false);
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
  }, [accessToken, walletAddress, refreshKey]);

  useEffect(() => {
    if (!signupClaimStorageKey) {
      setSignupRewardClaimed(false);
      return;
    }

    setSignupRewardClaimed(localStorage.getItem(signupClaimStorageKey) === "true");
  }, [signupClaimStorageKey]);

  useEffect(() => {
    if (!showPurchaseActions || !accessToken || !isPositiveInteger(aptPurchaseAmount)) {
      setAptPurchaseQuote(null);
      return;
    }

    let shouldIgnore = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const prepared = await fetchJson<AptPurchasePrepareResponse>(
          `${API_BASE_URL}/api/tokens/purchase-apt/prepare`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...authHeaders,
            },
            body: JSON.stringify({ lptAmount: aptPurchaseAmount }),
          }
        );

        if (!shouldIgnore && prepared.success) {
          setAptPurchaseQuote(prepared);
          if (prepared.priceOctasPerLpt) {
            setAptPurchaseRateOctas(String(prepared.priceOctasPerLpt));
          }
        }
      } catch (error) {
        if (!shouldIgnore) {
          console.error("APT purchase quote failed:", error);
          setAptPurchaseQuote(null);
        }
      }
    }, 350);

    return () => {
      shouldIgnore = true;
      window.clearTimeout(timeoutId);
    };
  }, [accessToken, aptPurchaseAmount, authHeaders, showPurchaseActions]);

  useEffect(() => {
    if (!showPurchaseActions) {
      setAptPurchaseRateOctas(null);
      return;
    }

    let shouldIgnore = false;

    const fetchAptPurchaseRate = async () => {
      try {
        const rate = await fetchJson<AptPurchaseRateResponse>(
          `${API_BASE_URL}/api/tokens/purchase-apt/rate`
        );

        if (!shouldIgnore && rate.success && rate.priceOctasPerLpt) {
          setAptPurchaseRateOctas(String(rate.priceOctasPerLpt));
        }
      } catch (error) {
        if (!shouldIgnore) {
          console.error("APT purchase rate failed:", error);
          setAptPurchaseRateOctas(null);
        }
      }
    };

    fetchAptPurchaseRate();

    return () => {
      shouldIgnore = true;
    };
  }, [showPurchaseActions]);

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

    const txHash =
      (tx as { hash?: string; transactionHash?: string }).hash ??
      (tx as { hash?: string; transactionHash?: string }).transactionHash ??
      null;
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

  const buyLptWithApt = async () => {
    if (!validateAmount(aptPurchaseAmount, "LPT amount")) {
      return;
    }

    setActiveAction("purchase-apt");

    try {
      if (!accessToken) {
        throw new Error("Please login before buying LPT.");
      }

      if (!connected) {
        throw new Error("Please connect your wallet before buying LPT.");
      }

      if (
        user?.walletAddress &&
        connectedWalletAddress &&
        user.walletAddress.toLowerCase() !== connectedWalletAddress.toLowerCase()
      ) {
        throw new Error("Connected wallet must match the wallet you logged in with.");
      }

      const prepared = await fetchJson<AptPurchasePrepareResponse>(
        `${API_BASE_URL}/api/tokens/purchase-apt/prepare`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
          },
          body: JSON.stringify({ lptAmount: aptPurchaseAmount }),
        }
      );

      if (!prepared.success || !prepared.payload) {
        throw new Error(prepared.error || "APT purchase could not be prepared.");
      }

      setAptPurchaseQuote(prepared);

      const paymentTxHash = await submitPreparedPayload(prepared.payload);
      if (!paymentTxHash) {
        throw new Error("Wallet did not return a payment transaction hash.");
      }

      const completed = await fetchJson<AptPurchaseCompleteResponse>(
        `${API_BASE_URL}/api/tokens/purchase-apt/complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
          },
          body: JSON.stringify({
            lptAmount: aptPurchaseAmount,
            paymentTransactionHash: paymentTxHash,
          }),
        }
      );

      if (!completed.success) {
        throw new Error(completed.error || "APT purchase could not be completed.");
      }

      if (completed.creditTransactionHash) {
        setLastTxHash(completed.creditTransactionHash);
      }

      showSuccess(
        `LPT purchased${completed.creditTransactionHash ? `: ${completed.creditTransactionHash.slice(0, 10)}...` : "."}`
      );
      setTimeout(() => refreshTokenData(), 2000);
    } catch (error) {
      console.error("purchase-apt failed:", error);
      const message = error instanceof Error ? error.message : "APT purchase failed.";

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
    <div className="space-y-6">
    <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
      <CardHeader>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="text-2xl flex items-center">
              <Wallet className="mr-3 h-6 w-6 text-emerald-600" />
              LuxPass Token Flow
            </CardTitle>
            <CardDescription>
              {mode === "issuer"
                ? "View your LPT balance and buy LPT for passport fees."
                : "Claim, transfer, spend, and administer LPT across the LuxPass demo."}
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
        <div className={`grid gap-4 ${mode === "issuer" ? "md:grid-cols-1" : "md:grid-cols-2"}`}>
          <div className="rounded-lg border bg-white/70 p-4">
            <p className="text-sm text-gray-500">Your Balance</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{balance} LPT</p>
            <p className="mt-2 text-xs text-gray-500 font-mono">{shortenAddress(walletAddress)}</p>
          </div>
          {mode !== "issuer" && (
            <>
              <div className="rounded-lg border bg-white/70 p-4">
                <p className="text-sm text-gray-500">Total Supply</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{totalSupply}</p>
                <p className="mt-2 text-xs text-gray-500">Platform-wide LPT minted</p>
              </div>
            </>
          )}
        </div>

        {showPurchaseActions && (
          <>
            <Separator />

            <div className={`grid gap-4 ${showUserActions ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
              {showUserActions && (
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
              )}

              <div className="rounded-lg border bg-white/70 p-4">
                <div className="mb-4 flex items-center">
                  <CreditCard className="mr-2 h-5 w-5 text-emerald-600" />
                  <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">Buy LPT with APT</h3>
                      <p className="text-sm text-gray-600">
                        Pay APT and receive LPT after payment verification.
                      </p>
                    </div>
                    <Badge variant="outline">
                      Rate: {formatAptFromOctas(aptPurchaseQuote?.priceOctasPerLpt ?? aptPurchaseRateOctas ?? undefined)} APT / LPT
                    </Badge>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="lptAptPurchaseAmount">LPT Amount</Label>
                    <Input
                      id="lptAptPurchaseAmount"
                      inputMode="numeric"
                      value={aptPurchaseAmount}
                      onChange={(event) => {
                        setAptPurchaseAmount(event.target.value);
                        setAptPurchaseQuote(null);
                      }}
                    />
                  </div>
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    onClick={buyLptWithApt}
                    disabled={isBusy || !accessToken || !connected}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    {actionButtonLabel("purchase-apt", "Buy LPT")}
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
                  Use the admin wallet for LPT initialisation, manual minting, and fiat credits.
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

    {showUserActions && accessToken ? (
      <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-emerald-600" />
            Your LPT activity
          </CardTitle>
          <CardDescription>
            On-chain LPT events where your logged-in wallet sent, received, or was credited or charged. Each row shows
            the transaction time when the chain API returned a timestamp for that ledger version.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lptEventsError ? (
            <p className="text-sm text-red-600">{lptEventsError}</p>
          ) : null}
          <div className="relative">
            {lptEventsLoading && lptEvents.length > 0 ? (
              <div
                className="pointer-events-none absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm"
                aria-hidden
              >
                <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
              </div>
            ) : null}
          <div
            className="max-h-[min(50vh,28rem)] overflow-y-auto overscroll-y-contain rounded-lg border border-gray-200/80 bg-white/60 pr-1"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {lptEventsLoading && lptEvents.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading activity…
              </div>
            ) : lptEvents.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">
                No LPT activity for your wallet in the loaded window yet.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {lptEvents.map((item, index) => {
                  const mintSub = item.tag === "LPT_MINT" ? formatMintSubtag(item.data) : null;
                  const amountDisplay = getLptEventAmountDisplay(item);
                  const direction =
                    amountDisplay === "—" ? "neutral" : getLptActivityDirection(item, lptActivityViewer);
                  const flowText = getLptActivityFlowDescription(item, lptActivityViewer);
                  return (
                    <li key={`${item.version}-${item.sequenceNumber}-${item.tag}-${index}`} className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={`font-mono text-[10px] ${lptEventBadgeClass(item.tag)}`}>
                          {item.tag.replace(/^LPT_/, "")}
                        </Badge>
                        {mintSub ? (
                          <span className="text-[10px] uppercase tracking-wide text-gray-500">{mintSub}</span>
                        ) : null}
                        <span className="ml-auto shrink-0 text-[10px] text-gray-500 tabular-nums">
                          {formatLptEventLocalDateTime(item.occurredAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm">
                        <span className={amountTextClass(direction)}>{amountDisplay}</span>
                        {flowText ? (
                          <span className="text-gray-700"> · {flowText}</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-gray-400">Ledger v{item.version || "?"}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          </div>
        </CardContent>
      </Card>
    ) : null}
    </div>
  );
}
