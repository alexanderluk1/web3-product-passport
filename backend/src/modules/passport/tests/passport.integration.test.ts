/**
 * LuxPass Marketplace — Integration Tests
 *
 * Covers both full workflows:
 *   A) Listing WITH passport   (prepare → record → receive → verify → transfer → delist → receipt)
 *   B) Listing WITHOUT passport (no-passport-record → receive → verify/mint → delist → receipt)
 *
 * Prerequisites (already satisfied by docker-compose):
 *   - PostgreSQL running and migrations applied
 *   - Aptos devnet accessible
 *   - Module `luxpass::passport` published under REGISTRY_ADDRESS
 *   - ADMIN_PRIVATE_KEY set in env; users funded on devnet
 *
 * Run:
 *   docker compose up -d db
 *   NODE_OPTIONS='--import tsx' npx knex migrate:latest --knexfile knexfile.ts
 *   npx jest --testPathPattern=passport.integration --runInBand
 *
 * Or against the running container:
 *   docker compose exec backend npx jest --testPathPattern=passport.integration --runInBand
 */

import request from "supertest";
import { createApp } from "../../../app"; // adjust path to your createApp export
import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import { randomBytes } from "crypto";

// ─── Helpers ────────────────────────────────────────────────────────────────

const app = createApp();

/** Read env with a fallback so tests fail clearly if config is missing. */
function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

/**
 * Generate a unique serial number for each test run so devnet uniqueness
 * constraints (one passport per serial) don't cause false failures.
 */
function uniqueSerial(prefix = "SN"): string {
  return `${prefix}-${randomBytes(6).toString("hex").toUpperCase()}`;
}

/** Sign and submit a transaction payload returned by prepare endpoints. */
async function signAndSubmit(
  aptos: Aptos,
  signer: Account,
  payload: { function: string; functionArguments: unknown[] }
): Promise<string> {
  const txn = await aptos.transaction.build.simple({
    sender: signer.accountAddress,
    data: {
      function: payload.function as `${string}::${string}::${string}`,
      functionArguments: payload.functionArguments as never[],
    },
  });
  const signed = aptos.transaction.sign({ signer, transaction: txn });
  const submitted = await aptos.transaction.submit.simple({
    transaction: txn,
    senderAuthenticator: signed,
  });
  const result = await aptos.waitForTransaction({
    transactionHash: submitted.hash,
  });
  if (!result.success) {
    throw new Error(`Transaction failed: ${submitted.hash}`);
  }
  return submitted.hash;
}

// ─── Test Config ────────────────────────────────────────────────────────────

const ADMIN_PRIVATE_KEY = requireEnv("ADMIN_PRIVATE_KEY");
const USER_PRIVATE_KEY = requireEnv("TEST_PRIVATE_KEY")
const FULLNODE_URL = process.env.APTOS_NODE_URL ?? "http://localhost:8080/v1";
const FAUCET_URL   = process.env.APTOS_FAUCET_URL ?? "http://localhost:8082/v1";

const aptosConfig = new AptosConfig({
  network: Network.LOCAL,
  fullnode: FULLNODE_URL,
  faucet: FAUCET_URL,
});
const aptos = new Aptos(aptosConfig);

const adminAccount = Account.fromPrivateKey({
  privateKey: new Ed25519PrivateKey(ADMIN_PRIVATE_KEY),
});
const userAccount = Account.fromPrivateKey({
  privateKey: new Ed25519PrivateKey(USER_PRIVATE_KEY),
});

/** JWT tokens — obtained from /auth endpoints before running tests. */
let adminToken: string;
let userToken: string;
let issuerToken: string; // alias for adminToken — admin is also the issuer in tests

// ─── Auth helpers ────────────────────────────────────────────────────────────

/**
 * Obtain a JWT by following the real auth flow:
 *   POST /auth/challenge  → { challengeId, message }
 *   POST /auth/login      → { accessToken }
 *
 * The signature sent to /auth/login must be the JSON payload that
 * verifySignature() expects: { publicKey, signature, address }.
 */
