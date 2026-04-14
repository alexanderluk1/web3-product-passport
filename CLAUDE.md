# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LuxPass — full-stack Aptos dApp for on-chain digital product passports (mint, transfer, verify, marketplace listing/delisting). CS466 Web3 Development course project.

## Repository Layout

```
web3-product-passport/
  backend/          Express + TypeScript API (tsx runtime, ESM)
  frontend/LuxPass/ React + Vite + TypeScript + Tailwind + shadcn/ui
  web3/
    product-passport/  Move package: passport + issuer_registry modules
    luxpass-token/     Move package: LuxPass utility token (LPT)
```

## Commands

### Backend (`backend/`)
```bash
npm run dev          # tsx watch with .env auto-load
npm run start        # production start
npm run start:safe   # preflight: auto-inits registry + LPT state, then starts
npm run build        # tsc -> dist/
npm run test         # vitest run (single pass)
npm run test:watch   # vitest (watch mode)
```

### Frontend (`frontend/LuxPass/`)
```bash
pnpm install         # install deps (pnpm is the package manager here)
pnpm dev             # vite dev server :5173
pnpm build           # production build
pnpm lint            # eslint
```

### Move packages (`web3/product-passport/` or `web3/luxpass-token/`)
```bash
aptos move test      # run Move unit tests
aptos move publish   # publish to configured network
```

### Docker (from `backend/`)
```bash
docker compose up    # postgres + aptos localnet + backend (runs knex migrate then npm start)
```

## Architecture

### Smart Contracts (Move)

Two modules under `luxpass::` namespace:

- **`passport`** — Passport as Aptos Object with serial hash, metadata URI/hash, status, transferability. PassportIndex maps serial_key (sha3_256 of product ID -> address) to passport object address. Status codes: ACTIVE(1), SUSPENDED(2), REVOKED(3), STORING(4), VERIFYING(5), LISTING(6), RETURNING(7). Entry functions: `mint`, `mint_listing`, `transfer`, `list_passport`, `delist_passport`, `set_status`, `update_metadata`.
- **`issuer_registry`** — Admin-controlled Table of approved issuer addresses. Guards who can mint passports.
- **`lux_pass_token`** — Utility token with mint/burn/transfer, signup + referral rewards, subsidy pool, platform fees. State stored under admin address.

`product-passport/Move.toml` uses `luxpass = "_"` (named address set at publish time). `luxpass-token/Move.toml` has a hardcoded address.

### Backend

Express 5, TypeScript ESM (`"type": "module"`), runs via `tsx`.

Key layers:
- **`src/app.ts`** — Express app factory (no `listen()`, testable). Manual CORS middleware, routes mounted here.
- **`src/server.ts`** — Minimal entry: creates app, listens.
- **`src/Start.ts`** — "Safe start" with preflight checks: ensures registry, passport index, and LPT state are initialized on-chain before starting server.
- **`src/chains/luxpass/`** — On-chain readers (view functions), writers (transaction builders), events, payload builders for the passport/registry modules.
- **`src/chains/luxpasstoken/`** — Same pattern for the LPT token module.
- **`src/modules/`** — Domain modules:
  - `auth` — Wallet-based auth: challenge/response with Ed25519 signature verification, JWT issuance. Roles: USER, ISSUER, ADMIN (ADMIN_WALLETS env var).
  - `passport` — Core CRUD + marketplace flows. Controller -> Service -> Repository pattern. Marketplace has two workflows: listing WITH existing passport (on-chain status transitions) and listing WITHOUT passport (admin mints on verification). See `backend/marketplace.md` for full API reference.
  - `admin` — Registry init/status endpoints.
  - `issuerRegistry` — Issuer registration (admin-only).
  - `luxpasstoken` — LPT token operations (mint, burn, transfer, claim rewards, etc.).
- **`src/db/migrations/`** — Knex migrations for PostgreSQL (listing_requests, delisting_requests tables).
- **`src/utils/`** — Pinata (IPFS) upload helper, wallet helper, process helper.

Transaction pattern: backend prepares payload -> frontend signs with wallet -> backend records/confirms via tx hash.

### Frontend

React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui components (pre-installed, don't reinstall).

- Routes defined in `src/App.tsx` (keep them there per AI_RULES.md).
- Pages: Index, Dashboard, Verify, IssuerDashboard, UserDashboard, AdminDashboard.
- `@/` path alias maps to `./src/`.
- Aptos wallet adapter for wallet connection/signing.
- `useAuth` hook for JWT-based auth state.
- TanStack Query for server state.

### Auth Flow

1. Frontend requests challenge from `POST /auth/challenge` with wallet address.
2. User signs challenge message with Aptos wallet.
3. Frontend sends signature to `POST /auth/login`.
4. Backend verifies Ed25519 signature, issues JWT.
5. Role determined by ADMIN_WALLETS env var (ADMIN) or issuer registry (ISSUER), else USER.

## Environment

Backend requires `.env` in `backend/` — see `.env.example`. Key variables:
- `MODULE_ADDRESS`, `REGISTRY_ADDRESS` — deployed Move module addresses
- `LPT_MODULE_ADDRESS`, `LPT_STATE_ADDRESS` — LPT token addresses
- `ADMIN_PRIVATE_KEY` — for server-signed transactions
- `ADMIN_WALLETS` — comma-separated admin wallet addresses
- `DATABASE_URL` — PostgreSQL connection string
- `PINATA_JWT`, `PINATA_GATEWAY_URL` — IPFS uploads

## Testing

Backend tests use Vitest (`src/**/*.test.ts`). Test files colocated with source:
- `passport/controllers/passport_controller_handlers.test.ts`
- `passport/services/passport_service_listing.test.ts`
- `passport/repository/listing_repository.test.ts`
- `passport/tests/passport.integration.test.ts`

Move tests: `web3/product-passport/sources/passport_tests.move`, `web3/luxpass-token/tests/lux_pass_token_tests.move`.

## Frontend Conventions (from AI_RULES.md)

- Use shadcn/ui components; don't edit files in `src/components/ui/` — make wrapper components instead.
- Pages go in `src/pages/`, components in `src/components/`.
- Main/default page is `src/pages/Index.tsx`.
- Use Tailwind CSS for all styling.
- lucide-react for icons.
