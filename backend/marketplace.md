# LuxPass Marketplace API Reference

## Overview

All endpoints are prefixed with `/api/passports`. Authenticated endpoints require a Bearer JWT token in the `Authorization` header.

### Auth Roles
| Role | Capabilities |
|------|-------------|
| `USER` | Initiate listings, request delists, confirm receipt |
| `ADMIN` | Receive products, verify/mint, approve delists, set status |

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
| `pending` | Listing created, product not yet received by admin |
| `verifying` | Admin received product, under verification |
| `listed` | Verified, live on marketplace |
| `request_return` | User submitted delist request |
| `returning` | Admin approved return, product shipping back |
| `returned` | User confirmed receipt, listing closed |

### Database Delist Statuses
| Status | Meaning |
|--------|---------|
| `pending` | Delist request submitted by user |
| `processed` | Admin has processed the request |
| `closed` | User confirmed receipt, delist complete |

---

## Listing Endpoints

### `POST /list/passport-prepare`
**Auth:** Any Auth

Returns a transaction payload for the user to sign, which sets the passport status to STORING on-chain.

**Request**
```json
{
  "passportObjectAddress": "0xabc..."
}
```

**Response**
```json
{
  "success": true,
  "payload": {
    "function": "0x...::passport::list_passport",
    "functionArguments": [<passportAddress>, <registryAddress>]
  }
}
```

---

### `POST /list/passport-record`
**Auth:** Any Auth

Confirms the `list_passport` transaction succeeded on-chain and creates the listing entry in the database with status `pending`.

**Request**
```json
{
  "txHash": "0xabc...",
  "passportObjectAddress": "0xabc..."
}
```

**Response**
```json
{
  "success": true,
  "message": "Listing Passport recorded successfully.",
  "passportObjectAddress": "0xabc..."
}
```

---

### `POST /list/no-passport-record`
**Auth:** Any Auth

Creates a pending listing entry in the database without requiring an on-chain transaction. A deterministic temporary placeholder address is generated for tracking. Uses `req.user.walletAddress` as the owner — no request body needed.

**Request**

No body required.

**Response**
```json
{
  "success": true,
  "message": "Listing request submitted. LuxPass will verify your item before listing.",
  "tempObjectAddress": "temp_17b304b680a44cd78df789091431a4b8d1f2af743c9a426df97ffa8be3aaaea8"
}

## Receive Endpoints

### `POST /receive/passport`
**Auth:** ADMIN

Returns a transaction payload for the admin to sign, setting the passport status to VERIFYING (5) on-chain. Call `/status/record` afterwards to confirm the transaction and update the listing DB status to `verifying`.

**Request**
```json
{
  "passportObjectAddress": "0xabc..."
}
```

**Response**
```json
{
  "success": true,
  "payload": {
    "function": "0x...::passport::set_status",
    "functionArguments": [<passportAddress>, <registryAddress>, 5 <STATUS_VERIFYING>]
  }
}
```

---

### `POST /receive/no-passport`
**Auth:** ADMIN

Admin confirms physical product arrived. Updates listing DB status to `verifying`. No on-chain transaction — DB only. Only `"verifying"` is accepted as a status value.

**Request**
```json
{
  "tempObjectAddress": "temp_17b304...",
  "status": "verifying"
}
```

**Response**
```json
{
  "success": true,
  "message": "Listing request has been verifying."
}
```

---

## Verify Endpoints

### `POST /verify/passport`
**Auth:** ADMIN

Returns a transaction payload for the admin to sign, setting the passport status to LISTING (6) on-chain. Call `/status/record` afterwards to confirm the transaction and update the listing DB status to `listed`.

**Request**
```json
{
  "passportObjectAddress": "0xabc..."
}
```

**Response**
```json
{
  "success": true,
  "payload": {
    "function": "0x...::passport::set_status",
    "functionArguments": [<passportAddress>, <registryAddress>, 6 <STATUS_LISTING>]
  }
}
```

---

### `POST /verify/no-passport`
**Auth:** ADMIN

Uploads image and metadata to IPFS, then returns a `mint_listing` transaction payload to mint a new passport for the user. The listing DB record must be in `verifying` status. Uses `multipart/form-data`.

**Request** (`multipart/form-data`)

| Field | Type | Description |
|-------|------|-------------|
| `tempObjectAddress` | `string` | Temporary address from `/list/no-passport-record` |
| `productName` | `string` | Name of the product |
| `brand` | `string` | Brand name |
| `category` | `string` | Product category (e.g. `"Bags"`) |
| `serialNumber` | `string` | Unique product serial number |
| `manufacturingDate` | `string` | Manufacturing date (e.g. `"2024-01-01"`) |
| `materials` | `string` | Comma-separated materials (e.g. `"leather,canvas"`) |
| `countryOfOrigin` | `string` | Country of manufacture |
| `description` | `string` | Product description |
| `image` | `file` | Product image (JPEG/PNG, max 5 MB) |

**Response**
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
    "functionArguments": [<RegistryAddress>, <OwnerAddress>, [...serialBytes], <metadataURL>, [...metadataBytes], <tempObjectAddress>]
  }
}
```

---

### `POST /verify/no-passport-record`
**Auth:** Any

Confirms the `mint_listing` transaction succeeded on-chain. Replaces the temp address with the real minted passport address in the DB and sets listing status to `listed`.

**Request**
```json
{
  "txHash": "0xabc...",
  "passportObjectAddress": "0xabc...",
  "tempPassportObjectAddress": "temp_17b304...",
  "ownerAddress": "0xabc..."
}
```

**Response**
```json
{
  "success": true,
  "message": "Minting of listed passport recorded successfully."
}
```

---

## Status Record Endpoint

