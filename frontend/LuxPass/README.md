# LuxPass Frontend

React + Vite frontend for the LuxPass product passport platform.

## Features

- Aptos wallet connection and message-sign auth flow
- Role-based dashboard navigation (`USER`, `ISSUER`, `ADMIN`)
- Product passport minting and transfer flows
- Product verification by product ID with provenance lookup

## Routes

- `/` - landing page
- `/verify` - public product verification
- `/dashboard` - role-aware entry page
- `/user` - owner dashboard
- `/issuer` - issuer dashboard
- `/admin` - admin dashboard

## Prerequisites

- Node.js 20+ (recommended)
- pnpm (recommended) or npm
- Running backend at `http://localhost:3001`

## Install

```bash
cd frontend/LuxPass
pnpm install
```

If needed:

```bash
npm install
```

## Run (Dev)

```bash
pnpm dev
```

App URL: `http://localhost:5173`

## Build

```bash
pnpm build
pnpm preview
```

## Lint

```bash
pnpm lint
```

## Backend Dependency

This frontend currently calls backend endpoints with hardcoded URLs such as:
- `http://localhost:3001/auth/*`
- `http://localhost:3001/api/passports/*`
- `http://localhost:3001/admin/*`

So backend must be running on port `3001` unless you update those URLs in source.

## Wallet/Auth Flow

1. Connect Aptos wallet
2. Request challenge from backend (`POST /auth/challenge`)
3. Sign message in wallet
4. Send signature to backend (`POST /auth/login`)
5. Store JWT and user profile in local storage

## Notes

- Vercel SPA rewrites are configured in `vercel.json`.
- UI is built with Tailwind + shadcn-style components.
