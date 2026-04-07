# Test Suite — Marketplace Listing Backend

Three TypeScript test files covering all bug fixes and new features, plus one Move test file for the smart contract.

---

## Files

| File | What it tests |
|---|---|
| `listing_repository.test.ts` | DB layer — `createListingRequest` two-step no-passport insert, `updateListingRequestOwner` snake_case column, `updateListingRequestPassportAddress` atomic temp→real swap, `updateDelistRequestAddress` address fields only, `DelistRequestStatus` union |
| `passport_service_listing.test.ts` | Service layer — `recordListPassport` seller address via `getPassportOwner`, `submitListingRequest` off-chain only, `updateNoPassportListingStatus` guards, `prepareMintListPassport` listing validation, `recordMintListPassport` tx verification, `recordSetStatus` integer→string map, `recordTransferPassport` owner update, `requestDelist`, `markDelistProcessed`, `prepareConfirmReceipt`, `recordConfirmReceipt` |
| `passport_controller_handlers.test.ts` | Controller layer — `receivePassportHandler` hardcodes STATUS_VERIFYING, `verifyPassportHandler` hardcodes STATUS_LISTING, `requestListingNoPassport`, `receiveNoPassportHandler` status guard, `prepareMintListPassportHandler`, `recordMintListPassportHandler` all-4-fields validation, `approveDelistHandler`, `prepareConfirmReceiptHandler`, `recordConfirmReceiptHandler` |
| `passport_tests.move` | Move smart contract — all entry functions, error codes, status transitions, two end-to-end workflow tests |

---

## Setup

Install Vitest if not already present:

```bash
npm install --save-dev vitest
```

