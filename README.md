# LuxPass Web3 Product Passport

LuxPass is a full-stack Aptos project for creating, transferring, and verifying on-chain digital product passports.

This repository contains:
- Smart contracts (Move) for product passport and token logic
- A backend API for auth, issuer/admin flows, and on-chain interactions
- A React frontend for user, issuer, admin, and verification experiences

## Repository Structure

- `frontend/LuxPass` - React + Vite + TypeScript frontend
- `backend` - Express + TypeScript API server
- `web3/product-passport` - Move package for product passport + issuer registry
- `web3/luxpass-token` - Move package for LuxPass token mechanics

## Tech Stack

- Frontend: React, Vite, TypeScript, Tailwind, Aptos wallet adapter
- Backend: Node.js, Express, TypeScript (`tsx` runtime)
- Chain: Aptos Move (`product-passport`, `luxpass-token`)

## Prerequisites

- Node.js 20+ (recommended)
- npm and/or pnpm
- Aptos CLI (for Move package operations)
- Aptos wallet browser extension (for frontend login/signing)

## Quick Start (Local)

### 1) Install dependencies

```bash
cd backend && npm install
cd ../frontend/LuxPass && pnpm install
```

If you prefer npm for frontend:

```bash
cd frontend/LuxPass && npm install
```

### 2) Configure backend environment

Create `backend/.env` (already present in your local setup) with these keys:

```env
PORT=3001
CORS_ORIGINS=http://localhost:5173

APTOS_NETWORK=devnet
APTOS_FULLNODE_URL=https://fullnode.devnet.aptoslabs.com/v1

MODULE_ADDRESS=0x...
REGISTRY_ADDRESS=0x...

LPT_MODULE_ADDRESS=0x...
LPT_STATE_ADDRESS=0x...
LPT_SIGNUP_REWARD_DEFAULT=10
LPT_REFERRAL_REWARD_DEFAULT=7

ADMIN_PRIVATE_KEY=0x...
ADMIN_WALLETS=0xadmin1,0xadmin2

JWT_SECRET=replace-with-strong-secret

PINATA_JWT=...
PINATA_GATEWAY_URL=...

PASSPORT_MODULE_NAME=passport
PASSPORT_MINT_FUNCTION=mint
```

Notes:
- `ADMIN_WALLETS` controls which wallets are treated as `ADMIN` in auth.
- Frontend currently calls backend at `http://localhost:3001` directly.

### 3) Run backend

```bash
cd backend
npm run dev
```

Alternative startup modes:

```bash
npm run start      # standard start with .env
npm run start:safe # preflight checks/init for registry + token state
```

Backend default URL: `http://localhost:3001`

Health check:

```bash
curl http://localhost:3001/health
```

### 4) Run frontend

```bash
cd frontend/LuxPass
pnpm dev
```

Frontend default URL: `http://localhost:5173`

## Core API Routes

Base URL: `http://localhost:3001`

- Auth:
  - `POST /auth/challenge`
  - `POST /auth/login`
  - `GET /auth/me`
- Passport:
  - `POST /api/passports/mint/prepare`
  - `POST /api/passports/transfer/prepare`
  - `POST /api/passports/transfer/record`
  - `GET /api/passports/products`
  - `GET /api/passports/owned`
  - `GET /api/passports/by-product/:productId`
  - `GET /api/passports/by-product/:productId/provenance`
- Token:
  - `GET /api/tokens/status`
  - `POST /api/tokens/*/prepare` (init, mint, transfer, burn, claim, etc.)
- Admin/Issuer:
  - `GET /admin/registry/status`
  - `POST /admin/registry/init`
  - `GET /admin/registry/issuers`
  - `GET /admin/issuers`
  - `POST /admin/issuers/register`

## Move Packages

The current implementation includes the token module (`lux_pass_token`) inside `web3/product-passport/sources`, so publishing `web3/product-passport` publishes passport + registry + token modules together.

### Unified package (recommended for deploys)

```bash
cd web3/product-passport
aptos move test
aptos move publish
```

### Standalone token package (optional, local testing)

```bash
cd web3/luxpass-token
aptos move test
```

After publishing, update `backend/.env` addresses to match deployed modules/state.

## Init Requirements (Registry + Token State)

For the system to function correctly, both passport and token resources must be initialized on-chain:

- `issuer_registry::init`
- `passport::init_index`
- `passport::init_events`
- LuxPass token state init

Recommended startup mode:

```bash
cd backend
npm run start:safe
```

`start:safe` performs preflight checks and initializes missing registry/token state automatically.

If you run only `npm run dev`, initialize via admin flows after login:

- `POST /admin/registry/init`
- token init prepare route under `POST /api/tokens/*/prepare`

## Common Issues

- `CORS origin not allowed`:
  - Ensure frontend URL is included in `CORS_ORIGINS`.
- `Invalid signature` on login:
  - Ensure the wallet used to sign matches the wallet used in `/auth/challenge`.
  - Use `backend/scripts/sign-challenge.example.ts` for local signature debugging.
- `module_not_found` / init failures:
  - Verify Move modules are published to the same network as `APTOS_NETWORK`.
  - Verify `MODULE_ADDRESS`, `REGISTRY_ADDRESS`, `LPT_MODULE_ADDRESS`, and `LPT_STATE_ADDRESS`.
- `429 Too Many Requests` / rate limiting:
  - Reduce rapid repeated calls (especially login challenge or polling loops) and retry with backoff.
  - If testing locally, wait briefly and retry, or restart the backend to clear in-memory request windows.

### Devnet wiped / reset recovery (republish + re-init)

If devnet state is wiped, you must republish modules first, then initialize registry/token state again.

From repository root:

```bash
cd web3/product-passport

# optional: fund deployer/admin account first
aptos account fund-with-faucet --account <YOUR_ADMIN_ADDRESS> --profile admin

# Single publish (contains issuer_registry + passport + lux_pass_token)
aptos move publish --profile admin --assume-yes
```

Then reinitialize on-chain resources:

```bash
cd ../../backend
npm run start:safe
```

`start:safe` runs preflight and initializes:
- `issuer_registry::init`
- `passport::init_index`
- `passport::init_events`
- LuxPass token state init

If you only run `npm run dev`, you can also initialize via API (`POST /admin/registry/init`) after logging in as an admin wallet.

## Scripts Reference

### Backend (`backend/package.json`)

- `npm run dev`
- `npm run start`
- `npm run start:safe`
- `npm run sign`
- `npm run sign:setup`

### Frontend (`frontend/LuxPass/package.json`)

- `pnpm dev`
- `pnpm build`
- `pnpm preview`
- `pnpm lint`