async function loginWith(privateKey: string): Promise<string> {
  const account = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(privateKey) });
  const walletAddress = account.accountAddress.toString();

  // Step 1 – request a challenge
  const challengeRes = await request(app)
    .post("/auth/challenge")
    .send({ walletAddress })
    .expect(200);

  const { challengeId, message } = challengeRes.body as {
    challengeId: string;
    message: string;
  };

  // Step 2 – sign the challenge message
  const messageBytes = Buffer.from(message, "utf8");
  const rawSignature = account.sign(messageBytes);

  // verifySignature() expects a JSON string with publicKey + signature fields
  const signaturePayload = JSON.stringify({
    publicKey: account.publicKey.toString(),
    signature: rawSignature.toString(),
    address: walletAddress,
    message,
  });

  // Step 3 – login
  const loginRes = await request(app)
    .post("/auth/login")
    .send({ walletAddress, challengeId, signature: signaturePayload })
    .expect(200);

  return loginRes.body.accessToken as string;
}

// ─── Fixture: minimal JPEG buffer (1×1 white pixel) ─────────────────────────
// Used for image upload endpoints without needing a real image file.
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U" +
    "HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN" +
    "DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy" +
    "MjL/wAARCAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUE/8QAIRAAAg" +
    "ICAgMBAAAAAAAAAAAAAQIDBAURBhIhMUH/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEB" +
    "AAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8Amtu5LbV2sPDRW08MkkpVFUF3Y9AKb" +
    "pXN19xXAZ26xW5F5OmJJMa2iZvBP2BqnqHqW2s2jXHFBHJPNNKI0jjUszkngADyT9AK" +
    "o3Dru1w+OsHivpJpEiCSTxwxAuQBk4BOB/NZt3OtNakFKUoAUpSgBSlKAFKUoAUpSgD" +
    "/9k=",
  "base64"
);

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(async () => {
  [adminToken, userToken] = await Promise.all([
    loginWith(ADMIN_PRIVATE_KEY),
    loginWith(USER_PRIVATE_KEY),
  ]);
  // In test env, admin is also the issuer
  issuerToken = adminToken;
}, 30_000);

// ════════════════════════════════════════════════════════════════════════════
// WORKFLOW A — Listing WITH an existing passport
// ════════════════════════════════════════════════════════════════════════════

