from __future__ import annotations

from typing import Any, Optional


class SMSGeckoError(Exception):
    """Every /api/v2 error response is `{"success": false, "error": {"code",
    "message", "details"?}}` (see apps/api/src/lib/errors.ts#classifyError in
    the SMSGecko repo). This wraps that shape so you can catch one exception
    type instead of checking status codes yourself.
    """

    def __init__(self, status: int, code: str, message: str, details: Optional[Any] = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details

    def __repr__(self) -> str:
        return f"SMSGeckoError(status={self.status!r}, code={self.code!r}, message={self.message!r})"


class SMSGeckoTimeoutError(Exception):
    """Raised by orders.wait_for_otp() when timeout_ms elapses while the
    order is still `waiting`."""

    def __init__(self, order_id: str, timeout_ms: int) -> None:
        super().__init__(f"No OTP received for order {order_id} within {timeout_ms}ms")
        self.order_id = order_id
        self.timeout_ms = timeout_ms


class SMSGeckoOrderFailedError(Exception):
    """Raised by orders.wait_for_otp() when the order leaves `waiting` some
    other way (canceled or expired) before an OTP arrived — distinct from a
    timeout, since waiting longer wouldn't have helped."""

    def __init__(self, order_id: str, status: str) -> None:
        super().__init__(f"Order {order_id} {status} before an OTP arrived")
        self.order_id = order_id
        self.status = status
