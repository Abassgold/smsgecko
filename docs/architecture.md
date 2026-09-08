# Architecture

**SMSGecko** is a pay-per-use virtual phone number service for receiving SMS OTPs (its flows
are modeled on smscode.gg). This document covers the shape of the system, the order state
machine, and the provider seams where the simulated pieces plug in.

## Repository

npm-workspaces monorepo:

| Package | Role |
| --- | --- |
| `packages/shared` (`@smsgecko/shared`) | Zod schemas for every request/response, inferred TS types, micro-USD money helpers, enum constants. Consumed as raw TS (its `exports` point at `src/`); imports inside it are **extensionless** so Turbopack, tsx and tsc all resolve them. |
| `apps/api` (`@smsgecko/api`) | Express 5 + Zod HTTP API, Mongoose models, in-process workers, mock providers, seed. |
| `apps/web` (`@smsgecko/web`) | Next.js 16 App Router. Marketing site + gated dashboard. Talks to the API **same-origin** via a `/api/*` rewrite (`next.config.ts`) so auth cookies work without CORS. |

## Money

Every monetary value is an **integer number of micro-USD** (millionths of a dollar).
Prices go below one cent (e.g. `$0.004`), so cents are too coarse. Format for
display with `formatUsd` / `formatSignedUsd` / `formatApproxUsd` (the last rounds to cents
for balances). Never store a float.

## Data model (MongoDB / Mongoose)

```
User            email, passwordHash (argon2id), username, role,
                balanceMicro,  ← only lib/ledger.ts writes this
                affiliateCode, affiliateTermsVersion, referredBy
RefreshToken    jti, tokenHash (sha256), family, expiresAt, revokedAt   (rotation + reuse detection)
Service         slug, name, iconKey, aliases[], popular, sortOrder
Country         code (iso2), name, dialCode, flagEmoji
Offer           serviceId, countryId, operator, priceMicro, stock, active   ← the "catalog_product"
Order           userId, serviceId/countryId/offerId (+ denormalised names),
                phoneNumber, priceMicro, status, otpCode, providerRef,
                idempotencyKey (partial-unique per user), deliverAt, expiresAt,
                completedAt, canceledAt, finishedAt
SmsMessage      orderId, sender, text, parsedOtp, receivedAt
Transaction     userId, type, amountMicro (signed), balanceAfterMicro, description,
                orderId?, depositId?           ← append-only ledger, one row per balance change
Deposit         userId, method, amountMicro, status, providerRef, payAddress/payUrl,
                expiresAt, confirmedAt
ApiKey          userId, prefix, hashedKey (sha256), label, lastUsedAt, revokedAt
Notification    userId, type, title, body, orderId?, readAt
```

MongoDB must run as a **replica set** — `lib/ledger.ts` uses multi-document transactions
for the buy flow. `docker-compose.yml` (or `npm run db:mem`, an on-disk
`mongodb-memory-server`) provides a single-node replica set.

## The ledger (`apps/api/src/lib/ledger.ts`)

The single choke point for `User.balanceMicro`:

- `debit(userId, micro, ctx)` — atomic `findOneAndUpdate({ _id, balanceMicro: { $gte } }, { $inc: -micro })`.
  No match → `402 insufficient_balance`. This is the real guard against overspend races.
- `credit(userId, micro, ctx)` — atomic `$inc: +micro`.
- Both write a paired `Transaction` carrying the signed amount and the resulting balance.
- Both accept a Mongoose `session` so they compose inside the order transaction.

## Order state machine

```
             POST /orders (v1 cookie, or v2 Bearer)
                     │  txn: Offer.stock-- (guarded)  +  ledger.debit  +  Order.insert
                     ▼
                ┌─────────┐   mock SMS delivered (smsDelivery worker)      ┌───────────┐
                │ waiting │ ─────────────────────────────────────────────▶ │ completed │
                └─────────┘                                                └───────────┘
                   │  │                                                          │ POST /v2/orders/:id/finish
                   │  │ expiresAt passes, no SMS (orderExpiry worker)            ▼ finishedAt set
                   │  │   ledger.credit refund + Offer.stock++              (number released; mock no-op)
                   │  ▼
                   │ ┌─────────┐
                   │ │ expired │  (UI labels this "Canceled", matching the live site)
                   │ └─────────┘
                   │ POST /orders/:id/cancel  (only while waiting, no SMS yet)
                   ▼   ledger.credit refund + Offer.stock++
              ┌──────────┐
              │ canceled │
              └──────────┘
```

- **Idempotency**: `POST /orders` with an `idempotencyKey` (v1 body field / v2
  `Idempotency-Key` header) is safe to retry — a partial-unique index on
  `{ userId, idempotencyKey }` plus a pre-check returns the original order.
- **Refund wording**: both timeout and user-cancel produce a `refund` transaction
  described `"Order canceled — refund"`.

## SMS providers — registry + fallback chain (`src/providers/sms/`)

Multiple providers are configured at runtime; the order-router walks the **enabled**
ones by ascending `priority` and rents from the first with stock.

- **`SmsProvider` interface** (`types.ts`): `rent(input)` → `{ providerRef, phoneNumber,
  costMicro?, mockDeliverAt? }`; `poll({ providerRef, order })` → `{ status:
  waiting|received|canceled, code?, messages? }`; `release(providerRef)`; `healthCheck()`.
  `NoStockError` / `ProviderConfigError` from `rent()` make the router fall through.