describe("Workflow A – List with passport", () => {
  let passportObjectAddress: string;
  const serial = uniqueSerial("WP");

  // ── A0: Mint a passport so we have one to list ───────────────────────────

  describe("A0 – Mint passport (prerequisite)", () => {
    it("prepareMint returns a signable payload", async () => {
      const res = await request(app)
        .post("/api/passports/mint/prepare")
        .set("Authorization", `Bearer ${issuerToken}`)
        .field("ownerAddress", userAccount.accountAddress.toString())
        .field("productName", "Test Bag A")
        .field("brand", "LuxBrand")
        .field("category", "Bags")
        .field("serialNumber", serial)
        .field("manufacturingDate", "2024-01-01")
        .field("materials", "leather")
        .field("countryOfOrigin", "Italy")
        .field("description", "Integration test bag")
        .field("transferable", "true")
        .attach("image", TINY_JPEG, { filename: "test.jpg", contentType: "image/jpeg" })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.payload.function).toContain("mint");

      // Sign and submit on devnet
      const txHash = await signAndSubmit(aptos, adminAccount, res.body.payload);
      expect(txHash).toBeTruthy();
    }, 60_000);

    it("passport is discoverable by product id after mint", async () => {
      const res = await request(app)
        .get(`/api/passports/by-product/${serial}`)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.product.serialNumberPlain).toBe(serial);
      passportObjectAddress = res.body.product.passportObjectAddr;
      expect(passportObjectAddress).toBeTruthy();
    }, 30_000);
  });

  // ── A1: User initiates listing (list_passport: ACTIVE → STORING) ─────────

  describe("A1 – User initiates listing", () => {
    it("prepareListPassport returns a signable payload", async () => {
      const res = await request(app)
        .post("/api/passports/list/passport-prepare")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ passportObjectAddress })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.payload.function).toContain("list_passport");
    });

    it("rejects missing passportObjectAddress", async () => {
      await request(app)
        .post("/api/passports/list/passport-prepare")
        .set("Authorization", `Bearer ${userToken}`)
        .send({})
        .expect(400);
    });

    it("recordListPassport creates a listing entry in the database", async () => {
      // First prepare + sign
      const prepRes = await request(app)
        .post("/api/passports/list/passport-prepare")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ passportObjectAddress })
        .expect(200);

      const txHash = await signAndSubmit(aptos, userAccount, prepRes.body.payload);

      const recRes = await request(app)
        .post("/api/passports/list/passport-record")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ txHash, passportObjectAddress })
        .expect(200);

      expect(recRes.body.success).toBe(true);
    }, 60_000);

    it("getListingByPassportAddress returns the new listing (status: storing)", async () => {
      const res = await request(app)
        .post("/api/passports/listings/getByPassportAddress")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ passportObjectAddress })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.payload.passport_object_address).toBe(passportObjectAddress);
      expect(res.body.payload.status).toBe("pending");
    });
  });

  // ── A2: Admin receives product (STORING → VERIFYING) ─────────────────────

  describe("A2 – Admin receives passport", () => {
    it("receivePassport returns a set_status payload targeting VERIFYING", async () => {
      const res = await request(app)
        .post("/api/passports/receive/passport")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ passportObjectAddress })
        .expect(200);

      expect(res.body.success).toBe(true);
      // newStatus in functionArguments should be 5 (STATUS_VERIFYING)
      const args = res.body.payload.functionArguments;
      expect(args).toContain(5);
    });

    it("non-admin cannot call receive/passport", async () => {
      await request(app)
        .post("/api/passports/receive/passport")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ passportObjectAddress })
        .expect(403);
    });

    it("recordSetStatus updates listing status to verifying after admin signs", async () => {
      // Prepare
      const prepRes = await request(app)
        .post("/api/passports/receive/passport")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ passportObjectAddress })
        .expect(200);

      const txHash = await signAndSubmit(aptos, adminAccount, prepRes.body.payload);

      const recRes = await request(app)
        .post("/api/passports/status/record")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ txHash, passportObjectAddress })
        .expect(200);

      expect(recRes.body.success).toBe(true);

      // Verify listing status updated
      const listRes = await request(app)
        .post("/api/passports/listings/getByPassportAddress")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ passportObjectAddress })
        .expect(200);

      expect(listRes.body.payload.status).toBe("verifying");
    }, 60_000);
  });

  // ── A3: Admin verifies and lists (VERIFYING → LISTING) ───────────────────

  describe("A3 – Admin verifies passport → LISTING", () => {
    it("verifyPassport returns a set_status payload targeting LISTING", async () => {
      const res = await request(app)
        .post("/api/passports/verify/passport")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ passportObjectAddress })
        .expect(200);

      expect(res.body.success).toBe(true);
      const args = res.body.payload.functionArguments;
      expect(args).toContain(6); // STATUS_LISTING = 6
    });

    it("full verify + record flow sets listing status to listed", async () => {
      const prepRes = await request(app)
        .post("/api/passports/verify/passport")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ passportObjectAddress })
        .expect(200);

      const txHash = await signAndSubmit(aptos, adminAccount, prepRes.body.payload);

      const recRes = await request(app)
        .post("/api/passports/status/record")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ txHash, passportObjectAddress })
        .expect(200);

      expect(recRes.body.success).toBe(true);

      const listRes = await request(app)
        .post("/api/passports/listings/getByPassportAddress")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ passportObjectAddress })
        .expect(200);

      expect(listRes.body.payload.status).toBe("listed");
    }, 60_000);
  });

  // ── A4: Delist flow ───────────────────────────────────────────────────────

  describe("A4 – Delist flow (request → approve → receipt)", () => {

    it("requestDelist creates a delist_request entry", async () => {
      const shippingInfo = {
        passportObjectAddress,
        fullName: "Test User",
        addressLine1: "123 Main St",
        city: "Singapore",
        state: "SG",
        postalCode: "123456",
        country: "Singapore",
      };
      const res = await request(app)
        .post("/api/passports/delist/request")
        .set("Authorization", `Bearer ${userToken}`)
        .send(shippingInfo)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it("getDelistingByPassportAddress returns the pending delist request", async () => {
      const res = await request(app)
        .post("/api/passports/de-listings/getByPassportAddress")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ passportObjectAddress })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.payload.status).toBe("pending");
    });

    it("non-admin cannot call delist/approve", async () => {
      await request(app)
        .post("/api/passports/delist/approve")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ passportObjectAddress })
        .expect(403);
    });

    it("approveDelistHandler returns set_status(RETURNING) payload", async () => {
      const res = await request(app)
        .post("/api/passports/delist/approve")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ passportObjectAddress })
        .expect(200);

      console.log("passportObjectAddress used for delist:", passportObjectAddress);
      expect(res.body.success).toBe(true);
      // STATUS_RETURNING = 7
      const args = res.body.payload.functionArguments;
      expect(args).toContain(7);
    });

    it("full approve → record flow marks delist and listing as returning", async () => {
      const prepRes = await request(app)
        .post("/api/passports/delist/approve")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ passportObjectAddress })
        .expect(200);

      const txHash = await signAndSubmit(aptos, adminAccount, prepRes.body.payload);

      const recRes = await request(app)
        .post("/api/passports/status/record")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ txHash, passportObjectAddress })
        .expect(200);

      expect(recRes.body.success).toBe(true);

      const delistRes = await request(app)
        .post("/api/passports/de-listings/getByPassportAddress")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ passportObjectAddress })
        .expect(200);

      expect(delistRes.body.payload.status).toBe("returning");
    }, 60_000);

    it("prepareConfirmReceipt returns delist_passport payload", async () => {
      const res = await request(app)
        .post("/api/passports/receipt/prepare")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ passportObjectAddress })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.payload.function).toContain("delist_passport");
    });

    it("full receipt prepare → record closes listing and delist request", async () => {
      const prepRes = await request(app)
        .post("/api/passports/receipt/prepare")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ passportObjectAddress })
        .expect(200);

      const txHash = await signAndSubmit(aptos, userAccount, prepRes.body.payload);

      const recRes = await request(app)
        .post("/api/passports/receipt/record")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ txHash, passportObjectAddress })
        .expect(200);

      expect(recRes.body.success).toBe(true);

      // Listing → returned/closed
      const listRes = await request(app)
        .post("/api/passports/listings/getByPassportAddress")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ passportObjectAddress })
        .expect(200);

      expect(listRes.body.payload.status).toBe("returned");

      // Delist → closed
      const delistRes = await request(app)
        .post("/api/passports/de-listings/getByPassportAddress")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ passportObjectAddress })
        .expect(200);

      expect(delistRes.body.payload.status).toBe("closed");
    }, 60_000);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// WORKFLOW B — Listing WITHOUT a passport
