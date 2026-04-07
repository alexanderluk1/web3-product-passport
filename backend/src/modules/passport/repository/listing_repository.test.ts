/**
 * listing_repository.test.ts
 *
 * Tests the implementation in listing_repository.ts.
 *
 * Covers:
 *  - createListingRequest with passport (single insert, returns full row)
 *  - createListingRequest without passport (two-step: id first, then placeholder insert)
 *  - updateListingRequestOwner (snake_case owner_address column)
 *  - updateListingRequestStatus (all valid statuses + address normalisation)
 *  - updateListingRequestPassportAddress (swaps temp→real, sets has_passport+status in one update)
 *  - createDelistRequest (normalises addresses, null address_line2)
 *  - updateDelistRequestStatus (type = "pending"|"processed"|"closed")
 *  - updateDelistRequestAddress (updates address fields, does NOT touch status)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ListingRequest, DelistRequest } from "./listing_repository";

// ─── Mock knex fluent builder ─────────────────────────────────────────────────

const { hoistedDb, mockWhere, mockInsert, mockUpdate, mockReturning } = vi.hoisted(() => {
  const mockReturning = vi.fn().mockResolvedValue([]);
  
  // Create an object that contains all chainable methods
  const builder = {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    first: vi.fn().mockImplementation(() => mockReturning()),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    returning: mockReturning,
  };

  builder.update.mockReturnValue(builder);
  builder.insert.mockReturnValue(builder);

  const db = Object.assign(
    vi.fn(() => builder),
    { fn: { now: vi.fn(() => "NOW()") } }
  );

  return { hoistedDb: db, mockWhere: builder.where, mockInsert: builder.insert, mockUpdate: builder.update, mockReturning };
});

vi.mock("../../../config/db", () => ({ db: hoistedDb }));

import {
  createListingRequest,
  createDelistRequest,
  updateListingRequestOwner,
  updateListingRequestStatus,
  updateListingRequestPassportAddress,
  updateDelistRequestStatus,
  updateDelistRequestAddress,
} from "./listing_repository";

function makeListingRow(overrides: Partial<ListingRequest> = {}): ListingRequest {
  return {
    id: "uuid-1",
    passport_object_address: "0xpassport",
    owner_address: "0xowner",
    status: "pending",
    has_passport: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeDelistRow(overrides: Partial<DelistRequest> = {}): DelistRequest {
  return {
    id: "delist-1",
    passport_object_address: "0xpassport",
    requester_address: "0xowner",
    address_line1: "123 Main St",
    address_line2: null,
    city: "Singapore",
    state: "SG",
    postal_code: "123456",
    country: "SG",
    status: "pending",
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

// ══════════════════════════════════════════════════════════════════════════════
// createListingRequest — with passport
// ══════════════════════════════════════════════════════════════════════════════

describe("createListingRequest — with passport", () => {
  it("inserts correct fields and returns the full row", async () => {
    const fakeRow = makeListingRow({ passport_object_address: "0xpassport", owner_address: "0xowner" });
    mockReturning.mockResolvedValueOnce([fakeRow]);

    const result = await createListingRequest(true, "0xowner", "0xpassport");

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        passport_object_address: "0xpassport",
        owner_address: "0xowner",
        has_passport: true,
        status: "pending",
      })
    );
    expect(mockReturning).toHaveBeenCalledWith("*");
    expect(result.id).toBe("uuid-1");
    expect(result.has_passport).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// createListingRequest — without passport (two-step insert)
// ══════════════════════════════════════════════════════════════════════════════

describe("createListingRequest — without passport", () => {
  it("performs exactly two inserts: first to get id, second with temp_ placeholder", async () => {
    mockReturning
      .mockResolvedValueOnce([{ id: "uuid-temp" }])          // first: returning("id")
      .mockResolvedValueOnce([makeListingRow({ id: "uuid-temp", has_passport: false })]);  // second: returning("*")

    const result = await createListingRequest(false, "0xseller");

    expect(mockInsert).toHaveBeenCalledTimes(2);

    // Second insert must use a temp_ placeholder
    const secondInsert = mockInsert.mock.calls[1][0] as Record<string, unknown>;
    expect((secondInsert.passport_object_address as string).startsWith("temp_")).toBe(true);
    expect(secondInsert.owner_address).toBe("0xseller");
    expect(secondInsert.has_passport).toBe(false);

    expect(result.id).toBe("uuid-temp");
  });

  it("placeholder is deterministic: same seller + same id → same placeholder hash", async () => {
    const run = async () => {
      mockReturning
        .mockResolvedValueOnce([{ id: "fixed-id" }])
        .mockResolvedValueOnce([makeListingRow({ has_passport: false })]);
      await createListingRequest(false, "0xseller");
      return (mockInsert.mock.calls[1][0] as Record<string, unknown>)
        .passport_object_address as string;
    };

    const first = await run();
    vi.clearAllMocks();
    const second = await run();

    expect(first).toBe(second);
  });

  it("first insert uses a non-undefined initial placeholder (not the real address)", async () => {
    mockReturning
      .mockResolvedValueOnce([{ id: "x" }])
      .mockResolvedValueOnce([makeListingRow({ has_passport: false })]);

    await createListingRequest(false, "0xseller");

    const firstInsert = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(firstInsert.passport_object_address).toBeDefined();
    expect(firstInsert.passport_object_address).not.toBe(undefined);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// updateListingRequestOwner
// ══════════════════════════════════════════════════════════════════════════════

describe("updateListingRequestOwner", () => {
  it("uses owner_address (snake_case) in the update payload", async () => {
    mockReturning.mockResolvedValueOnce([makeListingRow({ owner_address: "0xnewowner" })]);

    const result = await updateListingRequestOwner("0xpassport", "0xnewowner");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ owner_address: "0xnewowner" })
    );
    expect(result?.owner_address).toBe("0xnewowner");
  });

  it("queries by passport_object_address", async () => {
    mockInsert.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValueOnce([makeListingRow()]);

    await updateListingRequestOwner("0xpassport", "0xnewowner");

    expect(mockWhere).toHaveBeenCalledWith("passport_object_address", "0xpassport");
  });

  it("returns undefined when no row matched", async () => {
    mockReturning.mockResolvedValueOnce([]);
    expect(await updateListingRequestOwner("0xmissing", "0xnew")).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// updateListingRequestStatus
// ══════════════════════════════════════════════════════════════════════════════

describe("updateListingRequestStatus", () => {
  it.each(["pending", "verifying", "listed", "request_return", "returning", "returned"] as const)(
    "accepts status '%s'",
    async (status) => {
      mockReturning.mockResolvedValueOnce([makeListingRow({ status })]);

      const result = await updateListingRequestStatus("0xpassport", status);

      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status }));
      expect(result?.status).toBe(status);
    }
  );

  it("lowercases the passport address before querying", async () => {
    mockReturning.mockResolvedValueOnce([makeListingRow()]);

    await updateListingRequestStatus("0xPASSPORT", "verifying");

    expect(mockWhere).toHaveBeenCalledWith("passport_object_address", "0xpassport");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// updateListingRequestPassportAddress — temp→real swap
// ══════════════════════════════════════════════════════════════════════════════

describe("updateListingRequestPassportAddress", () => {
  it("sets passport_object_address, has_passport=true and status='listed' in one update", async () => {
    const fakeRow = makeListingRow({
      passport_object_address: "0xreal",
      has_passport: true,
      status: "listed",
    });
    mockReturning.mockResolvedValueOnce([fakeRow]);

    const result = await updateListingRequestPassportAddress("temp_abc", "0xreal");

    expect(mockWhere).toHaveBeenCalledWith("passport_object_address", "temp_abc");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        passport_object_address: "0xreal",
        has_passport: true,
        status: "listed",
      })
    );
    expect(result?.passport_object_address).toBe("0xreal");
    expect(result?.has_passport).toBe(true);
    expect(result?.status).toBe("listed");
  });

  it("searches by passport_object_address (not id)", async () => {
    mockReturning.mockResolvedValueOnce([makeListingRow()]);

    await updateListingRequestPassportAddress("temp_abc", "0xreal");

    const whereArg = mockWhere.mock.calls[0][0];
    expect(whereArg).toBe("passport_object_address");
    expect(whereArg).not.toBe("id");
  });

  it("returns undefined when temp address not found", async () => {
    mockReturning.mockResolvedValueOnce([]);
    expect(await updateListingRequestPassportAddress("temp_notfound", "0xreal")).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// createDelistRequest
// ══════════════════════════════════════════════════════════════════════════════

describe("createDelistRequest", () => {
  it("normalises addresses to lowercase and inserts all required fields", async () => {
    mockReturning.mockResolvedValueOnce([makeDelistRow()]);

    await createDelistRequest({
      passportObjectAddress: "0xPASSPORT",
      requesterAddress: "0xOWNER",
      addressLine1: "123 Main St",
      city: "Singapore",
      state: "SG",
      postalCode: "123456",
      country: "SG",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        passport_object_address: "0xpassport",
        requester_address: "0xowner",
        address_line1: "123 Main St",
        city: "Singapore",
        state: "SG",
        postal_code: "123456",
        country: "SG",
        status: "pending",
      })
    );
  });

  it("stores null for address_line2 when omitted", async () => {
    mockReturning.mockResolvedValueOnce([makeDelistRow()]);

    await createDelistRequest({
      passportObjectAddress: "0xpassport",
      requesterAddress: "0xowner",
      addressLine1: "123 Main St",
      city: "Singapore",
      state: "SG",
      postalCode: "123456",
      country: "SG",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ address_line2: null })
    );
  });

  it("stores addressLine2 when provided", async () => {
    mockReturning.mockResolvedValueOnce([makeDelistRow()]);

    await createDelistRequest({
      passportObjectAddress: "0xpassport",
      requesterAddress: "0xowner",
      addressLine1: "123 Main St",
      addressLine2: "Unit 5B",
      city: "Singapore",
      state: "SG",
      postalCode: "123456",
      country: "SG",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ address_line2: "Unit 5B" })
    );
  });

  it("returns the full row from the database", async () => {
    const fakeRow = makeDelistRow({ id: "delist-xyz" });
    mockReturning.mockResolvedValueOnce([fakeRow]);

    const result = await createDelistRequest({
      passportObjectAddress: "0xpassport",
      requesterAddress: "0xowner",
      addressLine1: "123 Main St",
      city: "Singapore",
      state: "SG",
      postalCode: "123456",
      country: "SG",
    });

    expect(result.id).toBe("delist-xyz");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// updateDelistRequestStatus — union: "pending" | "processed" | "closed"
// ══════════════════════════════════════════════════════════════════════════════

describe("updateDelistRequestStatus", () => {
  it.each(["pending", "processed", "closed"] as const)(
    "accepts valid status '%s'",
    async (status) => {
      mockReturning.mockResolvedValueOnce([makeDelistRow({ status })]);

      const result = await updateDelistRequestStatus("0xpassport", status);

      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status }));
      expect(result?.status).toBe(status);
    }
  );

  it("lowercases passport address before querying", async () => {
    mockReturning.mockResolvedValueOnce([makeDelistRow()]);

    await updateDelistRequestStatus("0xPASSPORT", "processed");

    expect(mockWhere).toHaveBeenCalledWith("passport_object_address", "0xpassport");
  });

  it("returns undefined when no row found", async () => {
    mockReturning.mockResolvedValueOnce([]);
    expect(await updateDelistRequestStatus("0xmissing", "closed")).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// updateDelistRequestAddress — updates address fields only
// ══════════════════════════════════════════════════════════════════════════════

describe("updateDelistRequestAddress", () => {
  it("updates address fields and does NOT include status in the update", async () => {
    mockReturning.mockResolvedValueOnce([
      makeDelistRow({ address_line1: "456 New Rd", city: "Johor" }),
    ]);

    const result = await updateDelistRequestAddress(
      "0xpassport",
      "456 New Rd",
      undefined,
      "Johor",
      "JB",
      "80000",
      "MY"
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        address_line1: "456 New Rd",
        address_line2: null,
        city: "Johor",
        state: "JB",
        postal_code: "80000",
        country: "MY",
      })
    );

    const updateArg = mockUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg).not.toHaveProperty("status");

    expect(result?.address_line1).toBe("456 New Rd");
  });

  it("stores address_line2 when provided", async () => {
    mockReturning.mockResolvedValueOnce([makeDelistRow()]);

    await updateDelistRequestAddress(
      "0xpassport",
      "456 New Rd",
      "Unit 3",
      "Johor",
      "JB",
      "80000",
      "MY"
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ address_line2: "Unit 3" })
    );
  });

  it("lowercases passport address before querying", async () => {
    mockReturning.mockResolvedValueOnce([makeDelistRow()]);

    await updateDelistRequestAddress(
      "0xPASSPORT",
      "456 New Rd",
      undefined,
      "Johor",
      "JB",
      "80000",
      "MY"
    );

    expect(mockWhere).toHaveBeenCalledWith("passport_object_address", "0xpassport");
  });
});
