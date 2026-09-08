# SMSGecko

**SMSGecko** — pay-per-use **virtual phone numbers for receiving SMS one-time passcodes**.
Deposit a balance, pick a service (WhatsApp, Telegram, …) and country, get a number, poll
for the OTP within a time window; if no SMS arrives the order auto-expires and refunds.

A full-stack build (flows modeled on [smscode.gg](https://smscode.gg)). SMS delivery and
payments are **simulated** behind provider interfaces — no external accounts required. See
[`docs/architecture.md`](docs/architecture.md) for the design.

## Stack

| Part | Tech |
| --- | --- |
| `apps/web` | Next.js 16 (App Router, React 19), Tailwind v4, TanStack Query, Recharts |
| `apps/api` | Express 5 + Zod, Mongoose / MongoDB, JWT cookie auth, Bearer API keys, in-process workers |
| `packages/shared` | Zod schemas, shared types, micro-USD money helpers (`@smsgecko/shared`) |

Money is stored everywhere as integer **micro-USD** (millionths of a dollar) — prices go
below one cent (e.g. `$0.004`).

## Prerequisites

- Node.js ≥ 20
- A MongoDB **replica set** (needed for transactions). Either:
  - Docker — `npm run db:up` (uses `docker-compose.yml`), or
  - **no Docker** — `npm run db:mem` runs an on-disk single-node replica set via
    `mongodb-memory-server` (data persists in `apps/api/.mongo-data`), or
  - your own `MONGODB_URI` (local `mongod --replSet` or MongoDB Atlas).

## Getting started

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Terminal 1 — database (pick one)
npm run db:up        # Docker
npm run db:mem       # no Docker (keep this running)

# Terminal 2
npm run seed         # bootstrap: Setting doc + provider rows + reference catalog (idempotent)
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a strong password' npm run create-admin
npm run dev          # api on :4000, web on :3000  → open http://localhost:3000
```

`npm run seed` is an **idempotent bootstrap** — it upserts the `Setting` doc, the `mock` +
`Reseller A` provider rows, and the reference catalog (~40 services, ~40 countries,
placeholder offers), and never overwrites rows you've customised. It creates **no** demo
user or fake history. Prefix `SEED_FRESH=1` to drop the owned collections first (throwaway
DBs only).

`npm run create-admin` creates (or promotes) one admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
Other users register at `/register`; the admin panel is at `/admin`. Mint an `/api/v2` key
in the dashboard under **Settings**.

Operational config (order TTL, mock success rate, affiliate rate, maintenance mode, …)
lives in **Settings** in the admin panel — no restart needed. To see refunds quickly, drop
`Order TTL` to 60 and `Mock success rate` to 0.

## Scripts

| Command | What |
| --- | --- |
| `npm run dev` | Run API + web together |
| `npm run dev:api` / `npm run dev:web` | Run one side |
| `npm run seed` | Idempotent bootstrap (Setting + providers + catalog). `SEED_FRESH=1` drops owned collections first |
| `npm run create-admin` | Create/promote an admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| `npm run build` | Build all workspaces |
| `npm test` | API test suite (Vitest + in-memory Mongo) — 34 tests |
| `npm run typecheck` | Typecheck all workspaces |
| `npm run db:up` / `npm run db:down` / `npm run db:mem` | Local MongoDB |

## What's built

- [x] **Phase 0** — monorepo scaffold
- [x] **Phase 1** — auth: register / login / refresh-token rotation with reuse detection / logout / me
- [x] **Phase 2** — catalog, wallet, orders, deposits, mock SMS + expiry/refund workers, seed
- [x] **Phase 3** — marketing site: landing, pricing, platforms, faq, contact, docs
- [x] **Phase 4** — dashboard: gated routes, stat tiles + charts + New Order widget, orders
      list, order detail with live OTP polling, deposit, transactions + CSV, affiliate, settings
- [x] **Phase 5** — public `/api/v2` Bearer API (products / create / poll / finish / cancel)
      + API-key management
- [x] **Phase 6** — notifications (bell + OTP / expiry / deposit alerts), error states,
      `docs/architecture.md`
- [x] **Multi-provider SMS + admin panel** — a `ProviderConfig` registry with an ordered
      **fallback chain** (rent from provider #1, fall through to #2 on no-stock/error),
      poll-based `SmsProvider` interface, mock + generic `custom_http` adapters, encrypted
      credentials. Admin panel (`/admin`, sidebar shell, `requireAdmin`): Overview KPIs,
      **Providers** (enable / reorder / test / edit — the switch), Users (search /
      balance-adjust / role / suspend), Orders (global + force-cancel + re-poll), Catalog
      CRUD + bulk pricing, Finance (ledger + deposit confirm/fail), DB-backed Settings.

Not built (would be next): a support/tickets system, real payment integration, a
Playwright end-to-end suite.

## API at a glance

### `/api/v1` — cookie auth (the dashboard)

`auth/{register,login,logout,refresh,me}` · `catalog/{services,countries,offers,quote}` ·
`orders` (create / list / `:id` / `:id/cancel` / `stats`) · `wallet` ·
`transactions` (+ `/export.csv`) · `deposits` (create / `:id` / `:id/mock-confirm`) ·
`webhooks/payments/:provider` · `affiliate` (+ `/accept-terms`) · `api-keys` ·
`notifications` (+ `/read`)

### `/api/v1/admin` — cookie auth + admin role

`overview` · `providers` (CRUD, `/reorder`, `/:id/test`) · `users` (`/`, `/:id`,
`PATCH /:id`, `/:id/adjust-balance`) · `orders` (`/`, `/:id`, `/:id/cancel`, `/:id/repoll`) ·
`catalog/{services,countries,offers}` (CRUD, `offers/bulk`) ·
`finance/{transactions,deposits}` (`PATCH deposits/:id`) · `settings` (`GET`/`PATCH`)

### `/api/v2` — `Authorization: Bearer smsg_live_…`

```bash
API=http://localhost:4000
KEY=<mint one in the dashboard → Settings → API keys>

# list products
curl -s $API/api/v2/catalog/products?service=whatsapp -H "Authorization: Bearer $KEY"

# create an order (retry-safe)
curl -s -X POST $API/api/v2/orders \
  -H "Authorization: Bearer $KEY" -H "Idempotency-Key: $(uuidgen)" \
  -H 'content-type: application/json' \
  -d '{"catalog_product_id":"<id>","max_price":"0.50"}'

# poll for the OTP, then finish
curl -s $API/api/v2/orders/<order_id> -H "Authorization: Bearer $KEY"
curl -s -X POST $API/api/v2/orders/<order_id>/finish -H "Authorization: Bearer $KEY"
```

## Notes

SMSGecko is a learning project. Its product flows are modeled on smscode.gg; it is not
affiliated with them, has its own name and design, and performs no real SMS or payment
operations.
