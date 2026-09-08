# `@smsgecko/api`

Express 5 + Mongoose. Layered layout: `routes/` (wiring) → `controllers/` (req/res) →
`services/` (business logic) → `models/`. Request validation is yup via the
`validate(schema, part)` middleware; controllers read the coerced value with
`valid<T>(req, part)`.

- Dev: `npm run dev` (from repo root runs api + web; `tsx watch src/server.ts`)
- Tests: `npm test -w @smsgecko/api` · Typecheck: `npm run typecheck -w @smsgecko/api`

---

## Virtual-number API

A **number product** is an `Offer` — a `service × country × operator` row with a
`priceMicro` and `stock`. Buying one creates an **`Order`** (a rented number).
Money is integer **micro-USD** (`1_000_000` = $1.00).

### Base URLs & auth

| Surface | Prefix | Auth |
| --- | --- | --- |
| App (browser) | `/api/v1` | Session cookies `smsg_access` / `smsg_refresh` |
| Admin | `/api/v1/admin` | Session cookie + `role: admin` |
| Public API | `/api/v2` | `Authorization: Bearer smsg_live_…` |

`/api/v1/orders` also requires a **verified email** (`403 email_not_verified` otherwise).
Catalog endpoints are public.

### Order lifecycle

```
POST /orders ──▶ waiting ──▶ completed   (polling worker applied a delivered OTP)
   (charge)         │
                    ├──────▶ expired     (expiry worker, past expiresAt — full refund)
                    └──────▶ canceled    (user or admin cancel — full refund)
```

- `expiresAt = createdAt + max(orderTtlSeconds, providerMinHold)` — some providers
  (`hero_sms`, `sms_bower`) hold a number ≥ 10 min before it may be auto-expired or
  user-canceled.
- The charge happens once, at `POST /orders`. `completed` moves no money.
- An order is single-shot: rent → one code → done / cancel / expire. There is no
  "resend SMS", "ban number", or "reactivate" endpoint.

---

## Catalog — `/api/v1/catalog` (no auth)

| Method & path | Use |
| --- | --- |
| `GET /services?q=&limit=` | Search services (WhatsApp, Telegram…). `q` fuzzy-matches name / alias / slug; `limit` ≤ 500 (default 500). → `ServiceView[]` |
| `GET /countries?q=&limit=` | Same for countries. → `CountryView[]` |
| `GET /offers?serviceId=&countryId=` | All active offers for that pair, cheapest first. → `OfferView[]` = `{ id, serviceId, countryId, operator, priceMicro, stock }` |
| `GET /quote?serviceId=&countryId=` | Cheapest **in-stock** offer for the pair — powers the "New Order" widget. → `{ serviceId, countryId, available, bestOffer: OfferView \| null }`. `404` if the service or country id is unknown. |

## Orders (app) — `/api/v1/orders` (session + verified email)

| Method & path | Use |
| --- | --- |
| `POST /` | **Buy a number.** Body `{ serviceId, countryId, offerId?, maxPriceMicro?, idempotencyKey? }`. Picks the offer (pinned `offerId`, else cheapest in stock), rents a number from the enabled provider chain, debits `priceMicro`, creates a `waiting` order. → `201 OrderView`. Re-sending the same `idempotencyKey` returns the original order. |
| `GET /?status=&page=&limit=` | Your orders. `status` ∈ `all` \| `waiting` \| `completed` \| `canceled` \| `expired` \| `active` (alias for `waiting`). `limit` ≤ 100 (default 20). → `{ items: OrderView[], page, limit, total, totalPages }` |
| `GET /stats` | Dashboard figures: `balanceMicro`, order totals, `successRate` (0–1), 30-day `series` of orders + spend. → `OrderStatsResponse` |
| `GET /:id` | One order with `messages[]` and `secondsLeft` (countdown to `expiresAt`). **Poll this** to watch for the OTP. → `OrderView` |
| `POST /:id/cancel` | Cancel a `waiting` order → **full refund** + stock returned + number released. → `OrderView` |

`OrderView` = `{ id, status, service:{id,name,iconKey}, country:{id,name,code,flagEmoji}, phoneNumber, priceMicro, otpCode, messages:[{id,sender,text,parsedOtp,receivedAt}], secondsLeft, createdAt, completedAt, canceledAt }`.

**`POST /` errors:** `402 insufficient_balance` · `409` no stock / number just taken ·
`422 unprocessable` price above `maxPriceMicro` · `403 forbidden` ordering paused for
maintenance.
**`POST /:id/cancel` errors:** `409` order already resolved · `409` a code already
arrived · `409` provider minimum hold not elapsed yet (message names the provider and
the wait).

## Admin orders — `/api/v1/admin/orders` (admin)

| Method & path | Use |
| --- | --- |
| `GET /?status=&provider=&serviceId=&countryId=&userId=&q=&page=&limit=` | Every user's orders, plus `providerCostMicro`, `providerLabel`, and the buyer's email. `status` also accepts `active`. `q` matches `phoneNumber` / `providerRef`. `limit` ≤ 100 (default 25). → `{ items: AdminOrderRow[], … }` |
| `GET /:id` | Full order + messages. → `OrderView` |
| `POST /:id/cancel` | Force-cancel + refund a `waiting` order. **Bypasses the per-provider hold.** `409` if not `waiting`. |
| `POST /:id/repoll` | Ask the provider for this order's status immediately (manual poll). Use when an OTP looks stuck. → `OrderView` |

## Public API v2 — `/api/v2` (`Authorization: Bearer smsg_live_…`)

Mint keys at `POST /api/v1/api-keys` (session auth).

| Method & path | Use |
| --- | --- |
| `GET /catalog/products?service=&country=&limit=` | Flat product list. `service` / `country` filter by slug / ISO code. `limit` ≤ 500 (default 200). → `{ data: [{ id, service, service_slug, country, country_code, operator, price:"0.50", stock }] }` |
| `POST /orders` | Buy. Body `{ catalog_product_id \| product_id, max_price?, operator_id?, quantity? }`. Optional `Idempotency-Key` header (8–128 chars). Same charge + rent as the app. → `201 V2Order` |
| `GET /orders/:id` | Poll for the code. → `V2Order` = `{ id, status: waiting\|completed\|canceled\|expired, product:{service,country}, phone_number, price, otp_code, sms:[{sender,text,received_at}], created_at, expires_at, finished_at }` |
| `POST /orders/:id/finish` | Mark a `completed` order finished (sets `finished_at`) — client signals it is done with the number. |
| `POST /orders/:id/cancel` | Cancel + refund a `waiting` order (per-provider hold applies). |

`max_price` is a decimal USD string (`"0.50"`); a `400` is returned if it isn't parseable.

---

## Error shape

All errors: `{ "error": { "code": string, "message": string, "details"?: unknown } }`.
Validation failures are `400 bad_request` with `details` = the yup messages.

## Background workers (`WORKERS_ENABLED`)

- **Polling** (every 4 s) — asks each `waiting` order's provider for status; a delivered
  OTP → `applyOtpToOrder` (→ `completed`, stores messages, notifies). Also runs behind
  `POST /admin/orders/:id/repoll`.
- **Expiry** (every 8 s) — any `waiting` order past `expiresAt` → `refundWaitingOrder(…, 'expired')`.

The **mock** provider decides at rent time (vs `settings.mockSmsSuccessRate`) whether a
code will arrive and schedules `deliverAt`; if not, the order simply expires and refunds.