// ════════════════════════════════════════════════════════════════════════════

describe("Workflow B – List without passport", () => {
  /** Temporary placeholder address the backend generates for no-passport listings. */
  let tempObjectAddress: string;
  /** Real passport minted by admin during verification. */
  let mintedPassportAddress: string;
  const serial = uniqueSerial("NP");

  // ── B1: User submits listing request with no passport ────────────────────

  describe("B1 – User submits no-passport listing request", () => {
    it("requestListingNoPassport creates a pending listing with a temp address", async () => {
      const res = await request(app)
        .post("/api/passports/list/no-passport-record")
        .set("Authorization", `Bearer ${userToken}`)
        .send()
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.tempObjectAddress).toBeTruthy();
      tempObjectAddress = res.body.tempObjectAddress;
      console.log("Temp object address:"+tempObjectAddress);
    });

    it("getListingByStatus returns pending listings", async () => {
      const res = await request(app)
        .post("/api/passports/listings/getByStatus")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "pending" })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.payload)).toBe(true);
      const match = (res.body.payload as any[]).find(
        (l) => l.passport_object_address.trim() === tempObjectAddress.trim()
      );
      
      expect(match).toBeDefined();
    });
  });

  // ── B2: Admin receives the physical product ───────────────────────────────

  describe("B2 – Admin receives product (no passport)", () => {
    it("receiveNoPassport updates listing status to verifying", async () => {
      const res = await request(app)
        .post("/api/passports/receive/no-passport")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ tempObjectAddress, status: "verifying" })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it("non-admin cannot call receive/no-passport", async () => {
      await request(app)
        .post("/api/passports/receive/no-passport")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ tempObjectAddress, status: "verifying" })
        .expect(403);
    });

    it("rejects invalid status values", async () => {
      await request(app)
        .post("/api/passports/receive/no-passport")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ tempObjectAddress, status: "listed" }) // only 'verifying' allowed here
        .expect(400);
    });

    it("listing status is now verifying", async () => {
      const res = await request(app)
        .post("/api/passports/listings/getByPassportAddress")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ passportObjectAddress: tempObjectAddress })
        .expect(200);

      expect(res.body.payload.passport_object_address).toBe(tempObjectAddress);
      expect(res.body.payload.status).toBe("verifying");
    });
  });

  // ── B3: Admin mints passport for verified product ─────────────────────────

  describe("B3 – Admin mints listing passport (mint_listing)", () => {
    it("prepareMintListPassport returns a mint_listing payload", async () => {
      console.log("tempObjectAddress used in mintlisting:"+tempObjectAddress);
      const res = await request(app)
        .post("/api/passports/verify/no-passport")
        .set("Authorization", `Bearer ${adminToken}`)
        .field("tempObjectAddress", tempObjectAddress)
        .field("productName", "Test Bag B")
        .field("brand", "LuxBrand")
        .field("category", "Bags")
        .field("serialNumber", serial)
        .field("manufacturingDate", "2024-03-01")
        .field("materials", "canvas,leather")
        .field("countryOfOrigin", "France")
        .field("description", "No-passport integration test bag")
        .attach("image", TINY_JPEG, { filename: "test.jpg", contentType: "image/jpeg" })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.payload.function).toContain("mint_listing");
    });

    it("recordMintListPassport links passport to listing and sets status to listed", async () => {
      // Prepare
      const prepRes = await request(app)
        .post("/api/passports/verify/no-passport")
        .set("Authorization", `Bearer ${adminToken}`)
        .field("tempObjectAddress", tempObjectAddress)
        .field("productName", "Test Bag B")
        .field("brand", "LuxBrand")
        .field("category", "Bags")
        .field("serialNumber", serial)
        .field("manufacturingDate", "2024-03-01")
        .field("materials", "canvas")
        .field("countryOfOrigin", "France")
        .field("description", "No-passport integration test bag")
        .attach("image", TINY_JPEG, { filename: "test.jpg", contentType: "image/jpeg" })
        .expect(200);

      const txHash = await signAndSubmit(aptos, adminAccount, prepRes.body.payload);

      // Discover the new passport address from the transaction
      const txInfo = await aptos.getTransactionByHash({ transactionHash: txHash });
      // The minted passport address is in the event — for integration tests we
      // look it up via by-product instead.
      const byProductRes = await request(app)
        .get(`/api/passports/by-product/${serial}`)
        .expect(200);
      mintedPassportAddress = byProductRes.body.product.passportObjectAddr;

      // Record
      const recRes = await request(app)
        .post("/api/passports/verify/no-passport-record")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          txHash,
          tempPassportObjectAddress: tempObjectAddress,
          passportObjectAddress: mintedPassportAddress,
          ownerAddress: userAccount.accountAddress.toString(),
        })
        .expect(200);

      expect(recRes.body.success).toBe(true);

      // Listing should now be linked to the real passport and status = listed
      const listRes = await request(app)
        .post("/api/passports/listings/getByPassportAddress")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ passportObjectAddress: mintedPassportAddress })
        .expect(200);

      expect(listRes.body.payload.status).toBe("listed");
      expect(listRes.body.payload.passport_object_address).toBe(mintedPassportAddress);
    }, 20_000); // 20 seconds
  });

  // ── B4: Delist flow for no-passport listing ───────────────────────────────

  describe("B4 – Delist no-passport listing", () => {
    it("requestDelist works on the newly minted passport", async () => {
      const res = await request(app)
        .post("/api/passports/delist/request")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          passportObjectAddress: mintedPassportAddress,
          fullName: "No Passport User",
          addressLine1: "456 East St",
          city: "Singapore",
          state: "SG",
          postalCode: "654321",
          country: "Singapore",
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it("full delist approve → record closes the listing", async () => {
      const prepRes = await request(app)
        .post("/api/passports/delist/approve")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ passportObjectAddress: mintedPassportAddress })
        .expect(200);

      const txHash = await signAndSubmit(aptos, adminAccount, prepRes.body.payload);

      await request(app)
        .post("/api/passports/status/record")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ txHash, passportObjectAddress: mintedPassportAddress })
        .expect(200);

      // User confirms receipt (delist_passport on-chain)
      const receiptPrepRes = await request(app)
        .post("/api/passports/receipt/prepare")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ passportObjectAddress: mintedPassportAddress })
        .expect(200);

      const receiptTxHash = await signAndSubmit(
        aptos,
        userAccount,
        receiptPrepRes.body.payload
      );

      const receiptRecRes = await request(app)
        .post("/api/passports/receipt/record")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ txHash: receiptTxHash, passportObjectAddress: mintedPassportAddress })
        .expect(200);

      expect(receiptRecRes.body.success).toBe(true);

      // Confirm statuses
      const listRes = await request(app)
        .post("/api/passports/listings/getByPassportAddress")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ passportObjectAddress: mintedPassportAddress })
        .expect(200);

      expect(listRes.body.payload.status).toBe("returned");
    }, 120_000);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// SHARED EDGE CASES & AUTH GUARDS
