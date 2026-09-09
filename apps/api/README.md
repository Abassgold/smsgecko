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
| `GET /operators?serviceId=&countryId=` | Carriers/routes for that pair. → `OperatorView[]` = `{ id, name, count, fromPriceMicro, stock }`, `"Any"` (id `""`) first. |
| `GET /offers?serviceId=&countryId=&operator=` | Every price tier for that pair, cheapest first. Optional `operator` narrows it. → `OfferView[]` = `{ id, serviceId, countryId, operator, priceMicro, stock }`. `id` = `"<svc>::<ctry>"` for the cheapest tier, `"…::<i>"` for the rest. |
| `GET /quote?serviceId=&countryId=&operator=` | Same tiers as `/offers`, plus `operators[]` and `bestOffer` (cheapest in stock) — powers the "New Order" widget. → `{ serviceId, countryId, available, offers, operators, bestOffer }`. |

## Orders (app) — `/api/v1/orders` (session + verified email)

| Method & path | Use |
| --- | --- |
| `POST /` | **Buy a number.** Body `{ serviceId, countryId, offerId?, maxPriceMicro?, idempotencyKey? }`. Picks the offer (pinned `offerId`, else cheapest in stock), rents a number from the enabled provider chain, debits `priceMicro`, creates a `waiting` order. → `201 OrderView`. Re-sending the same `idempotencyKey` returns the original order. |
| `GET /?status=&page=&limit=` | Your orders. `status` ∈ `all` \| `waiting` \| `completed` \| `canceled` \| `expired` \| `active` (alias for `waiting`). `limit` ≤ 100 (default 20). → `{ items: OrderView[], page, limit, total, totalPages }` |
| `GET /stats` | Dashboard figures: `balanceMicro`, order totals, `successRate` (0–1), 30-day `series` of orders + spend. → `OrderStatsResponse` |
| `GET /active` | Your still-`waiting` orders, newest first. → `OrderView[]` |
| `GET /:id` | One order with `messages[]`, `secondsLeft` (countdown to `expiresAt`) and `cancelLockSeconds` (post-purchase cancel lock). **Poll this** to watch for the OTP. → `OrderView` |
| `POST /:id/cancel` | Cancel a `waiting` order → **full refund** + stock returned + number released. → `OrderView` |
| `POST /:id/resend` | Ask the upstream for another SMS on a `waiting` order. **Free** — no new rental. `409` if the order isn't waiting or the provider can't resend. → `OrderView` |
| `POST /:id/reactivate` | On a `completed` order, buy another code on the **same number**. Charges the current tier price, reopens the order as `waiting`, keeps message history. `402` insufficient balance · `409` order not completed / provider can't reactivate. → `OrderView` |

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
| `GET /orders/active` | Still-`waiting` orders. → `{ data: V2Order[] }` |
| `GET /orders/:id` | Poll for the code. → `V2Order` = `{ id, status: waiting\|completed\|canceled\|expired, product:{service,country}, phone_number, price, otp_code, sms:[{sender,text,received_at}], created_at, expires_at, finished_at }` |
| `POST /orders/:id/finish` | Mark a `completed` order finished (sets `finished_at`) — client signals it is done with the number. |
| `POST /orders/:id/cancel` | Cancel + refund a `waiting` order (per-provider hold applies). |
| `POST /orders/:id/resend` | Request another SMS on a `waiting` order (free). |
| `POST /orders/:id/reactivate` | Buy another code on a `completed` order, same number (charged). |

`max_price` is a decimal USD string (`"0.50"`); a `400` is returned if it isn't parseable.

## Inbound SMS webhook — `/api/v1/webhooks` (public, no auth)

| Method / Path | What |
|---|---|
| `POST /webhooks/sms/:activationId` | A code delivery pushed in for provider activation `:activationId` (== our `Order.providerRef`). Finds the newest `waiting` order with that ref and completes it (`applyOtpToOrder` → stores the SMS, notifies). Body shape is tolerant: `code` / `otp_code` / `otp` for the code, `text` / `otp_message` / `full_sms` / `sms` / `message` for the raw SMS (also read from a nested `data` object, for smscode's `{ event, data:{…} }`). |

Responses (always `200` unless the body has neither a code nor text → `422`):
`{ ok:true, matched:false }` · `{ ok:true, matched:true, applied:false, status }` (already resolved) ·
`{ ok:true, matched:true, applied:true, orderId, otpCode }`.

It's an optional accelerator — the polling worker still delivers any code we never receive
a webhook for. smsgecko is the end of the line: an unmatched webhook is acked, not forwarded.

---

## Error shape

All errors: `{ "error": { "code": string, "message": string, "details"?: unknown } }`.
Validation failures are `400 bad_request` with `details` = the yup messages.

## Background workers (`WORKERS_ENABLED`)

- **Polling** (every 4 s) — asks each `waiting` order's provider for status; a delivered
  OTP → `applyOtpToOrder` (→ `completed`, stores messages, notifies). Also runs behind
  `POST /admin/orders/:id/repoll`.
- **Expiry** (every 8 s) — any `waiting` order past `expiresAt` → `refundWaitingOrder(…, 'expired')`.

Every `waiting` order is polled on a fixed cadence (`settings.providerPollIntervalMs`);
an order that never receives a code simply expires and refunds. (Tests use a `mock`
adapter fixture — `src/test/fake-sms-provider.ts` — that is never wired into a running
server.)
