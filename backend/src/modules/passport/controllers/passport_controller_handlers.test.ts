/**
 * passport_controller_handlers.test.ts
 *
 * Tests for all new and updated handlers in passport.controller.ts,
 * matched to the actual current implementation.
 *
 * Covers:
 *  - receivePassportHandler:         hardcodes STATUS_VERIFYING (5), delegates to prepareSetStatus
 *  - verifyPassportHandler:          hardcodes STATUS_LISTING (6), delegates to prepareSetStatus
 *  - requestListingNoPassport:       calls submitListingRequest with caller wallet address
 *  - receiveNoPassportHandler:       validates tempObjectAddress + only allows status="verifying"
 *  - prepareMintListPassportHandler: passes adminWalletAddress + imageFile, normalises payload bytes
 *  - recordMintListPassportHandler:  all 4 required fields validated individually
 *  - approveDelistHandler:           calls markDelistProcessed, passes callerRole from req.user
 *  - prepareConfirmReceiptHandler:   requires passportObjectAddress, passes callerWalletAddress
 *  - recordConfirmReceiptHandler:    requires txHash + passportObjectAddress
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// ─── Mock the listing service ─────────────────────────────────────────────────
const mockPrepareSetStatus              = vi.fn();
const mockSubmitListingRequest          = vi.fn();
const mockRecordListingPassport         = vi.fn();
const mockUpdateNoPassportListingStatus = vi.fn();
const mockPrepareMintListPassport       = vi.fn();
const mockRecordMintListPassport        = vi.fn();
const mockMarkDelistProcessed           = vi.fn();
const mockPrepareConfirmReceipt         = vi.fn();
const mockRecordConfirmReceipt          = vi.fn();

vi.mock("../services/passport.service", () => ({
  passportService: {},
  passportListingService: {
    prepareSetStatus:               (...a: unknown[]) => mockPrepareSetStatus(...a),
    submitListingRequest:           (...a: unknown[]) => mockSubmitListingRequest(...a),
    updateNoPassportListingStatus:  (...a: unknown[]) => mockUpdateNoPassportListingStatus(...a),
    recordListPassport:             (...a: unknown[]) => mockRecordListingPassport(...a),
    prepareMintListPassport:        (...a: unknown[]) => mockPrepareMintListPassport(...a),
    recordMintListPassport:         (...a: unknown[]) => mockRecordMintListPassport(...a),
    markDelistProcessed:            (...a: unknown[]) => mockMarkDelistProcessed(...a),
    prepareConfirmReceipt:          (...a: unknown[]) => mockPrepareConfirmReceipt(...a),
    recordConfirmReceipt:           (...a: unknown[]) => mockRecordConfirmReceipt(...a),
  },
}));

vi.mock("../../../chains/luxpass/constants", () => ({
  STATUS_VERIFYING: 5,
  STATUS_LISTING:   6,
}));

import {
  receivePassportHandler,
  verifyPassportHandler,
  requestListingNoPassport,
  receiveNoPassportHandler,
  prepareMintListPassportHandler,
  recordMintListPassportHandler,
  approveDelistHandler,
  prepareConfirmReceiptHandler,
  recordConfirmReceiptHandler,
} from "./passport.controller";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function makeReq(
  body: Record<string, unknown> = {},
  user: { walletAddress: string; role: string } = { walletAddress: "0xadmin", role: "ADMIN" },
  extra: Record<string, unknown> = {}
): Request {
  return { user, body, ...extra } as unknown as Request;
}

function noUserReq(body: Record<string, unknown> = {}): Request {
  return { user: undefined, body } as unknown as Request;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.clearAllMocks();
});

// ══════════════════════════════════════════════════════════════════════════════
// receivePassportHandler — hardcodes newStatus = STATUS_VERIFYING (5)
// ══════════════════════════════════════════════════════════════════════════════

describe("receivePassportHandler", () => {
  it("injects newStatus=5 and calls prepareSetStatus", async () => {
    mockPrepareSetStatus.mockResolvedValue({ success: true, payload: {} });

    const req = makeReq({ passportObjectAddress: "0xpassport" });
    const res = makeRes();

    await receivePassportHandler(req, res);

    expect(mockPrepareSetStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ newStatus: 5 }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("passes callerWalletAddress and callerRole from req.user", async () => {
    mockPrepareSetStatus.mockResolvedValue({ success: true, payload: {} });

    const req = makeReq(
      { passportObjectAddress: "0xpassport" },
      { walletAddress: "0xadmin", role: "ADMIN" }
    );
    const res = makeRes();

    await receivePassportHandler(req, res);

    expect(mockPrepareSetStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        callerWalletAddress: "0xadmin",
        callerRole: "ADMIN",
      })
    );
  });

  it("returns 400 when passportObjectAddress is missing", async () => {
    const req = makeReq({});
    const res = makeRes();

    await receivePassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrepareSetStatus).not.toHaveBeenCalled();
  });

  it("returns 401 when no user on request", async () => {
    const req = noUserReq({ passportObjectAddress: "0xpassport" });
    const res = makeRes();

    await receivePassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockPrepareSetStatus).not.toHaveBeenCalled();
  });

  it("returns 400 when prepareSetStatus returns failure", async () => {
    mockPrepareSetStatus.mockResolvedValue({ success: false, error: "Passport not found." });

    const req = makeReq({ passportObjectAddress: "0xpassport" });
    const res = makeRes();

    await receivePassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "Passport not found." })
    );
  });

  it("returns 400 on unexpected thrown error", async () => {
    mockPrepareSetStatus.mockRejectedValue(new Error("Unexpected"));

    const req = makeReq({ passportObjectAddress: "0xpassport" });
    const res = makeRes();

    await receivePassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "Unexpected" })
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// verifyPassportHandler — hardcodes newStatus = STATUS_LISTING (6)
// ══════════════════════════════════════════════════════════════════════════════

describe("verifyPassportHandler", () => {
  it("injects newStatus=6 and calls prepareSetStatus", async () => {
    mockPrepareSetStatus.mockResolvedValue({ success: true, payload: {} });

    const req = makeReq({ passportObjectAddress: "0xpassport" });
    const res = makeRes();

    await verifyPassportHandler(req, res);

    expect(mockPrepareSetStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ newStatus: 6 }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("passes callerWalletAddress and callerRole from req.user", async () => {
    mockPrepareSetStatus.mockResolvedValue({ success: true, payload: {} });

    const req = makeReq(
      { passportObjectAddress: "0xpassport" },
      { walletAddress: "0xadmin", role: "ADMIN" }
    );
    const res = makeRes();

    await verifyPassportHandler(req, res);

    expect(mockPrepareSetStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        callerWalletAddress: "0xadmin",
        callerRole: "ADMIN",
      })
    );
  });

  it("returns 400 when passportObjectAddress is missing", async () => {
    const req = makeReq({});
    const res = makeRes();

    await verifyPassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrepareSetStatus).not.toHaveBeenCalled();
  });

  it("returns 401 when no user", async () => {
    const req = noUserReq({ passportObjectAddress: "0xpassport" });
    const res = makeRes();

    await verifyPassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 400 when prepareSetStatus returns failure", async () => {
    mockPrepareSetStatus.mockResolvedValue({ success: false, error: "Not admin." });

    const req = makeReq({ passportObjectAddress: "0xpassport" });
    const res = makeRes();

    await verifyPassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// requestListingNoPassport
// ══════════════════════════════════════════════════════════════════════════════

describe("requestListingNoPassport", () => {
  it("calls submitListingRequest with the caller wallet address", async () => {
    mockSubmitListingRequest.mockResolvedValue({ success: true, message: "Submitted." });

    const req = makeReq({}, { walletAddress: "0xseller", role: "USER" });
    const res = makeRes();

    await requestListingNoPassport(req, res);

    expect(mockSubmitListingRequest).toHaveBeenCalledWith(
      expect.objectContaining({ callerWalletAddress: "0xseller" })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 401 when no user", async () => {
    const req = noUserReq();
    const res = makeRes();

    await requestListingNoPassport(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockSubmitListingRequest).not.toHaveBeenCalled();
  });

  it("returns 400 when service returns failure", async () => {
    mockSubmitListingRequest.mockResolvedValue({
      success: false,
      error: "Failed to submit listing request. Please try again later.",
    });

    const req = makeReq({}, { walletAddress: "0xseller", role: "USER" });
    const res = makeRes();

    await requestListingNoPassport(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it("returns 400 on unexpected thrown error", async () => {
    mockSubmitListingRequest.mockRejectedValue(new Error("DB down"));

    const req = makeReq({}, { walletAddress: "0xseller", role: "USER" });
    const res = makeRes();

    await requestListingNoPassport(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// receiveNoPassportHandler
// ══════════════════════════════════════════════════════════════════════════════

describe("receiveNoPassportHandler", () => {
  it("returns 200 when tempObjectAddress and status='verifying' are provided", async () => {
    mockUpdateNoPassportListingStatus.mockResolvedValue({ success: true, message: "ok" });

    const req = makeReq({ tempObjectAddress: "temp_abc", status: "verifying" });
    const res = makeRes();

    await receiveNoPassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdateNoPassportListingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        callerRole: "ADMIN",
        body: expect.objectContaining({ tempObjectAddress: "temp_abc", status: "verifying" }),
      })
    );
  });

  it("returns 400 when tempObjectAddress is missing", async () => {
    const req = makeReq({ status: "verifying" });
    const res = makeRes();

    await receiveNoPassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/tempObjectAddress/i) })
    );
    expect(mockUpdateNoPassportListingStatus).not.toHaveBeenCalled();
  });

  it("returns 400 when status is missing", async () => {
    const req = makeReq({ tempObjectAddress: "temp_abc" });
    const res = makeRes();

    await receiveNoPassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUpdateNoPassportListingStatus).not.toHaveBeenCalled();
  });

  it("returns 400 when status is not 'verifying'", async () => {
    const req = makeReq({ tempObjectAddress: "temp_abc", status: "listed" });
    const res = makeRes();

    await receiveNoPassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/only.*verifying/i) })
    );
    expect(mockUpdateNoPassportListingStatus).not.toHaveBeenCalled();
  });

  it("returns 401 when no user", async () => {
    const req = noUserReq({ tempObjectAddress: "temp_abc", status: "verifying" });
    const res = makeRes();

    await receiveNoPassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockUpdateNoPassportListingStatus).not.toHaveBeenCalled();
  });

  it("returns 400 when service returns failure", async () => {
    mockUpdateNoPassportListingStatus.mockResolvedValue({
      success: false,
      error: "Failed to update listing request. Please try again later.",
    });

    const req = makeReq({ tempObjectAddress: "temp_abc", status: "verifying" });
    const res = makeRes();

    await receiveNoPassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// prepareMintListPassportHandler
// ══════════════════════════════════════════════════════════════════════════════

describe("prepareMintListPassportHandler", () => {
  it("returns 200 with normalised payload on success", async () => {
    mockPrepareMintListPassport.mockResolvedValue({
      success: true,
      imageCid: "img-cid",
      imageIpfsUri: "ipfs://img",
      metadataCid: "meta-cid",
      metadataIpfsUri: "ipfs://meta",
      metadata: {},
      payload: {
        function: "::passport::mint_list",
        functionArguments: ["0xreg", "0xowner", [1, 2, 3], "ipfs://meta", [4, 5, 6], "temp_abc"],
      },
    });

    const req = makeReq({ tempObjectAddress: "temp_abc" });
    const res = makeRes();

    await prepareMintListPassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPrepareMintListPassport).toHaveBeenCalledWith(
      expect.objectContaining({ adminWalletAddress: "0xadmin" })
    );
  });

  it("passes imageFile from req.file to the service", async () => {
    mockPrepareMintListPassport.mockResolvedValue({
      success: true,
      payload: { function: "::mint_list", functionArguments: [] },
      imageCid: "", imageIpfsUri: "", metadataCid: "", metadataIpfsUri: "", metadata: {},
    });

    const fakeFile = { buffer: Buffer.from("img"), mimetype: "image/jpeg" };
    const req = {
      ...makeReq({ tempObjectAddress: "temp_abc" }),
      file: fakeFile,
    } as unknown as Request;
    const res = makeRes();

    await prepareMintListPassportHandler(req, res);

    expect(mockPrepareMintListPassport).toHaveBeenCalledWith(
      expect.objectContaining({ imageFile: fakeFile })
    );
  });

  it("returns 401 when no user", async () => {
    const req = noUserReq({ tempObjectAddress: "temp_abc" });
    const res = makeRes();

    await prepareMintListPassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockPrepareMintListPassport).not.toHaveBeenCalled();
  });

  it("returns 400 when service returns failure (listing not in verifying)", async () => {
    mockPrepareMintListPassport.mockResolvedValue({
      success: false,
      error: "Listing request is not in verifying stage.",
    });

    const req = makeReq({ tempObjectAddress: "temp_abc" });
    const res = makeRes();

    await prepareMintListPassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Listing request is not in verifying stage." })
    );
  });

  it("returns 400 when service returns failure (already has passport)", async () => {
    mockPrepareMintListPassport.mockResolvedValue({
      success: false,
      error: "Listing request already has a passport. No need to mint-list.",
    });

    const req = makeReq({ tempObjectAddress: "temp_abc" });
    const res = makeRes();

    await prepareMintListPassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 on unexpected thrown error", async () => {
    mockPrepareMintListPassport.mockRejectedValue(new Error("IPFS timeout"));

    const req = makeReq({ tempObjectAddress: "temp_abc" });
    const res = makeRes();

    await prepareMintListPassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "IPFS timeout" })
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// recordMintListPassportHandler — all 4 required fields
// ══════════════════════════════════════════════════════════════════════════════

describe("recordMintListPassportHandler", () => {
  const validBody = {
    txHash: "0xtxhash",
    passportObjectAddress: "0xrealpassport",
    tempPassportObjectAddress: "temp_abc",
    ownerAddress: "0xowner",
  };

  it("returns 200 and calls recordMintListPassport on success", async () => {
    mockRecordMintListPassport.mockResolvedValue({
      success: true,
      message: "Minting of listed passport recorded successfully.",
    });

    const req = makeReq(validBody);
    const res = makeRes();

    await recordMintListPassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockRecordMintListPassport).toHaveBeenCalledWith(
      expect.objectContaining({ body: validBody })
    );
  });

  it.each([
    ["txHash",                    { ...validBody, txHash: undefined }],
    ["passportObjectAddress",     { ...validBody, passportObjectAddress: undefined }],
    ["tempPassportObjectAddress", { ...validBody, tempPassportObjectAddress: undefined }],
    ["ownerAddress",              { ...validBody, ownerAddress: undefined }],
  ])("returns 400 when %s is missing", async (_field, body) => {
    const req = makeReq(body as Record<string, unknown>);
    const res = makeRes();

    await recordMintListPassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockRecordMintListPassport).not.toHaveBeenCalled();
  });

  it("returns 401 when no user", async () => {
    const req = noUserReq(validBody);
    const res = makeRes();

    await recordMintListPassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockRecordMintListPassport).not.toHaveBeenCalled();
  });

  it("returns 400 when service returns failure", async () => {
    mockRecordMintListPassport.mockResolvedValue({
      success: false,
      error: "Transaction is not a mint_list passport transaction.",
    });

    const req = makeReq(validBody);
    const res = makeRes();

    await recordMintListPassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Transaction is not a mint_list passport transaction." })
    );
  });

  it("returns 400 on unexpected thrown error", async () => {
    mockRecordMintListPassport.mockRejectedValue(new Error("Chain unreachable"));

    const req = makeReq(validBody);
    const res = makeRes();

    await recordMintListPassportHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// approveDelistHandler — calls markDelistProcessed
// ══════════════════════════════════════════════════════════════════════════════

describe("approveDelistHandler", () => {
  it("returns 200 with set_status(RETURNING) payload on success", async () => {
    mockMarkDelistProcessed.mockResolvedValue({
      success: true,
      payload: { function: "::passport::set_status", functionArguments: ["0xp", "0xreg", 7] },
    });

    const req = makeReq({ passportObjectAddress: "0xpassport" });
    const res = makeRes();

    await approveDelistHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, payload: expect.any(Object) })
    );
  });

  it("passes passportObjectAddress and callerRole to markDelistProcessed", async () => {
    mockMarkDelistProcessed.mockResolvedValue({ success: true, payload: {} });

    const req = makeReq(
      { passportObjectAddress: "0xpassport" },
      { walletAddress: "0xadmin", role: "ADMIN" }
    );
    const res = makeRes();

    await approveDelistHandler(req, res);

    expect(mockMarkDelistProcessed).toHaveBeenCalledWith(
      expect.objectContaining({
        callerRole: "ADMIN",
        passportObjectAddress: "0xpassport",
      })
    );
  });

  it("returns 400 when passportObjectAddress is missing", async () => {
    const req = makeReq({});
    const res = makeRes();

    await approveDelistHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/passportObjectAddress/i) })
    );
    expect(mockMarkDelistProcessed).not.toHaveBeenCalled();
  });

  it("returns 401 when no user", async () => {
    const req = noUserReq({ passportObjectAddress: "0xpassport" });
    const res = makeRes();

    await approveDelistHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockMarkDelistProcessed).not.toHaveBeenCalled();
  });

  it("returns 400 when service returns failure (no delist request found)", async () => {
    mockMarkDelistProcessed.mockResolvedValue({
      success: false,
      error: "No delist request found for this passport.",
    });

    const req = makeReq({ passportObjectAddress: "0xpassport" });
    const res = makeRes();

    await approveDelistHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "No delist request found for this passport." })
    );
  });

  it("returns 400 when service returns failure (already processed)", async () => {
    mockMarkDelistProcessed.mockResolvedValue({
      success: false,
      error: "Delist request has already been processed.",
    });

    const req = makeReq({ passportObjectAddress: "0xpassport" });
    const res = makeRes();

    await approveDelistHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 on unexpected thrown error", async () => {
    mockMarkDelistProcessed.mockRejectedValue(new Error("DB error"));

    const req = makeReq({ passportObjectAddress: "0xpassport" });
    const res = makeRes();

    await approveDelistHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "DB error" })
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// prepareConfirmReceiptHandler
// ══════════════════════════════════════════════════════════════════════════════

describe("prepareConfirmReceiptHandler", () => {
  it("returns 200 with delist payload on success", async () => {
    mockPrepareConfirmReceipt.mockResolvedValue({
      success: true,
      payload: { function: "::passport::delist_passport", functionArguments: [] },
    });

    const req = makeReq(
      { passportObjectAddress: "0xpassport" },
      { walletAddress: "0xowner", role: "USER" }
    );
    const res = makeRes();

    await prepareConfirmReceiptHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPrepareConfirmReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        callerWalletAddress: "0xowner",
        body: expect.objectContaining({ passportObjectAddress: "0xpassport" }),
      })
    );
  });

  it("returns 400 when passportObjectAddress is missing", async () => {
    const req = makeReq({});
    const res = makeRes();

    await prepareConfirmReceiptHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/passportObjectAddress/i) })
    );
    expect(mockPrepareConfirmReceipt).not.toHaveBeenCalled();
  });

  it("returns 401 when no user", async () => {
    const req = noUserReq({ passportObjectAddress: "0xpassport" });
    const res = makeRes();

    await prepareConfirmReceiptHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockPrepareConfirmReceipt).not.toHaveBeenCalled();
  });

  it("returns 400 when passport is not in RETURNING status", async () => {
    mockPrepareConfirmReceipt.mockResolvedValue({
      success: false,
      error: "Passport must be in RETURNING status to confirm receipt.",
    });

    const req = makeReq({ passportObjectAddress: "0xpassport" });
    const res = makeRes();

    await prepareConfirmReceiptHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Passport must be in RETURNING status to confirm receipt.",
      })
    );
  });

  it("returns 400 when caller is not the owner", async () => {
    mockPrepareConfirmReceipt.mockResolvedValue({
      success: false,
      error: "You are not the owner of this passport.",
    });

    const req = makeReq({ passportObjectAddress: "0xpassport" });
    const res = makeRes();

    await prepareConfirmReceiptHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// recordConfirmReceiptHandler
// ══════════════════════════════════════════════════════════════════════════════

describe("recordConfirmReceiptHandler", () => {
  it("returns 200 on success", async () => {
    mockRecordConfirmReceipt.mockResolvedValue({
      success: true,
      message: "Receipt confirmed. Passport is now active.",
    });

    const req = makeReq(
      { txHash: "0xtxhash", passportObjectAddress: "0xpassport" },
      { walletAddress: "0xowner", role: "USER" }
    );
    const res = makeRes();

    await recordConfirmReceiptHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockRecordConfirmReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          txHash: "0xtxhash",
          passportObjectAddress: "0xpassport",
        }),
      })
    );
  });

  it("returns 400 when txHash is missing", async () => {
    const req = makeReq({ passportObjectAddress: "0xpassport" });
    const res = makeRes();

    await recordConfirmReceiptHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/txHash/i) })
    );
    expect(mockRecordConfirmReceipt).not.toHaveBeenCalled();
  });

  it("returns 400 when passportObjectAddress is missing", async () => {
    const req = makeReq({ txHash: "0xtxhash" });
    const res = makeRes();

    await recordConfirmReceiptHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockRecordConfirmReceipt).not.toHaveBeenCalled();
  });

  it("returns 401 when no user", async () => {
    const req = noUserReq({ txHash: "0xtxhash", passportObjectAddress: "0xpassport" });
    const res = makeRes();

    await recordConfirmReceiptHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockRecordConfirmReceipt).not.toHaveBeenCalled();
  });

  it("returns 400 when service returns failure (wrong tx type)", async () => {
    mockRecordConfirmReceipt.mockResolvedValue({
      success: false,
      error: "Transaction is not a set_status transaction.",
    });

    const req = makeReq({ txHash: "0xtxhash", passportObjectAddress: "0xpassport" });
    const res = makeRes();

    await recordConfirmReceiptHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Transaction is not a set_status transaction." })
    );
  });

  it("returns 400 on unexpected thrown error", async () => {
    mockRecordConfirmReceipt.mockRejectedValue(new Error("Chain unreachable"));

    const req = makeReq({ txHash: "0xtxhash", passportObjectAddress: "0xpassport" });
    const res = makeRes();

    await recordConfirmReceiptHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Chain unreachable" })
    );
  });
});