// ════════════════════════════════════════════════════════════════════════════

describe("Auth guards and input validation", () => {
  it("returns 401 for unauthenticated requests to protected endpoints", async () => {
    await request(app)
      .post("/api/passports/list/passport-prepare")
      .send({ passportObjectAddress: "0x1234" })
      .expect(401);
  });

  it("returns 403 when a regular user calls an ADMIN-only endpoint", async () => {
    await request(app)
      .post("/api/passports/receive/passport")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ passportObjectAddress: "0x1234" })
      .expect(403);
  });

  it("returns 400 when required fields are missing from status/prepare", async () => {
    await request(app)
      .post("/api/passports/status/prepare")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ passportObjectAddress: "0x1234" }) // missing newStatus
      .expect(400);
  });

  it("returns 400 when required fields are missing from status/record", async () => {
    await request(app)
      .post("/api/passports/status/record")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ passportObjectAddress: "0x1234" }) // missing txHash
      .expect(400);
  });

  it("returns 400 when required fields are missing from delist/request", async () => {
    await request(app)
      .post("/api/passports/delist/request")
      .set("Authorization", `Bearer ${userToken}`)
      .send({}) // missing passportObjectAddress
      .expect(400);
  });

  it("returns 400 when required fields are missing from receipt/record", async () => {
    await request(app)
      .post("/api/passports/receipt/record")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ passportObjectAddress: "0x1234" }) // missing txHash
      .expect(400);
  });

  it("returns 400 when getListingByStatus is called without status", async () => {
    await request(app)
      .post("/api/passports/listings/getByStatus")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({})
      .expect(400);
  });

  it("returns 400 when getDelistingsByStatus is called without status", async () => {
    await request(app)
      .post("/api/passports/de-listings/getByStatus")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({})
      .expect(400);
  });

  it("GET /api/passports/:addr returns 404 for a non-existent passport", async () => {
    // Random well-formed Aptos address that was never minted
    await request(app)
      .get("/api/passports/0x" + "ab".repeat(32))
      .expect(404);
  });

  it("GET /api/passports/by-product/:id returns 404 for unknown serial", async () => {
    await request(app)
      .get("/api/passports/by-product/DOES_NOT_EXIST_XYZ")
      .expect(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// METADATA UPDATE
// ════════════════════════════════════════════════════════════════════════════

describe("Metadata update flow", () => {
  /** Reuses the first passport minted in Workflow A — adjust if test order changes. */
  it("prepareUpdateMetadata returns a signable payload", async () => {
    // We need at least one live passport address; skip gracefully if not available
    const discoverRes = await request(app)
      .post("/api/passports/listings/getByStatus")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "listed" });

    if (!discoverRes.body.success || !discoverRes.body.payload?.length) {
      console.warn("[skip] No listed passports found; skipping metadata update test.");
      return;
    }

    const addr = discoverRes.body.payload[0].passport_object_address;

    const res = await request(app)
      .post("/api/passports/metadata/prepare")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("passportObjectAddress", addr)
      .field("productName", "Updated Bag")
      .field("brand", "LuxBrand")
      .field("category", "Bags")
      .field("serialNumber", "UPDATED-SN-001")
      .field("manufacturingDate", "2024-06-01")
      .field("materials", "nylon")
      .field("countryOfOrigin", "Japan")
      .field("description", "After refurbishment")
      .attach("image", TINY_JPEG, { filename: "new.jpg", contentType: "image/jpeg" })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.payload.function).toContain("update_metadata");
    expect(res.body.metadataIpfsUri).toBeTruthy();
  }, 30_000);

  it("recordUpdateMetadata requires both txHash and passportObjectAddress", async () => {
    await request(app)
      .post("/api/passports/metadata/record")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ passportObjectAddress: "0x1234" }) // missing txHash
      .expect(400);
  });
});