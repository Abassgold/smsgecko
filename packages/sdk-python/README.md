# smsgecko

Official Python SDK for the SMSGecko API (`/api/v2`) — the same client
shown on the SMSGecko homepage's Quick Start. Zero third-party
dependencies (stdlib `urllib` only).

Server-side only: your API key is a secret Bearer token, so never ship this
package (or your key) into a browser bundle or mobile app.

## Install

Not published to PyPI yet — this package lives in the SMSGecko monorepo at
`packages/sdk-python`. Once published:

```
pip install smsgecko
```

## Usage

```python
import os
from smsgecko import SMSGeckoClient

client = SMSGeckoClient(
    token=os.environ["SMSGECKO_TOKEN"],
    # No public production API exists yet — point this at your own
    # deployment. Defaults to http://localhost:4000 for local dev.
    base_url="https://your-api-host.example.com",
)

order = client.orders.create(
    catalog_product_id=os.environ["SMSGECKO_CATALOG_PRODUCT_ID"],
    max_price="0.50",
)

otp = client.orders.wait_for_otp(order.id, timeout_ms=120_000)
print(otp.code)
client.orders.finish(order.id)
```

## API

- `client.orders.create(catalog_product_id=None, product_id=None, operator_id=None, max_price=None, quantity=None, idempotency_key=None)`
- `client.orders.get(order_id)`
- `client.orders.list_active()`
- `client.orders.finish(order_id)` / `.cancel(order_id)` / `.resend(order_id)` / `.reactivate(order_id)`
- `client.orders.wait_for_otp(order_id, timeout_ms=120_000, interval_ms=3_000)` —
  polls until an OTP arrives; raises `SMSGeckoTimeoutError` or
  `SMSGeckoOrderFailedError` otherwise. Its `OtpResult(code, order)` return
  is the one shape in this SDK that doesn't match the wire format 1:1 (see
  `types.py`) — every other dataclass here mirrors the real API response
  bodies field-for-field.
- `client.catalog.list_products(service=None, country=None, limit=None)`
- `client.wallet.get_balance()`
- `client.webhook.get()` / `.set(webhook_url=..., webhook_secret=..., regenerate_secret=...)` / `.test()`
  — `set()` uses a sentinel default so `webhook_url=None` (explicit clear)
  and simply not passing `webhook_url` (leave as-is) are distinguishable,
  matching the real API's semantics.

Every method raises `SMSGeckoError` (with `.status`, `.code`, `.message`,
`.details`) on a non-2xx or `{"success": false}` response — real codes come
straight from the API (e.g. `UNAUTHORIZED`, `VALIDATION_ERROR`,
`BAD_REQUEST`).

## Development

```
cd packages/sdk-python
PYTHONPATH=src python3 -m unittest discover -s tests -v
```

`tests/test_client.py` unit-tests the request/response handling and
`wait_for_otp` against a stubbed `urllib.request.urlopen`. It's also been
run live against a real running instance of `apps/api` (balance, catalog,
webhook config, and both an auth error and a validation error) — the full
order-creation happy path wasn't exercised live because doing so would
route through whichever real SMS-reseller provider your account has
enabled, which can be a real purchase; that's on you to test deliberately
once you're ready.