### `POST /status/record`
Confirms a `set_status` transaction succeeded on-chain and updates the DB listing status accordingly. Used after `/receive/passport`, `/verify/passport`, and `/delist/approve`.

Reads the current on-chain passport status after the transaction and maps it to the corresponding DB value. If the new status is RETURNING, also updates the `delist_requests` table to `returning`.

**Request**
```json
{
  "txHash": "0xabc...",
  "passportObjectAddress": "0xabc..."
}
```

**Response**
```json
{
  "success": true,
  "message": "Status update recorded successfully."
}
```

---

## Delist Endpoints

### `POST /delist/request`
**Auth:** Any

User requests to withdraw their listing. Creates a `delist_request` DB entry and sets listing status to `request_return`. Passport must be in STORING or LISTING status on-chain. Shipping address is mandatory.

**Request**
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

| Field | Required |
|-------|----------|
| `passportObjectAddress` | ✅ |
| `addressLine1` | ✅ |
| `addressLine2` | ❌ optional |
| `city` | ✅ |
| `state` | ❌ optional |
| `postalCode` | ✅ |
| `country` | ✅ |

**Response**
```json
{
  "success": true,
  "message": "Delist request submitted. Admin will review and delist your passport."
}
```

---

### `POST /delist/approve`
**Auth:** ADMIN

Returns a transaction payload to set passport status to RETURNING (7). Verifies that a pending delist request exists for the passport before returning the payload. Call `/status/record` afterwards to update listing and delist request statuses.

**Request**
```json
{
  "passportObjectAddress": "0xabc..."
}
```

**Response**
```json
{
  "success": true,
  "payload": {
    "function": "0x...::passport::set_status",
    "functionArguments": [<passportAddress>, <registryAddress>, 7 <STATUS_RETURNING>]
  }
}
```

---

## Receipt Endpoints

### `POST /receipt/prepare`
**Auth:** Any

User confirms physical product was received. Returns a `delist_passport` transaction payload to set passport status back to ACTIVE on-chain. Validates that the passport is in RETURNING status and that the caller is the current on-chain owner.

**Request**
```json
{
  "passportObjectAddress": "0xabc..."
}
```

**Response**
```json
{
  "success": true,
  "payload": {
    "function": "0x...::passport::delist_passport",
    "functionArguments": [<passportAddress>, <registryAddress>]
  }
}
```

---

### `POST /receipt/record`
**Auth:** Any

Confirms the `delist_passport` transaction succeeded on-chain and closes both the listing and delist request in the database. Sets `listing_requests.status` to `returned` and `delist_requests.status` to `closed`.

**Request**
```json
{
  "txHash": "0xabc...",
  "passportObjectAddress": "0xabc..."
}
```

**Response**
```json
{
  "success": true,
  "message": "Receipt confirmed. Passport is now active."
}
```

---

## Query Endpoints

### `GET /listings/address/:passportObjectAddress`
**Auth:** USER or ADMIN

Fetch a single listing record by passport object address. Works with both real passport addresses and temp placeholder addresses.

**Response**
```json
{
  "success": true,
  "payload": {
    "id": "uuid",
    "passport_object_address": "0xabc...",
    "owner_address": "0xabc...",
    "status": "listed",
    "has_passport": true,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### `GET /listings/status/:status`
**Auth:** USER or ADMIN

Fetch all listing records with a given status.

**Valid status values:** `pending` · `verifying` · `listed` · `request_return` · `returning` · `returned`

**Response**
```json
{
  "success": true,
  "payload": [
    { "...": "ListingRequest objects" }
  ]
}
```

---

### `GET /de-listings/address/:passportObjectAddress`
**Auth:** USER or ADMIN

Fetch a single delist request by passport object address.

**Response**
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
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### `GET /de-listings/status/:status`
**Auth:** USER or ADMIN

Fetch all delist requests with a given status.

**Valid status values:** `pending` · `processed` · `closed`

**Response**
```json
{
  "success": true,
  "payload": [
    { "...": "DelistRequest objects" }
  ]
}
```

---

## Error Response

All endpoints return errors in the following shape:

```json
{
  "success": false,
  "error": "Human-readable error message."
}
```

| HTTP Status | Meaning |
|-------------|---------|
| `400` | Bad request — missing or invalid fields, business rule violation |
| `401` | Missing or invalid JWT |
| `403` | Authenticated but insufficient role (e.g. user calling an ADMIN endpoint) |

---

## Workflow Summary

### Workflow A — List WITH an existing passport

| Step | Endpoint | Signed by |
|------|----------|-----------|
| User initiates listing | `POST /list/passport-prepare` → sign → `POST /list/passport-record` | USER |
| Admin receives product | `POST /receive/passport` → sign → `POST /status/record` | ADMIN |
| Admin verifies product | `POST /verify/passport` → sign → `POST /status/record` | ADMIN |
| User requests delist | `POST /delist/request` | USER |
| Admin approves delist | `POST /delist/approve` → sign → `POST /status/record` | ADMIN |
| User confirms receipt | `POST /receipt/prepare` → sign → `POST /receipt/record` | USER |

### Workflow B — List WITHOUT an existing passport

| Step | Endpoint | Signed by |
|------|----------|-----------|
| User submits listing | `POST /list/no-passport-record` | USER |
| Admin receives product | `POST /receive/no-passport` *(DB only, no signing)* | ADMIN |
| Admin mints passport | `POST /verify/no-passport` → sign → `POST /verify/no-passport-record` | ADMIN |
| User requests delist | `POST /delist/request` | USER |
| Admin approves delist | `POST /delist/approve` → sign → `POST /status/record` | ADMIN |
| User confirms receipt | `POST /receipt/prepare` → sign → `POST /receipt/record` | USER |