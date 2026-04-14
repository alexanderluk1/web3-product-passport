export interface ListingRequest {
  id: string;
  passport_object_address: string;
  owner_address: string;
  status: string;
  has_passport: boolean;
  created_at: string;
  updated_at: string;
}

export const LISTING_STATUSES = [
  "pending",
  "verifying",
  "listed",
  "request_return",
  "returning",
  "returned",
] as const;

export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const fetchListingsByStatusMap = async (params: {
  baseUrl: string;
  accessToken: string | null | undefined;
}): Promise<Record<ListingStatus, ListingRequest[]>> => {
  const { baseUrl, accessToken } = params;
  const results = await Promise.all(
    LISTING_STATUSES.map(s =>
      fetch(`${baseUrl}/api/passports/listings/status/${s}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(r => (r.ok ? r.json() : { payload: [] }))
    )
  );
  const byStatus = {} as Record<ListingStatus, ListingRequest[]>;
  LISTING_STATUSES.forEach((s, i) => {
    byStatus[s] = results[i].payload ?? [];
  });
  return byStatus;
};
