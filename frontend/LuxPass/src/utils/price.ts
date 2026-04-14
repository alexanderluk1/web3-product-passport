const OCTAS_PER_APT = 1e8;

export function octasToApt(octas: string | bigint | number): string {
  const val = Number(BigInt(octas));
  const apt = val / OCTAS_PER_APT;
  if (apt === 0) return "0";
  return apt < 0.01 ? apt.toFixed(8) : apt.toFixed(2);
}

export function aptToOctas(apt: number): string {
  return String(Math.round(apt * OCTAS_PER_APT));
}

let cachedAptUsd: { price: number; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getAptUsdPrice(): Promise<number> {
  if (cachedAptUsd && Date.now() - cachedAptUsd.fetchedAt < CACHE_TTL_MS) {
    return cachedAptUsd.price;
  }
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=aptos&vs_currencies=usd",
    );
    const data = await res.json();
    const price = data.aptos.usd;
    cachedAptUsd = { price, fetchedAt: Date.now() };
    return price;
  } catch {
    return cachedAptUsd?.price ?? 10;
  }
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}
