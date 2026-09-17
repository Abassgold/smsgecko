from __future__ import annotations

import time
import urllib.parse
import uuid
from typing import Optional

from .._http import HttpClient
from ..errors import SMSGeckoOrderFailedError, SMSGeckoTimeoutError
from ..types import Order, OtpResult


class OrdersResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def create(
        self,
        catalog_product_id: Optional[str] = None,
        product_id: Optional[str] = None,
        operator_id: Optional[str] = None,
        max_price: Optional[str] = None,
        quantity: Optional[int] = None,
        idempotency_key: Optional[str] = None,
    ) -> Order:
        """POST /orders — reserves a virtual number for the given product.
        idempotency_key makes retrying a failed request safe: a repeated key
        within its window returns the original order instead of creating a
        second one. A fresh one is generated for you if you don't pass one."""
        body = {
            k: v
            for k, v in {
                "catalog_product_id": catalog_product_id,
                "product_id": product_id,
                "operator_id": operator_id,
                "max_price": max_price,
                "quantity": quantity,
            }.items()
            if v is not None
        }
        data = self._http.request(
            "POST", "/orders", body=body, idempotency_key=idempotency_key or str(uuid.uuid4())
        )
        return Order._from_dict(data)

    def get(self, order_id: str) -> Order:
        """GET /orders/:id"""
        data = self._http.request("GET", f"/orders/{urllib.parse.quote(order_id, safe='')}")
        return Order._from_dict(data)

    def list_active(self) -> list:
        """GET /orders/active — every order of yours still in the `waiting` state."""
        data = self._http.request("GET", "/orders/active")
        return [Order._from_dict(o) for o in data]

    def finish(self, order_id: str) -> Order:
        """POST /orders/:id/finish — releases the number and settles the
        charge. Call this once you've read the OTP and are done with the
        number."""
        data = self._http.request("POST", f"/orders/{urllib.parse.quote(order_id, safe='')}/finish")
        return Order._from_dict(data)

    def cancel(self, order_id: str) -> Order:
        """POST /orders/:id/cancel — cancels before an OTP arrives (refunds if eligible)."""
        data = self._http.request("POST", f"/orders/{urllib.parse.quote(order_id, safe='')}/cancel")
        return Order._from_dict(data)

    def resend(self, order_id: str) -> Order:
        """POST /orders/:id/resend — asks the provider to resend the SMS to the same number."""
        data = self._http.request("POST", f"/orders/{urllib.parse.quote(order_id, safe='')}/resend")
        return Order._from_dict(data)

    def reactivate(self, order_id: str) -> Order:
        """POST /orders/:id/reactivate — requests a second code on the same
        number, after the first one already arrived."""
        data = self._http.request("POST", f"/orders/{urllib.parse.quote(order_id, safe='')}/reactivate")
        return Order._from_dict(data)

    def wait_for_otp(self, order_id: str, timeout_ms: int = 120_000, interval_ms: int = 3_000) -> OtpResult:
        """Polls GET /orders/:id until otp_code is set, the order leaves
        `waiting` some other way (raises SMSGeckoOrderFailedError if
        canceled/expired), or timeout_ms elapses (raises
        SMSGeckoTimeoutError).

        This is a convenience helper, not a single API call — see
        types.OtpResult for why its `code` field isn't `otp_code`.
        """
        deadline = time.monotonic() + timeout_ms / 1000
        while True:
            order = self.get(order_id)
            if order.otp_code:
                return OtpResult(code=order.otp_code, order=order)
            if order.status in ("canceled", "expired"):
                raise SMSGeckoOrderFailedError(order_id, order.status)
            if time.monotonic() + interval_ms / 1000 > deadline:
                raise SMSGeckoTimeoutError(order_id, timeout_ms)
            time.sleep(interval_ms / 1000)
