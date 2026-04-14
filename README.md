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

The **LPT token** (`lux_pass_token`) and **passport stack** (`issuer_registry`, `passport`, `escrow`) are built as **one** package under `web3/product-passport` (see `sources/lux_pass_token.move`). Publish **only** this package to your deploy address. Publishing `luxpass-token` to the same address first, then `product-passport`, causes Aptos simulation errors (`metadata and code bundle mismatch` / unregistered dependency).

**Framework git `rev` must match the network you publish to.** This repo pins `AptosFramework` to the **`devnet`** branch in `Move.toml`. Compiling against `rev = "mainnet"` while publishing to **devnet** has produced bogus **`unregistered dependency: …::issuer_registry`** on publish for some CLI / node combinations; if you target mainnet or testnet, switch the dependency `rev` (or use `aptos move publish --override-std mainnet|testnet|devnet`) so the framework matches the chain.

### Publish (devnet example)

Use **`--included-artifacts all`** so package metadata lists every module; the default `sparse` setting has caused **`metadata and code bundle mismatch` / `unregistered dependency`** on publish for multi-module packages.

```bash
cd web3/product-passport
aptos move clean --assume-yes
aptos move test --named-addresses luxpass=0xYOUR_DEPLOY_ADDRESS
aptos move publish --profile YOUR_PROFILE --assume-yes --included-artifacts all --override-std devnet --named-addresses luxpass=0xYOUR_DEPLOY_ADDRESS
```

If `Move.toml` already uses `rev = "devnet"` for `AptosFramework`, `--override-std devnet` is redundant but harmless. For mainnet publishes, use `--override-std mainnet` and a matching framework `rev`.

The standalone `web3/luxpass-token` folder remains useful for local experiments and `aptos move test` for the token in isolation; for production-style deploys matching the backend, use the unified package above.

After publishing, update `backend/.env` addresses to match deployed modules/state.

**Registry vs publish address:** `issuer_registry::init` stores the `IssuerRegistry` resource on the **account that signs** the transaction (your `ADMIN_PRIVATE_KEY`). The backend calls `get_registry(REGISTRY_ADDRESS)`. Those must match: set `REGISTRY_ADDRESS` (and usually `MODULE_ADDRESS`) to the same address as the admin account derived from `ADMIN_PRIVATE_KEY`, then run init (`POST /admin/registry/init` with an admin JWT, or `npm run start:safe`) so passport `init_index` / `init_events` run too.

## Common Issues

- `CORS origin not allowed`:
  - Ensure frontend URL is included in `CORS_ORIGINS`.
- `Invalid signature` on login:
  - Ensure the wallet used to sign matches the wallet used in `/auth/challenge`.
  - Use `backend/scripts/sign-challenge.example.ts` for local signature debugging.
- `module_not_found` / init failures:
  - Verify Move modules are published to the same network as `APTOS_NETWORK`.
  - Verify `MODULE_ADDRESS`, `REGISTRY_ADDRESS`, `LPT_MODULE_ADDRESS`, and `LPT_STATE_ADDRESS`.

### Devnet wiped / reset recovery (republish + re-init)

If devnet state is wiped, you must republish modules first, then initialize registry/token state again.

From repository root:

```bash
cd web3/product-passport

# optional: fund deployer/admin account first
aptos account fund-with-faucet --account <YOUR_ADMIN_ADDRESS> --profile admin

# Single publish: lux_pass_token + issuer_registry + passport + escrow (same named address)
aptos move publish --profile admin --assume-yes --included-artifacts all --named-addresses luxpass=<YOUR_ADMIN_ADDRESS>
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