Add to your `package.json` scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Add a `vitest.config.ts` at the project root:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
```

Run all tests:

```bash
npx vitest run
```

Run a single file:

```bash
npx vitest run src/modules/passport/repository/listing_repository.test.ts
```

---

## Mocking strategy

All TypeScript tests use **Vitest's `vi.mock`** — no real database or blockchain connection is needed.

| Dependency | How it is mocked |
|---|---|
| `../../../config/db` | Fluent Knex builder — captures column names and values passed to `.insert()` and `.update()` |
| `../../../chains/luxpass/readers` | `getPassport`, `getPassportOwner` |
| `../repository/listing_repository` | All repo functions |
| `../store/productStore` | `clearIssuerProductsFromStore` |
| `global.fetch` | Simulated Aptos fullnode responses |
| `../services/passport.service` | Full `passportListingService` object (controller tests only) |

---

## Coverage summary

### Repository (`listing_repository.test.ts`)
- `createListingRequest` with passport: single insert, `owner_address` column, `.returning("*")`
- `createListingRequest` without passport: two inserts — first gets `id`, second uses deterministic `temp_<sha256>` placeholder derived from owner address + id
- `updateListingRequestOwner`: `owner_address` (snake_case) is written, not `ownerAddress`
- `updateListingRequestPassportAddress`: one `.update()` atomically sets `passport_object_address`, `has_passport=true`, and `status="listed"`; queries by `passport_object_address`, not `id`
- `updateListingRequestStatus`: all 6 valid statuses; lowercases address before querying
- `createDelistRequest`: normalises addresses to lowercase, stores `null` for omitted `address_line2`
- `updateDelistRequestStatus`: all three values `"pending" | "processed" | "closed"`
- `updateDelistRequestAddress`: updates address fields only — asserts `status` is absent from the update payload

### Service (`passport_service_listing.test.ts`)
- `recordListPassport`: calls `getPassportOwner` and passes result as third argument to `createListingRequest(true, ownerAddr, passportAddr)`; best-effort — succeeds even if DB throws
- `submitListingRequest`: calls `createListingRequest(false, normalizedAddress)`, never touches `fetch`; returns failure message when DB throws
- `updateNoPassportListingStatus`: rejects statuses other than `"verifying"` or `"listed"`; returns failure when DB throws
- `prepareMintListPassport`: rejects when listing status is not `"verifying"`; rejects when `has_passport=true`; uses `listing.owner_address` as the mint owner
- `recordMintListPassport`: verifies the tx function name is `PASSPORT_MINTLIST_FN`; calls `updateListingRequestPassportAddress(tempAddr, realAddr)`; best-effort on DB failure
- `recordSetStatus`: maps `STATUS_STORING→"pending"`, `STATUS_VERIFYING→"verifying"`, `STATUS_LISTING→"listed"`, `STATUS_RETURNING→"returning"`; also calls `updateDelistRequestStatus(..., "closed")` when status is RETURNING
- `recordTransferPassport`: calls `updateListingRequestOwner` only when `passport.status === STATUS_LISTING`; does nothing for non-listed passports
- `requestDelist`: address fields required only at `STATUS_LISTING`; no address required at `STATUS_STORING`; owner check enforced
- `markDelistProcessed`: payload contains `STATUS_RETURNING (7)`; guards against missing and already-processed delist requests
- `prepareConfirmReceipt`: requires `STATUS_RETURNING`; checks caller is owner
- `recordConfirmReceipt`: writes `"closed"` to delist request and `"returned"` to listing; best-effort on DB failure

### Controller (`passport_controller_handlers.test.ts`)
- `receivePassportHandler`: injects `newStatus=5` before calling `prepareSetStatus`; passes `callerWalletAddress` and `callerRole` from `req.user`
- `verifyPassportHandler`: injects `newStatus=6` before calling `prepareSetStatus`
- `requestListingNoPassport`: passes `req.user.walletAddress` to `submitListingRequest`
- `receiveNoPassportHandler`: rejects missing `tempObjectAddress`; rejects any `status` other than `"verifying"` with the exact error message the controller sends
- `prepareMintListPassportHandler`: passes `adminWalletAddress` and `imageFile` to the service; error messages from service flow through to the 400 response
- `recordMintListPassportHandler`: parameterised test covers all 4 required fields (`txHash`, `passportObjectAddress`, `tempPassportObjectAddress`, `ownerAddress`) individually — each missing field triggers a 400 before the service is called
- `approveDelistHandler`: passes `callerRole` from `req.user.role`; both "no delist request" and "already processed" failures return 400 with the service error message
- `prepareConfirmReceiptHandler`: `passportObjectAddress` required; `callerWalletAddress` forwarded from `req.user`
- `recordConfirmReceiptHandler`: both `txHash` and `passportObjectAddress` required; error messages from service forwarded to response

### Move contract (`passport_tests.move`)
- `init_index` / `init_events`: succeed once, abort `E_ALREADY_INITIALIZED (1)` on second call
- `mint`: active status, transferable flag, correct issuer stored, serial indexed; aborts for non-issuer `(10)`, duplicate serial `(20)`, missing index `(3)`
- `mint_listing`: status is `STATUS_LISTING`, always transferable, issuer set to admin; aborts for non-admin `(11)`, duplicate serial `(20)`
- `transfer`: succeeds from `STATUS_ACTIVE` and `STATUS_LISTING`; aborts for non-owner `(12)`, non-transferable passport `(13)`, and `STATUS_STORING` `(13)`
- `list_passport`: sets `STATUS_STORING`; aborts for non-owner `(12)`, non-transferable `(13)`, already listed `(13)`
- `delist_passport`: restores `STATUS_ACTIVE`; aborts when not `STATUS_RETURNING` `(13)`, for non-owner `(12)`
- `set_status`: admin can set all 7 statuses; issuer can set non-marketplace statuses; aborts when issuer tries `STATUS_LISTING (11)`, `STATUS_STORING (11)`, or any status while passport is already in a marketplace state `(14)`; aborts for random addresses `(11)`
- `update_metadata`: admin and issuer can update; owner cannot `(11)`
- View functions: `passport_address_for_product_id` resolves correctly; aborts for unknown serial `(21)` and missing index `(3)`; `status_labels` returns correct constants
- Integration: full listing+return workflow (with passport) and no-passport `mint_listing` workflow
