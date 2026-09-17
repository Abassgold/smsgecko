import io
import json
import unittest
import urllib.error
from unittest.mock import patch

from smsgecko import (
    SMSGeckoClient,
    SMSGeckoError,
    SMSGeckoOrderFailedError,
    SMSGeckoTimeoutError,
)


def _order(**overrides):
    base = {
        "id": "ord_1",
        "status": "waiting",
        "product": {"service": "WhatsApp", "country": "United States"},
        "phone_number": "+15551234567",
        "price": "0.47",
        "otp_code": None,
        "sms": [],
        "created_at": "2026-01-01T00:00:00.000Z",
        "expires_at": "2026-01-01T00:20:00.000Z",
        "finished_at": None,
    }
    base.update(overrides)
    return base


class _FakeResponse:
    """Stands in for the object urllib.request.urlopen() returns — a
    context manager with .status and .read()."""

    def __init__(self, status, body):
        self.status = status
        self._body = json.dumps(body).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return self._body


def _http_error(status, body):
    fp = io.BytesIO(json.dumps(body).encode("utf-8"))
    return urllib.error.HTTPError(url="http://x", code=status, msg="err", hdrs=None, fp=fp)


class ClientTests(unittest.TestCase):
    @patch("smsgecko._http.urllib.request.urlopen")
    def test_sends_bearer_token_and_hits_the_real_v2_path(self, mock_urlopen):
        mock_urlopen.return_value = _FakeResponse(200, {"success": True, "data": {"balance": "12.50"}})
        client = SMSGeckoClient(token="smsg_live_test", base_url="https://api.example.com")

        balance = client.wallet.get_balance()

        self.assertEqual(balance.balance, "12.50")
        req = mock_urlopen.call_args[0][0]
        self.assertEqual(req.full_url, "https://api.example.com/api/v2/balance")
        self.assertEqual(req.get_header("Authorization"), "Bearer smsg_live_test")

    @patch("smsgecko._http.urllib.request.urlopen")
    def test_create_unwraps_data_and_sends_an_idempotency_key(self, mock_urlopen):
        mock_urlopen.return_value = _FakeResponse(201, {"success": True, "data": _order()})
        client = SMSGeckoClient(token="t")

        order = client.orders.create(catalog_product_id="prod_1", max_price="0.50")

        self.assertEqual(order.id, "ord_1")
        req = mock_urlopen.call_args[0][0]
        self.assertEqual(req.get_method(), "POST")
        self.assertEqual(json.loads(req.data.decode("utf-8")), {"catalog_product_id": "prod_1", "max_price": "0.50"})
        self.assertIsNotNone(req.get_header("Idempotency-key"))

    @patch("smsgecko._http.urllib.request.urlopen")
    def test_respects_an_explicit_idempotency_key(self, mock_urlopen):
        mock_urlopen.return_value = _FakeResponse(201, {"success": True, "data": _order()})
        client = SMSGeckoClient(token="t")

        client.orders.create(catalog_product_id="prod_1", idempotency_key="my-key-12345")

        req = mock_urlopen.call_args[0][0]
        self.assertEqual(req.get_header("Idempotency-key"), "my-key-12345")

    @patch("smsgecko._http.urllib.request.urlopen")
    def test_omits_none_query_params(self, mock_urlopen):
        mock_urlopen.return_value = _FakeResponse(200, {"success": True, "data": []})
        client = SMSGeckoClient(token="t", base_url="https://api.example.com")

        client.catalog.list_products(service="whatsapp")

        req = mock_urlopen.call_args[0][0]
        self.assertEqual(req.full_url, "https://api.example.com/api/v2/catalog/products?service=whatsapp")

    @patch("smsgecko._http.urllib.request.urlopen")
    def test_raises_smsgecko_error_with_the_real_code_message_status(self, mock_urlopen):
        mock_urlopen.side_effect = _http_error(
            401, {"success": False, "error": {"code": "UNAUTHORIZED", "message": "Invalid or revoked API key"}}
        )
        client = SMSGeckoClient(token="bad")

        with self.assertRaises(SMSGeckoError) as ctx:
            client.wallet.get_balance()
        self.assertEqual(ctx.exception.status, 401)
        self.assertEqual(ctx.exception.code, "UNAUTHORIZED")
        self.assertEqual(ctx.exception.message, "Invalid or revoked API key")

    @patch("smsgecko._http.urllib.request.urlopen")
    def test_carries_validation_details_through(self, mock_urlopen):
        details = ["catalog_product_id is required"]
        mock_urlopen.side_effect = _http_error(
            400,
            {
                "success": False,
                "error": {"code": "VALIDATION_ERROR", "message": "Request validation failed", "details": details},
            },
        )
        client = SMSGeckoClient(token="t")

        with self.assertRaises(SMSGeckoError) as ctx:
            client.orders.create()
        self.assertEqual(ctx.exception.code, "VALIDATION_ERROR")
        self.assertEqual(ctx.exception.details, details)

    @patch("smsgecko._http.urllib.request.urlopen")
    def test_webhook_set_distinguishes_omitted_from_explicit_none(self, mock_urlopen):
        mock_urlopen.return_value = _FakeResponse(
            200, {"success": True, "data": {"webhook_url": None, "webhook_secret": None}}
        )
        client = SMSGeckoClient(token="t")

        client.webhook.set(webhook_url=None)

        req = mock_urlopen.call_args[0][0]
        # webhook_url explicitly present (as null) to clear it; the other
        # two fields were never mentioned, so they must be entirely absent.
        self.assertEqual(json.loads(req.data.decode("utf-8")), {"webhook_url": None})

    @patch("smsgecko._http.urllib.request.urlopen")
    def test_wait_for_otp_returns_as_soon_as_otp_code_appears(self, mock_urlopen):
        mock_urlopen.side_effect = [
            _FakeResponse(200, {"success": True, "data": _order()}),
            _FakeResponse(200, {"success": True, "data": _order()}),
            _FakeResponse(200, {"success": True, "data": _order(otp_code="482913")}),
        ]
        client = SMSGeckoClient(token="t")

        result = client.orders.wait_for_otp("ord_1", interval_ms=1, timeout_ms=10_000)

        self.assertEqual(result.code, "482913")
        self.assertEqual(mock_urlopen.call_count, 3)

    @patch("smsgecko._http.urllib.request.urlopen")
    def test_wait_for_otp_raises_order_failed_on_expired(self, mock_urlopen):
        mock_urlopen.return_value = _FakeResponse(200, {"success": True, "data": _order(status="expired")})
        client = SMSGeckoClient(token="t")

        with self.assertRaises(SMSGeckoOrderFailedError) as ctx:
            client.orders.wait_for_otp("ord_1", interval_ms=1)
        self.assertEqual(ctx.exception.status, "expired")

    @patch("smsgecko._http.urllib.request.urlopen")
    def test_wait_for_otp_raises_timeout(self, mock_urlopen):
        mock_urlopen.return_value = _FakeResponse(200, {"success": True, "data": _order()})
        client = SMSGeckoClient(token="t")

        with self.assertRaises(SMSGeckoTimeoutError):
            client.orders.wait_for_otp("ord_1", timeout_ms=5, interval_ms=10)


if __name__ == "__main__":
    unittest.main()
