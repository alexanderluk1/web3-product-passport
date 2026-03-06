type StoredIssuer = {
  issuerAddress: string;
  status: "ACTIVE" | "REMOVED";
  registeredAt: number;
  removedAt?: number;
};

const issuerStore = new Map<string, StoredIssuer>();

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function saveIssuer(issuerAddress: string): StoredIssuer {
  const normalized = normalizeAddress(issuerAddress);

  const existing = issuerStore.get(normalized);
  if (existing) {
    return existing;
  }

  const issuer: StoredIssuer = {
    issuerAddress: normalized,
    status: "ACTIVE",
    registeredAt: Date.now(),
  };

  issuerStore.set(normalized, issuer);
  return issuer;
}

export function getAllIssuers(): StoredIssuer[] {
  return Array.from(issuerStore.values())
    .sort((a, b) => b.registeredAt - a.registeredAt);
}

export function hasActiveIssuer(issuerAddress: string): boolean {
  const normalized = normalizeAddress(issuerAddress);
  const issuer = issuerStore.get(normalized);
  return issuer?.status === "ACTIVE";
}

export function getActiveIssuers(): StoredIssuer[] {
  return getAllIssuers().filter((issuer) => issuer.status === "ACTIVE");
}
