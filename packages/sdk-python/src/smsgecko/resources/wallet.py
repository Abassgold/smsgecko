from __future__ import annotations

from .._http import HttpClient
from ..types import Balance


class WalletResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def get_balance(self) -> Balance:
        """GET /balance"""
        return Balance._from_dict(self._http.request("GET", "/balance"))