- **Adapters** (`adapters/`): `MockSmsProvider` (decides delivery up front from
  `Setting`, encoded as `mockDeliverAt`); `CustomHttpProvider` — a config-driven client
  (templated `rentPath`/`statusPath`/`cancelPath` with `{service}{country}{ref}`, a
  response `map`, `authMode` query/header/bearer, text or JSON parsing). Reseller APIs
  (SMS-Activate / 5SIM / SMSHub-style) are just `custom_http` configs.
- **`ProviderConfig` model**: `key`, `label`, `enabled`, `priority`, `configEnc`
  (AES-256-GCM blob — `lib/secretbox.ts`, key `SETTINGS_ENC_KEY`; returned **masked** to
  admins), `stats { rentAttempts, rentSuccess, rentNoStock, rentError, otpReceived,
  lastError, … }`, `healthOk/Detail/CheckedAt`.
- **`registry.ts`**: `resolveChain()` (enabled, by priority; 15 s instance cache, busted
  on admin write), `rentWithFallback(input)` (tries each; records stats; throws
  `409 No provider could supply a number` if all fail), `getProviderForOrder(order)`
  (by `Order.providerConfigId`, for poll/release), `runHealthCheck(cfg)`.
- The order records `provider` (adapter key), `providerConfigId`, `providerLabel`,
  `providerCostMicro`, `lastPolledAt`.

## Payment provider (simulated)

`PaymentProvider` (`src/providers/payment/`): `createCharge` returns a fake `providerRef`
(+ fake USDT address for crypto). Settlement is the `mock-confirm` endpoint, the
`/webhooks/payments/:provider` webhook, or an admin `PATCH /admin/finance/deposits/:id`.

## Runtime settings (`src/lib/settings.ts`, `Setting` model)

Operational config lives in a single `Setting` doc (`_id: 'global'`), seeded from env
defaults, cached ~10 s, editable at `PATCH /api/v1/admin/settings` with no restart:
`orderTtlSeconds`, `providerPollIntervalMs`, `mockSms*`, `affiliateRatePct`,
`minDepositMicro`, `signupsEnabled`, `maintenanceMode`. Call sites read `getSettings()`.

## Background workers (`src/workers/`)

Started in `server.ts` when `WORKERS_ENABLED=true`; guarded so a slow tick never overlaps.

- `polling` (~4 s) — `pollOrderOnce()` per `waiting` order that's due (mock: `deliverAt <=
  now`; real: `lastPolledAt` older than `providerPollIntervalMs`). Calls the order's
  provider `poll()`: `received` → `applyOtpToOrder` (+ `otp_received` notification, provider
  `otpReceived` stat); `canceled` → refund path; `waiting` → touch `lastPolledAt`.
- `orderExpiry` (~8 s) — `waiting` orders past `expiresAt` → `expired`, refund via the
  ledger, restore `Offer.stock`, `provider.release()`, emit `order_expired`.

## HTTP surface

- **`/api/v1/*`** — cookie auth (`smsg_access` ~15 m + `smsg_refresh` ~7 d, httpOnly). Powers
  the dashboard: `auth`, `catalog`, `orders` (+`/stats`), `wallet`, `transactions`
  (+`/export.csv`), `deposits`, `affiliate`, `api-keys`, `notifications`.
- **`/api/v1/admin/*`** — cookie auth + `requireAdmin` (`User.role === 'admin'`; suspended
  users are rejected everywhere). `overview` (KPIs + 30-day series + provider health),
  `providers` (CRUD + `/reorder` + `/:id/test`), `users` (search / `PATCH` role+status /
  `adjust-balance` → `adjustment` ledger row), `orders` (global list + force-`cancel` +
  `repoll`), `catalog` (`services`/`countries`/`offers` CRUD + `offers/bulk`),
  `finance` (`transactions`, `deposits` + `PATCH` confirm/fail), `settings` (`GET`/`PATCH`).
- **`/api/v2/*`** — `Authorization: Bearer smsg_live_…` (`ApiKey`). The public SDK-style
  API: `catalog/products`, `orders` (create with `catalog_product_id` + `max_price` +
  `Idempotency-Key`), `orders/:id`, `orders/:id/finish`, `orders/:id/cancel`. Prices are
  decimal-string USD. Shares the exact same order/ledger core as v1.

Errors are uniform: `{ error: { code, message, details? } }` via the handler in `app.ts`,
thrown as the helpers in `src/lib/errors.ts`.

## Web

- Route groups: `(marketing)` (public header/footer), `(auth)`, `(dashboard)`,
  `(admin)` (sidebar shell; `layout.tsx` redirects non-admins to `/dashboard`).
- `proxy.ts` (Next 16's renamed middleware) gates `/dashboard`, `/admin`, … on cookie
  presence; real validation is the `/auth/me` call in each layout, which on 401 clears the
  cookie and bounces to `/login` (avoids a stale-cookie redirect loop).
- Data: TanStack Query. Order detail polls `/orders/:id` every 2.5 s for the OTP;
  notifications poll every 20 s; `catalog/quote` every 20 s.
- Charts: Recharts (orders area + spending bars, 30-day).
