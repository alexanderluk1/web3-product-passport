# LuxPass Marketplace API Reference

## Overview

All endpoints are prefixed with `/api/passports`. Authenticated endpoints require a Bearer JWT token in the `Authorization` header. Admin-only endpoints will return `403` if called by a non-admin user.

### Auth Roles
| Role | Capabilities |
|------|-------------|
| `USER` | Initiate listings, request delists, confirm receipt |
| `ADMIN` | Receive products, verify/mint, approve delists, set status |
| `ISSUER` | Mint passports, update metadata |

### Passport Status Codes (on-chain)
| Code | Name | Description |
|------|------|-------------|
| 1 | ACTIVE | Normal state |
| 4 | STORING | User has submitted passport for listing |
| 5 | VERIFYING | Admin has received the product |
| 6 | LISTING | Verified and listed on marketplace |
| 7 | RETURNING | Admin has approved delist, product being returned |

### Database Listing Statuses
| Status | Meaning |
|--------|---------|
| `pending` | Listing created, passport not yet received |
| `verifying` | Admin received product, under verification |
| `listed` | Verified, live on marketplace |
| `request_return` | User submitted delist request |
| `returning` | Admin approved return, product shipping back |
| `returned` | User confirmed receipt, listing closed |

---

## Workflow A — List WITH an Existing Passport

The user already owns a passport (minted NFT). They initiate listing by signing a transaction, then the admin verifies and approves.

```
User                              Backend                            Admin
 |                                   |                                  |
 |-- POST /list/passport-prepare --> |                                  |
 |<-- { payload } (sign this) ----  |                                  |
 |  [sign & submit on-chain]         |                                  |
 |-- POST /list/passport-record ---> | (creates DB listing, status: pending)
 |                                   |                                  |
 |                                   | <-- POST /receive/passport ------| 
 |                                   | --> { payload } (sign to verify) |
 |                                   |   [admin signs & submits]        |
 |                                   | <-- POST /status/record ---------| (status: verifying)
 |                                   |                                  |
 |                                   | <-- POST /verify/passport -------| 
 |                                   | --> { payload } (sign to list)   |
 |                                   |   [admin signs & submits]        |
 |                                   | <-- POST /status/record ---------| (status: listed)
 |                                   |                                  |
 |-- POST /delist/request ---------> | (creates delist_request entry)   |
 |                                   |                                  |
 |                                   | <-- POST /delist/approve --------| 
 |                                   | --> { payload } (sign returning) |
 |                                   |   [admin signs & submits]        |
 |                                   | <-- POST /status/record ---------| (status: returning)
 |                                   |                                  |
 |-- POST /receipt/prepare --------> |                                  |
 |<-- { payload } (sign this) -----  |                                  |
 |  [sign & submit on-chain]         |                                  |
 |-- POST /receipt/record ---------->| (status: returned, delist: closed)
```

---

### A1 — User Initiates Listing

#### `POST /list/passport-prepare`
**Auth:** USER · **Purpose:** Returns a transaction payload for the user to sign, which sets the passport status to STORING on-chain.

