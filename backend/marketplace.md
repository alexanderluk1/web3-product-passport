POST /api/passports/list/passport-prepare: For User, Returns a transaction payload for the user to sign, which sets the passport status to STORING on-chain.
// Request
{
  "passportObjectAddress": "0xabc..."
}
//Response
{
  "success": true,
  "payload": {
    "function": "0x...::passport::list_passport",
    "functionArguments": ["0xpassportAddr", "0xregistryAddr"]
  }
}

POST /api/passports/list/passport-record: Confirms the list_passport transaction succeeded on-chain and creates the listing entry in the database with status pending.
//Request
{
  "txHash": "0xabc...",
  "passportObjectAddress": "0xabc..."
}
//Response
{
  "success": true,
  "message": "Listing Passport recorded successfully.",
  "passportObjectAddress": "0xabc..."
}

POST /api/passports/list/no-passport-record
Creates a pending listing entry in the database without requiring an on-chain transaction with a temp placeholder address
// Request
No need for a body, uses the user.req.WalletAddress as the owner address
// Response
{
  "success": true,
  "message": "Listing request submitted. LuxPass will verify your item before listing.",
  "tempObjectAddress": "temp_17b304b680a44cd78df789091431a4b8d1f2af743c9a426df97ffa8be3aaaea8"
}

POST /api/passports/receive/passport: Returns a transaction payload for the admin to sign, setting the passport status to VERIFYING (5) on-chain. Would use the /status/record to confirm transaction and update the listing database with status verifying
//Request
{
  "passportObjectAddress": "0xabc..."
}
// Response
{
  "success": true,
  "payload": {
    "function": "0x...::passport::set_status",
    "functionArguments": ["0xpassportAddr", "0xregistryAddr", 5]
  }
}

POST /api/passports/receive/no-passport
Admin only. Admin confirms physical product arrived. Updates listing DB status to verifying
// Request
{
  "tempObjectAddress": "temp_17b304...",
  "status": "verifying"
}
// Response
{
  "success": true,
  "message": "Listing request has been verifying."
}

POST /api/passports/verify/passport
Admin only. Returns a transaction payload for the admin to sign, setting the passport status to Listing (6) on-chain. Would use the /status/record to confirm transaction and update the listing database with status listed
// Request
{
  "passportObjectAddress": "0xabc..."
}
// Response
{
  "success": true,
  "payload": {
    "function": "0x...::passport::set_status",
    "functionArguments": ["0xpassportAddr", "0xregistryAddr", 6]
  }
}

POST /api/passports/verify/no-passport
Admin only. Uploads image and metadata to IPFS, then returns a mint_listing transaction payload to mint a new passport for the user.
// Request
Uses multipart/form data in same format as the minting path
tempObjectAddress: string
productName: string
brand: string
category: string
serialNumber: string
manufacturingDate: string
materials: string
counteryOfOrigin: string
description: string
image: file
// response
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
    "functionArguments": ["0xregistryAddr", "0xownerAddr", [...serialBytes], "ipfs://...", [...metadataBytes], "temp_17b304..."]
  }
}

POST /api/passports/verify/no-passport-record
Confirms the mint_listing transaction succeeded on-chain. Replaces the temp address with the real minted passport address in the DB and sets listing status to listed
// request
{
  "txHash": "0xabc...",
  "passportObjectAddress": "0xabc...",
  "tempPassportObjectAddress": "temp_17b304...",
  "ownerAddress": "0xabc..."
}
//response
{
  "success": true,
  "message": "Minting of listed passport recorded successfully."
}

POST /api/passports/delist/request
User requests to withdraw their listing. Creates a delist_request DB entry and sets listing status to request_return. Passport must be in STORING or LISTING status on-chain. Shipping request is mandatory.
// Request
{
  "passportObjectAddress": "0xabc...",
  "addressLine1": "123 Main St",
  "addressLine2": "Unit 4", //optional
  "city": "Singapore",
  "state": "SG",
  "postalCode": "123456",
  "country": "Singapore"
}
// Response
{
  "success": true,
  "message": "Delist request submitted. Admin will review and delist your passport."
}

POST /api/passports/delist/approve
For Admin only. Returns a transaction payload to set passport status to RETURNING (7). Checks that listing and delisting request share the same owner to prevent transactions after submitting delist_request
//request
{
  "passportObjectAddress": "0xabc..."
}
//response
{
  "success": true,
  "payload": {
    "function": "0x...::passport::set_status",
    "functionArguments": ["0xpassportAddr", "0xregistryAddr", 7]
  }
}

POST /api/passports/receipt/prepare
User confirms physical product was received. Returns a delist_passport transaction payload to set passport status back to ACTIVE on-chain. Checks the passports on-chain status and if caller is current owner.
// request 
{
  "passportObjectAddress": "0xabc..."
}
//response
{
  "success": true,
  "payload": {
    "function": "0x...::passport::delist_passport",
    "functionArguments": ["0xpassportAddr", "0xregistryAddr"]
  }
}

POST /api/passports/receipt/record
Confirms the delist_passport transaction succeeded and closes the listing and delist request in the database.
// request
{
  "txHash": "0xabc...",
  "passportObjectAddress": "0xabc..."
}
// response
{
  "success": true,
  "message": "Receipt confirmed. Passport is now active."
}

GET /api/passports/listings/address/:passportObjectAddress
fetch a listing request with a passportObjectAddress
// response
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

GET /api/passports/listings/status/:status
fetch all listing requests with a status
valid Statuses: "pending", "verifying", "listed", "request_return", "returning", "returned"
//response
{
  "success": true,
  "payload": [
    { /* ListingRequest objects */ }
  ]
}
GET /api/passports/de-listings/address/:passportObjectAddress
fetch a delist request with a passportObjectAddress
//response
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

GET /api/passports/de-listings/status/:status
fetch all delist requests with a given status
valid statuses: "pending", "processed", "closed"
// response
{
  "success": true,
  "payload": [ { /* DelistRequest objects */ } ]
}