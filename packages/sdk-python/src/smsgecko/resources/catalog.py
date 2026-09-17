from __future__ import annotations

from typing import Optional

from .._http import HttpClient
from ..types import CatalogProduct


class CatalogResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def list_products(
        self,
        service: Optional[str] = None,
        country: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> list:
        """GET /catalog/products — omit `service` to get the list of
        services themselves (one row each, no country/price yet); pass it to
        get the countries/prices available for that service."""
        data = self._http.request(
            "GET", "/catalog/products", query={"service": service, "country": country, "limit": limit}
        )
        return [CatalogProduct._from_dict(p) for p in data]
