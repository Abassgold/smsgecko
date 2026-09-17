# @smsgecko/sdk

Official TypeScript/JavaScript SDK for the SMSGecko API (`/api/v2`) — the
same client shown on the SMSGecko homepage's Quick Start.

Server-side only: your API key is a secret Bearer token, so never ship this
package (or your key) into a browser bundle or mobile app.

## Install

Not published to npm yet — this package lives in the SMSGecko monorepo at
`packages/sdk`. Once published:

```
npm install @smsgecko/sdk
```

## Usage

```ts
import { SMSGeckoClient } from "@smsgecko/sdk";

const client = new SMSGeckoClient({
  token: process.env.SMSGECKO_TOKEN!,
  // No public production API exists yet — point this at your own
  // deployment. Defaults to http://localhost:4000 for local dev.
  baseUrl: "https://your-api-host.example.com",
});

const order = await client.orders.create({
  catalog_product_id: process.env.SMSGECKO_CATALOG_PRODUCT_ID,
  max_price: "0.50",
});

const { otpCode } = await client.orders.waitForOtp(order.id, { timeoutMs: 120_000 });
console.log(otpCode);
await client.orders.finish(order.id);
```

## API

- `client.orders.create(params, { idempotencyKey? })` — reserves a number.
- `client.orders.get(id)`
- `client.orders.listActive()`
- `client.orders.finish(id)` / `.cancel(id)` / `.resend(id)` / `.reactivate(id)`
- `client.orders.waitForOtp(id, { timeoutMs?, intervalMs? })` — polls until
  an OTP arrives; throws `SMSGeckoTimeoutError` or `SMSGeckoOrderFailedError`
  otherwise. Its `{ otpCode, order }` return is the one field name in this
  SDK that doesn't match the wire format 1:1 (see `src/types.ts`) — every
  other type here mirrors the real API response bodies exactly, snake_case
  included, so what you see in these types is what you'll see in a raw
  response body too.
- `client.catalog.listProducts({ service?, country?, limit? })`
- `client.wallet.getBalance()`
- `client.webhook.get()` / `.set(params)` / `.test()`

Every method throws `SMSGeckoError` (with `status`, `code`, `message`,
`details`) on a non-2xx or `{ success: false }` response — real codes come
straight from the API (e.g. `UNAUTHORIZED`, `VALIDATION_ERROR`,
`BAD_REQUEST`).

## Development

```
npm run -w packages/sdk build       # tsup -> dist/
npm run -w packages/sdk typecheck
npm run -w packages/sdk test        # vitest, stubbed fetch
```

`src/client.test.ts` unit-tests the request/response handling and
`waitForOtp` against a stubbed `fetch`. It's also been run live against a
real running instance of `apps/api` (balance, catalog, webhook config, and
both an auth error and a validation error) — the full order-creation happy
path wasn't exercised live because doing so would route through whichever
real SMS-reseller provider your account has enabled, which can be a real
purchase; that's on you to test deliberately once you're ready.
