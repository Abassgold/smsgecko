"""
Every field name here matches the real API's wire format exactly (see
apps/api/src/services/v2.mapper.ts#toV2Order in the SMSGecko repo) — no
translation, so what you'd see in a raw response body is what these
dataclasses hold. The one deliberate exception is `OtpResult` (see
resources/orders.py), a synthesized convenience result that isn't a single
API response body.

`WebhookTestResult.status_code` is the one field that IS translated: the
wire field is `statusCode` (camelCase — the one inconsistency in an
otherwise snake_case API), which isn't valid as a bare Python attribute
name convention, so it's exposed here as `status_code`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class Product:
    service: str
    country: str


@dataclass
class OrderMessage:
    sender: str
    text: str
    received_at: str

    @classmethod
    def _from_dict(cls, d: dict) -> "OrderMessage":
        return cls(sender=d["sender"], text=d["text"], received_at=d["received_at"])


@dataclass
class Order:
    id: str
    status: str
    product: Product
    phone_number: str
    price: str
    otp_code: Optional[str]
    sms: list
    created_at: str
    expires_at: str
    finished_at: Optional[str]

    @classmethod
    def _from_dict(cls, d: dict) -> "Order":
        return cls(
            id=d["id"],
            status=d["status"],
            product=Product(service=d["product"]["service"], country=d["product"]["country"]),
            phone_number=d["phone_number"],
            price=d["price"],
            otp_code=d.get("otp_code"),
            sms=[OrderMessage._from_dict(m) for m in d.get("sms", [])],
            created_at=d["created_at"],
            expires_at=d["expires_at"],
            finished_at=d.get("finished_at"),
        )


@dataclass
class CatalogProduct:
    id: str
    service: str
    service_slug: str
    country: str
    country_code: str
    operator: Optional[str]
    price: str
    stock: int

    @classmethod
    def _from_dict(cls, d: dict) -> "CatalogProduct":
        return cls(
            id=d["id"],
            service=d["service"],
            service_slug=d["service_slug"],
            country=d["country"],
            country_code=d["country_code"],
            operator=d.get("operator"),
            price=d["price"],
            stock=d["stock"],
        )


@dataclass
class Balance:
    balance: str

    @classmethod
    def _from_dict(cls, d: dict) -> "Balance":
        return cls(balance=d["balance"])


@dataclass
class WebhookConfig:
    webhook_url: Optional[str]
    webhook_secret: Optional[str]

    @classmethod
    def _from_dict(cls, d: dict) -> "WebhookConfig":
        return cls(webhook_url=d.get("webhook_url"), webhook_secret=d.get("webhook_secret"))


@dataclass
class WebhookTestResult:
    delivered: bool
    status_code: Optional[int]
    error: Optional[str] = None

    @classmethod
    def _from_dict(cls, d: dict) -> "WebhookTestResult":
        return cls(delivered=d["delivered"], status_code=d.get("statusCode"), error=d.get("error"))


@dataclass
class OtpResult:
    """Returned by orders.wait_for_otp(). `code` is deliberately short
    (matching the SDK quickstart's own `otp.code` example) rather than
    `otp_code`, since this isn't a raw API field — it's synthesized from
    whichever poll first saw a non-null otp_code."""

    code: str
    order: Order
