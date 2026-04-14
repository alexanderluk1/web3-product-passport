/**
 * Full backend escrow happy-path verification script.
 *
 * Exercises: auth → mint_listing (on-chain) → DB listing record →
 * escrow create_listing prepare/sign/record → marketplace browse →
 * purchase prepare/sign/record → verify DB state.
 *
 * Run:  tsx --env-file=.env scripts/test-escrow-flow.ts
 */

import {
  Account,
  Aptos,
  AptosConfig,
  Ed25519PrivateKey,
  Network,
} from "@aptos-labs/ts-sdk";

const BASE = "http://localhost:3001";
const MODULE_ADDRESS = process.env.MODULE_ADDRESS!;
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS!;
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY!;

// ── Helpers ──────────────────────────────────────────────────────

const adminAccount = Account.fromPrivateKey({
  privateKey: new Ed25519PrivateKey(ADMIN_PRIVATE_KEY),
});
const adminAddr = adminAccount.accountAddress.toStringLong().toLowerCase();

const aptos = new Aptos(
  new AptosConfig({ network: Network.DEVNET }),
);

async function getJwt(account: Account): Promise<string> {
  const walletAddress = account.accountAddress.toStringLong();

  // 1. Challenge
  const chalRes = await fetch(`${BASE}/auth/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  });
  const chalData = (await chalRes.json()) as any;
  if (!chalData.challengeId) {
    throw new Error(`Challenge failed: ${JSON.stringify(chalData)}`);
  }
  const { challengeId, message } = chalData;

  // 2. Sign the message with Ed25519
  const messageBytes = new TextEncoder().encode(message);
  const sig = account.sign(messageBytes);

  // Build signature payload matching verifySignature expectations
  const signaturePayload = JSON.stringify({
    publicKey: account.publicKey.toString(),
    signature: sig.toString(),
    type: "ed25519_signature",
    message,
    address: walletAddress,
  });

  // 3. Login
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, challengeId, signature: signaturePayload }),
  });
  const loginData = (await loginRes.json()) as any;
  if (!loginData.accessToken) {
    throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
  }

  console.log(`  ✓ Auth as ${loginData.user.role} (${walletAddress.slice(0, 10)}…)`);
  return loginData.accessToken;
}

async function post(path: string, body: object, jwt?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (jwt) headers["Authorization"] = `Bearer ${jwt}`;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return res.json() as Promise<any>;
}

async function get(path: string, jwt?: string) {
  const headers: Record<string, string> = {};
  if (jwt) headers["Authorization"] = `Bearer ${jwt}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  return res.json() as Promise<any>;
}

async function signAndSubmit(
  account: Account,
  payload: { function: string; functionArguments: any[] },
): Promise<string> {
  const tx = await aptos.transaction.build.simple({
    sender: account.accountAddress,
    data: {
      function: payload.function as `${string}::${string}::${string}`,
      functionArguments: payload.functionArguments,
    },
  });
  const committed = await aptos.signAndSubmitTransaction({ signer: account, transaction: tx });
  await aptos.waitForTransaction({ transactionHash: committed.hash });
  return committed.hash;
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// ── Main flow ────────────────────────────────────────────────────

async function main() {
  console.log("\n=== Escrow Backend Happy Path Test ===\n");
  console.log(`Admin:    ${adminAddr}`);
  console.log(`Module:   ${MODULE_ADDRESS}`);
  console.log(`Registry: ${REGISTRY_ADDRESS}\n`);

  // 1. Auth admin
  console.log("1. Authenticate admin");
  const adminJwt = await getJwt(adminAccount);

  // 2. Create DB listing first to get the temp address
  console.log("\n2. Create DB listing (no-passport flow)");
  const listRes = await post("/api/passports/list/no-passport-record", {}, adminJwt);
  assert(listRes.success, `Create listing: ${listRes.error}`);
  const tempAddr = listRes.tempObjectAddress;
  console.log(`  ✓ DB listing created: temp=${tempAddr.slice(0, 24)}…`);

  // Admin receives item
  const receiveRes = await post("/api/passports/receive/no-passport", {
    tempObjectAddress: tempAddr,
    status: "verifying",
  }, adminJwt);
  console.log(`  ✓ Admin received: ${receiveRes.success ? "ok" : receiveRes.error}`);

  // 3. Admin mints passport on-chain — uses the DB temp address as placeholder
  //    so recordMintListPassport can match the event's old_address to the DB record.
  console.log("\n3. Admin mints passport at STATUS_LISTING (on-chain)");
  const serial = `ESCROW-TEST-${Date.now()}`;
  const txHash = await signAndSubmit(adminAccount, {
    function: `${MODULE_ADDRESS}::passport::mint_listing`,
    functionArguments: [
      REGISTRY_ADDRESS,
      adminAddr,  // owner = admin (acts as seller)
      Array.from(Buffer.from(serial, "utf8")),
      `ipfs://QmTestEscrowHappyPath`,
      Array.from(Buffer.from("{}", "utf8")),
      tempAddr,  // MUST match DB temp address for record step to find it
    ],
  });
  console.log(`  ✓ mint_listing tx: ${txHash.slice(0, 16)}…`);

  // Get passport address from chain
  const [passportAddr] = (await aptos.view({
    payload: {
      function: `${MODULE_ADDRESS}::passport::passport_address_for_product_id` as `${string}::${string}::${string}`,
      functionArguments: [REGISTRY_ADDRESS, Array.from(Buffer.from(serial, "utf8"))],
    },
  })) as string[];
  console.log(`  ✓ Passport: ${passportAddr.slice(0, 16)}…`);

  // Record the mint_listing tx — this updates temp→real passport address in DB + sets status=listed
  const mintRecordRes = await post("/api/passports/verify/no-passport-record", {
    txHash,
    ownerAddress: adminAddr,
  }, adminJwt);
  assert(mintRecordRes.success, `Mint record: ${mintRecordRes.error}`);
  console.log(`  ✓ Mint recorded: ${mintRecordRes.message}`);

  // 4. Prepare escrow listing
  console.log("\n4. Prepare escrow listing (set price 0.5 APT)");
  const priceOctas = "50000000"; // 0.5 APT
  const prepareListRes = await post("/api/escrow/listing/prepare", {
    passportObjectAddress: passportAddr,
    priceOctas,
  }, adminJwt);

  if (!prepareListRes.success) {
    console.log(`  ✗ Prepare failed: ${prepareListRes.error}`);
    // The DB listing might not be in the right state. Let's check.
    const listing = await get(`/api/passports/listings/address/${passportAddr}`, adminJwt);
    console.log(`  DB listing state: ${JSON.stringify(listing)}`);
    throw new Error("Prepare escrow listing failed");
  }
  console.log(`  ✓ Payload: ${prepareListRes.payload.function}`);

  // 5. Sign and submit create_listing tx
  console.log("\n5. Sign and submit create_listing");
  const escrowTxHash = await signAndSubmit(adminAccount, prepareListRes.payload);
  console.log(`  ✓ create_listing tx: ${escrowTxHash.slice(0, 16)}…`);

  // 6. Record escrow listing
  console.log("\n6. Record escrow listing in DB");
  const recordListRes = await post("/api/escrow/listing/record", {
    txHash: escrowTxHash,
    passportObjectAddress: passportAddr,
    priceOctas,
  }, adminJwt);
  assert(recordListRes.success, `Record listing: ${recordListRes.error}`);
  console.log(`  ✓ ${recordListRes.message}`);

  // 7. Browse marketplace
  console.log("\n7. Browse marketplace");
  const marketRes = await get("/api/escrow/marketplace");
  assert(marketRes.success, "Marketplace fetch failed");
  const found = marketRes.payload.find(
    (l: any) => l.passportObjectAddress === passportAddr.toLowerCase(),
  );
  assert(!!found, "Listing not found in marketplace");
  console.log(`  ✓ Found in marketplace: price=${found.priceOctas} octas, inEscrow=${found.inEscrow}`);

  // 8. View single listing
  console.log("\n8. View escrow listing detail");
  const detailRes = await get(`/api/escrow/listing/${passportAddr}`);
  assert(detailRes.success, "Listing detail failed");
  assert(detailRes.payload.isActive === true, "Listing should be active");
  console.log(`  ✓ seller=${detailRes.payload.seller.slice(0, 10)}… price=${detailRes.payload.priceOctas} active=${detailRes.payload.isActive}`);

  // 9. Purchase (admin buys own listing — self-purchase should fail)
  console.log("\n9. Verify self-purchase blocked");
  const selfBuyRes = await post("/api/escrow/purchase/prepare", {
    passportObjectAddress: passportAddr,
  }, adminJwt);
  assert(!selfBuyRes.success, "Self-purchase should be blocked");
  console.log(`  ✓ Self-purchase correctly blocked: "${selfBuyRes.error}"`);

  // For a real purchase test, we'd need a separate buyer account with JWT.
  // Since the admin is both minter and seller here, we'll create a buyer.
  console.log("\n10. Create buyer account and purchase");
  const buyerAccount = Account.generate();
  // Fund buyer
  await aptos.fundAccount({ accountAddress: buyerAccount.accountAddress, amount: 200_000_000 });
  console.log(`  ✓ Buyer funded: ${buyerAccount.accountAddress.toStringLong().slice(0, 16)}…`);

  const buyerJwt = await getJwt(buyerAccount);

  // Prepare purchase
  const prepBuyRes = await post("/api/escrow/purchase/prepare", {
    passportObjectAddress: passportAddr,
  }, buyerJwt);
  assert(prepBuyRes.success, `Purchase prepare: ${prepBuyRes.error}`);
  console.log(`  ✓ Purchase payload ready, price=${prepBuyRes.priceOctas}`);

  // Sign and submit purchase
  const purchaseTxHash = await signAndSubmit(buyerAccount, prepBuyRes.payload);
  console.log(`  ✓ purchase tx: ${purchaseTxHash.slice(0, 16)}…`);

  // Record purchase
  const recordBuyRes = await post("/api/escrow/purchase/record", {
    txHash: purchaseTxHash,
    passportObjectAddress: passportAddr,
  }, buyerJwt);
  assert(recordBuyRes.success, `Purchase record: ${recordBuyRes.error}`);
  console.log(`  ✓ ${recordBuyRes.message}`);

  // 11. Verify final state
  console.log("\n11. Verify final state");

  // On-chain: buyer owns passport
  const ownerRes = await fetch(
    `https://fullnode.devnet.aptoslabs.com/v1/accounts/${passportAddr}/resource/0x1::object::ObjectCore`,
  );
  const ownerData = (await ownerRes.json()) as any;
  const finalOwner = ownerData.data?.owner?.toLowerCase();
  const buyerAddr = buyerAccount.accountAddress.toStringLong().toLowerCase();
  assert(finalOwner === buyerAddr, `Owner mismatch: ${finalOwner} !== ${buyerAddr}`);
  console.log(`  ✓ On-chain owner = buyer`);

  // Escrow listing inactive
  const finalListing = await get(`/api/escrow/listing/${passportAddr}`);
  assert(finalListing.payload.isActive === false, "Listing should be inactive");
  console.log(`  ✓ Escrow listing inactive`);

  // Marketplace should no longer show it (in_escrow=false)
  const finalMarket = await get("/api/escrow/marketplace");
  const stillListed = finalMarket.payload.find(
    (l: any) => l.passportObjectAddress === passportAddr.toLowerCase(),
  );
  assert(!stillListed, "Sold item should not appear in marketplace");
  console.log(`  ✓ Removed from marketplace browse`);

  // Buyer's purchases
  const myPurchases = await get("/api/escrow/purchases/mine", buyerJwt);
  assert(myPurchases.success, "My purchases failed");
  assert(myPurchases.payload.length > 0, "Buyer should have a purchase");
  console.log(`  ✓ Buyer has ${myPurchases.payload.length} purchase(s)`);

  // 12. Test delivery request
  console.log("\n12. Request physical delivery");
  const deliveryRes = await post("/api/escrow/delivery/request", {
    passportObjectAddress: passportAddr,
    addressLine1: "123 Test Street",
    city: "Singapore",
    postalCode: "123456",
    country: "Singapore",
  }, buyerJwt);
  assert(deliveryRes.success, `Delivery request: ${deliveryRes.error}`);
  console.log(`  ✓ ${deliveryRes.message}`);

  console.log("\n========================================");
  console.log("  ALL TESTS PASSED ✓");
  console.log("========================================\n");
}

main().catch((err) => {
  console.error("\n✗ TEST FAILED:", err.message ?? err);
  process.exit(1);
});