**Request Body (JSON)**
```json
{
  "passportObjectAddress": "0xabc..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `passportObjectAddress` | `string` | ✅ | On-chain address of the passport object |

**Success Response `200`**
```json
{
  "success": true,
  "payload": {
    "function": "0x...::passport::list_passport",
    "functionArguments": ["passport_address", "registry_address"]
  }
}
```

**Error Responses**
| Status | Cause |
|--------|-------|
| `400` | Missing `passportObjectAddress`, passport not found, caller is not owner, passport is non-transferable |
| `401` | Missing or invalid token |

---

#### `POST /list/passport-record`
**Auth:** USER · **Purpose:** Confirms the `list_passport` transaction succeeded on-chain and creates a listing entry in the database.

**Request Body (JSON)**
```json
{
  "txHash": "0xabc...",
  "passportObjectAddress": "0xabc..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `txHash` | `string` | ✅ | Transaction hash from the signed `list_passport` transaction |
| `passportObjectAddress` | `string` | ✅ | On-chain passport object address |

**Success Response `200`**
```json
{
  "success": true,
  "message": "Listing Passport recorded successfully.",
  "passportObjectAddress": "0xabc..."
}
```

**Error Responses**
| Status | Cause |
|--------|-------|
| `400` | Invalid/missing `txHash`, tx not found on-chain, tx was not a `list_passport` call, DB insert failed |

---

### A2 — Admin Receives Passport

#### `POST /receive/passport`
**Auth:** ADMIN · **Purpose:** Returns a transaction payload for the admin to sign, setting the passport status to VERIFYING (5) on-chain. The database update happens when the admin subsequently calls `/status/record`.

**Request Body (JSON)**
```json
{
  "passportObjectAddress": "0xabc..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `passportObjectAddress` | `string` | ✅ | On-chain passport object address |

**Success Response `200`**
```json
{
  "success": true,
  "payload": {
    "function": "0x...::passport::set_status",
    "functionArguments": ["passport_address", "registry_address", 5(STATUS_VERIFYING)]
  }
}
```

**Error Responses**
| Status | Cause |
|--------|-------|
| `400` | Missing `passportObjectAddress` or passport not found on-chain |
| `403` | Caller is not ADMIN |

---

#### `POST /status/record`
**Auth:** USER or ADMIN · **Purpose:** Confirms a `set_status` transaction succeeded on-chain and updates the DB listing status accordingly. Used after `/receive/passport`, `/verify/passport`, and `/delist/approve`.

**Request Body (JSON)**
```json
{
  "txHash": "0xabc...",
  "passportObjectAddress": "0xabc..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `txHash` | `string` | ✅ | Transaction hash from the signed `set_status` transaction |
| `passportObjectAddress` | `string` | ✅ | On-chain passport object address |

**Success Response `200`**
```json
{
  "success": true,
  "message": "Status update recorded successfully."
}
```

**DB side effects:** Reads current on-chain status. If it is a marketplace status (STORING, VERIFYING, LISTING, RETURNING), it updates `listing_requests.status` to the corresponding DB value. If status is RETURNING, also updates `delist_requests.status` to `"returning"`.

**Error Responses**
| Status | Cause |
|--------|-------|
| `400` | Invalid `txHash`, tx not found, tx was not a `set_status` call |

---

### A3 — Admin Verifies Passport

#### `POST /verify/passport`
**Auth:** ADMIN · **Purpose:** Returns a transaction payload for the admin to sign, setting passport status to LISTING (6). Database update happens via `/status/record`.

**Request Body (JSON)**
```json
{
  "passportObjectAddress": "0xabc..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `passportObjectAddress` | `string` | ✅ | On-chain passport object address |

**Success Response `200`**
```json
{
  "success": true,
  "payload": {
    "function": "0x...::passport::set_status",
    "functionArguments": ["passport_address", "registry_address", 6(STATUS_LISTING)]
  }
}
```

**Error Responses**
| Status | Cause |
|--------|-------|
| `400` | Missing `passportObjectAddress` or passport not found |
| `403` | Caller is not ADMIN |

> **Next step:** Admin signs payload, submits on-chain, then calls `POST /status/record` with the resulting `txHash`.

---

### A4 — Delist Flow

#### `POST /delist/request`
**Auth:** USER · **Purpose:** User requests to withdraw their listing. Creates a `delist_request` DB entry and sets listing status to `request_return`. Passport must be in STORING or LISTING status on-chain.

**Request Body (JSON)**
```json
{
  "passportObjectAddress": "0xabc...",
  "addressLine1": "123 Main St",
  "addressLine2": "Unit 4",
  "city": "Singapore",
  "state": "SG",
  "postalCode": "123456",
  "country": "Singapore"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `passportObjectAddress` | `string` | ✅ | On-chain passport object address |
| `addressLine1` | `string` | ✅ if status=LISTING | Return shipping address line 1 |
| `addressLine2` | `string` | ❌ | Return shipping address line 2 |
| `city` | `string` | ✅ if status=LISTING | City |
| `state` | `string` | ❌ | State / region |
| `postalCode` | `string` | ✅ if status=LISTING | Postal code |
| `country` | `string` | ✅ if status=LISTING | Country |

> Shipping address fields are only required when the passport is already in LISTING status. If still in STORING status, they are optional.

**Success Response `200`**
```json
{
  "success": true,
  "message": "Delist request submitted. Admin will review and delist your passport."
}
```

**Error Responses**
| Status | Cause |
|--------|-------|
| `400` | Missing `passportObjectAddress`, passport not in STORING or LISTING status, caller is not passport owner, required address fields missing when status=LISTING |

---

#### `POST /delist/approve`
**Auth:** ADMIN · **Purpose:** Admin approves the delist request. Returns a transaction payload to set passport status to RETURNING (7). Database update is handled by the subsequent `/status/record` call.

**Request Body (JSON)**
```json
{
  "passportObjectAddress": "0xabc..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `passportObjectAddress` | `string` | ✅ | On-chain passport object address |

**Success Response `200`**
```json
{
  "success": true,
  "payload": {
    "function": "0x...::passport::set_status",
    "functionArguments": ["passport_address", "registry_address", 7(STATUS_LISTING)]
  }
}
```

**Error Responses**
| Status | Cause |
|--------|-------|
| `400` | No pending delist request found, delist request already processed |
| `403` | Caller is not ADMIN |

> **Next step:** Admin signs, submits on-chain, calls `POST /status/record`. This sets listing to `returning` and delist_request to `returning`.

---

#### `POST /receipt/prepare`
**Auth:** USER · **Purpose:** User confirms physical product was received. Returns a `delist_passport` transaction payload to set passport status back to ACTIVE on-chain. Passport must be in RETURNING status and caller must be current owner.

**Request Body (JSON)**
```json
{
  "passportObjectAddress": "0xabc..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `passportObjectAddress` | `string` | ✅ | On-chain passport object address |

**Success Response `200`**
```json
{
  "success": true,
  "payload": {
    "function": "0x...::passport::delist_passport",
    "functionArguments": ["passport_address", "registry_address"]
  }
}
```

**Error Responses**
| Status | Cause |
|--------|-------|
| `400` | Passport not in RETURNING status, caller is not passport owner |

---

#### `POST /receipt/record`
**Auth:** USER · **Purpose:** Confirms the `delist_passport` transaction succeeded and closes the listing and delist request in the database.

**Request Body (JSON)**
```json
{
  "txHash": "0xabc...",
  "passportObjectAddress": "0xabc..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `txHash` | `string` | ✅ | Transaction hash from the signed `delist_passport` transaction |
| `passportObjectAddress` | `string` | ✅ | On-chain passport object address |

**Success Response `200`**
```json
{
  "success": true,
  "message": "Receipt confirmed. Passport is now active."
}
```

**DB side effects:** Sets `listing_requests.status` → `returned` and `delist_requests.status` → `closed`.

**Error Responses**
| Status | Cause |
|--------|-------|
| `400` | Invalid `txHash`, tx not found, tx was not a `delist_passport` call, DB update failed |

---

## Workflow B — List WITHOUT a Passport

The user does not have an existing passport NFT. They submit a listing request, ship the physical product to LuxPass, and an admin mints a new passport for them during verification.

```
User                              Backend                            Admin
 |                                   |                                  |
 |-- POST /list/no-passport-record ->| (creates DB listing, status: pending)
 |<-- { tempObjectAddress } -------  | (temp placeholder address)       |
 |                                   |                                  |
 |  [ships physical product]         |                                  |
 |                                   |                                  |
 |                                   | <-- POST /receive/no-passport ---| 
 |                                   |   (status: verifying, DB only)   |
 |                                   |                                  |
 |                                   | <-- POST /verify/no-passport ----| (multipart)
 |                                   | --> { payload } (mint_listing)   |
 |                                   |   [admin signs & submits]        |
 |                                   | <-- POST /verify/no-passport-record
 |                                   |   (temp → real addr, status: listed)
 |                                   |                                  |
 |-- POST /delist/request ---------->|                                  |
 |      (same as Workflow A from here on)
```

---

### B1 — User Submits Listing Request

#### `POST /list/no-passport-record`
**Auth:** USER · **Purpose:** Creates a pending listing entry in the database without requiring an on-chain transaction. A deterministic temporary placeholder address is generated for tracking.

**Request Body:** None required.

**Success Response `200`**
```json
{
  "success": true,
  "message": "Listing request submitted. LuxPass will verify your item before listing.",
  "tempObjectAddress": "temp_17b304b680a44cd78df789091431a4b8d1f2af743c9a426df97ffa8be3aaaea8"
}
```

| Response Field | Description |
|----------------|-------------|
| `tempObjectAddress` | Save this — it is used in all subsequent no-passport workflow calls |

**Error Responses**
| Status | Cause |
|--------|-------|
| `400` | DB insert failed |
| `401` | Missing or invalid token |

---

### B2 — Admin Receives Product (No Passport)

#### `POST /receive/no-passport`
**Auth:** ADMIN · **Purpose:** Admin confirms physical product arrived. Updates listing DB status to `verifying`. No on-chain transaction — this is a DB-only operation.

**Request Body (JSON)**
```json
{
  "tempObjectAddress": "temp_17b304...",
  "status": "verifying"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tempObjectAddress` | `string` | ✅ | Temporary address returned from `/list/no-passport-record` |
| `status` | `string` | ✅ | Must be exactly `"verifying"` |

**Success Response `200`**
```json
{
  "success": true,
  "message": "Listing request has been verifying.",
  "newObjectAddress": "temp_17b304..."
}
```

**Error Responses**
| Status | Cause |
|--------|-------|
| `400` | Missing fields, `status` is not `"verifying"`, temp address not found in DB |
| `403` | Caller is not ADMIN |

---

### B3 — Admin Mints Listing Passport

#### `POST /verify/no-passport`
**Auth:** ADMIN · **Purpose:** Admin mints a new passport NFT for the verified product. Uploads image and metadata to IPFS, then returns a `mint_listing` transaction payload. The listing DB record must be in `verifying` status.

**Request Body (multipart/form-data)**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tempObjectAddress` | `string` | ✅ | Temporary address from B1 |
| `productName` | `string` | ✅ | Name of the product |
| `brand` | `string` | ✅ | Brand name |
| `category` | `string` | ✅ | Product category (e.g. "Bags") |
| `serialNumber` | `string` | ✅ | Unique product serial number |
| `manufacturingDate` | `string` | ✅ | Manufacturing date (e.g. "2024-01-01") |
| `materials` | `string` | ✅ | Comma-separated materials (e.g. "leather,canvas") |
| `countryOfOrigin` | `string` | ✅ | Country of manufacture |
| `description` | `string` | ✅ | Product description |
| `image` | `file` | ✅ | Product image (JPEG/PNG, max 5MB) |

**Success Response `200`**
```json
{
  "success": true,
  "imageCid": "Qm...",
  "imageIpfsUri": "ipfs://Qm...",
  "metadataCid": "Qm...",
  "metadataIpfsUri": "ipfs://Qm...",
  "metadata": {
    "name": "Test Bag B",
    "description": "...",
    "image": "ipfs://Qm...",
    "brand": "LuxBrand",
    "category": "Bags",
    "serialNumber": "NP-XXXXXX",
    "manufacturingDate": "2024-03-01",
    "materials": ["canvas", "leather"],
    "countryOfOrigin": "France",
    "attributes": [...]
  },
  "payload": {
    "function": "0x...::passport::mint_listing",
    "functionArguments": ["registry_address", "owner_address", <serial plain>, "metadata uri", <metadata bytes>, "temp_address"]
  }
}
```

**Error Responses**
| Status | Cause |
|--------|-------|
| `400` | `tempObjectAddress` not found in DB, listing not in `verifying` status, listing already has a passport, missing required fields, image upload failed |
| `403` | Caller is not ADMIN |

---

#### `POST /verify/no-passport-record`
**Purpose:** Confirms the `mint_listing` transaction succeeded on-chain. Replaces the temp address with the real minted passport address in the DB and sets listing status to `listed`. Requires Authentication.

**Request Body (JSON)**
```json
{
  "txHash": "0xabc...",
  "passportObjectAddress": "0xabc...",
  "tempPassportObjectAddress": "temp_17b304...",
  "ownerAddress": "0xabc..."
}

**Success Response `200`**
```json
{
  "success": true,
  "message": "Minting of listed passport recorded successfully."
}
```

**DB effect:** Finds listing by `tempPassportObjectAddress`, updates `passport_object_address` to the real address, sets `has_passport` to `true`, sets status to `listed`.

**Error Responses**
| Status | Cause |
|--------|-------|
| `400` | Invalid `txHash`, tx not found, tx was not `mint_listing`, DB update failed |
| `403` | Caller is not ADMIN |

---

## Query Endpoints

These endpoints are used by both workflows to look up listing and delist request state.

#### `GET /listings/address/:passportObjectAddress`
**Purpose:** Fetch a single listing record by passport object address.

**Success Response `200`**
```json
{
  "success": true,
  "payload": {
    "id": "uuid",
    "passport_object_address": "0xabc...",
    "owner_address": "0xabc...",
    "status": "pending",
    "has_passport": true,
    "created_at": "",
    "updated_at": ""
  }
}
```

**Error Responses:** `400` if `passportObjectAddress` is missing or no record is found.

---

#### `GET /listings/status/:status`
**Purpose:** Fetch all listing records with a given status.
Valid status values: `pending`, `verifying`, `listed`, `request_return`, `returning`, `returned`

**Success Response `200`**
```json
{
  "success": true,
  "payload": [
    {
      "id": "uuid",
      "passport_object_address": "temp_17b304...",
      "owner_address": "0xabc...",
      "status": "pending",
      "has_passport": false,
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

**Error Responses:** `400` if `status` is missing.

---

#### `GET /de-listings/address/:passportObjectAddress`
**Purpose:** Fetch a single delist request by passport object address.
**Success Response `200`**
```json
{
  "success": true,
  "payload": {
    "id": "uuid",
    "passport_object_address": "0xabc...",
    "requester_address": "0xabc...",
    "address_line1": "123 Main St",
    "address_line2": null,
    "city": "Singapore",
    "state": "SG",
    "postal_code": "123456",
    "country": "Singapore",
    "status": "pending",
    "created_at": "...",
    "updated_at": "..."
  }
}
```

Delist request status values: `pending` → `processed` → `closed`

**Error Responses:** `400` if `passportObjectAddress` is missing or no record found.

---

#### `GET /de-listings/status/:status`
**Purpose:** Fetch all delist requests with a given status.
Valid values: `pending`, `processed`, `closed`

**Success Response `200`**
```json
{
  "success": true,
  "payload": [ { /* DelistRequest objects */ } ]
}
```

**Error Responses:** `400` if `status` is missing.

---

## Common Error Response Shape

All error responses follow this shape:

```json
{
  "success": false,
  "error": "Human-readable error message."
}
```

## Workflow Comparison

| Step | Workflow A (with passport) | Workflow B (without passport) |
|------|---------------------------|-------------------------------|
| User initiates | `POST /list/passport-prepare` + sign + `POST /list/passport-record` | `POST /list/no-passport-record` |
| Admin receives | `POST /receive/passport` + sign + `POST /status/record` | `POST /receive/no-passport` (DB only) |
| Admin verifies | `POST /verify/passport` + sign + `POST /status/record` | `POST /verify/no-passport` + sign + `POST /verify/no-passport-record` |
| User delists | `POST /delist/request` | Same |
| Admin approves delist | `POST /delist/approve` + sign + `POST /status/record` | Same |
| User confirms receipt | `POST /receipt/prepare` + sign + `POST /receipt/record` | Same |