from __future__ import annotations

from ._http import HttpClient
from .resources.catalog import CatalogResource
from .resources.orders import OrdersResource
from .resources.wallet import WalletResource
from .resources.webhook import WebhookResource


class SMSGeckoClient:
    """Client for the SMSGecko API (/api/v2). Holds a Bearer API key, so use
    this server-side only — never in a browser, mobile app, or any code that
    ships to an end user.

    Example:
        client = SMSGeckoClient(token=os.environ["SMSGECKO_TOKEN"])

        order = client.orders.create(
            catalog_product_id=os.environ["SMSGECKO_CATALOG_PRODUCT_ID"],
            max_price="0.50",
        )

        otp = client.orders.wait_for_otp(order.id, timeout_ms=120_000)
        print(otp.code)
        client.orders.finish(order.id)
    """

    def __init__(self, token: str, base_url: str = "http://localhost:4000", timeout: float = 15.0) -> None:
        http = HttpClient(token=token, base_url=base_url, timeout=timeout)
        self.orders = OrdersResource(http)
        self.catalog = CatalogResource(http)
        self.wallet = WalletResource(http)
        self.webhook = WebhookResource(http)
