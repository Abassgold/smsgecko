from __future__ import annotations

from typing import Any, Optional

from .._http import HttpClient
from ..types import WebhookConfig, WebhookTestResult

# Sentinel so set() can tell "you didn't pass webhook_url" apart from "you
# passed webhook_url=None" — the API treats an explicit null as "clear the
# webhook (and its secret)" and an omitted key as "leave it as-is". A plain
# `= None` default couldn't tell those two cases apart.
_UNSET: Any = object()


class WebhookResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def get(self) -> WebhookConfig:
        """GET /webhook — your currently configured webhook URL/secret."""
        return WebhookConfig._from_dict(self._http.request("GET", "/webhook"))

    def set(
        self,
        webhook_url: Optional[str] = _UNSET,
        webhook_secret: str = _UNSET,
        regenerate_secret: bool = _UNSET,
    ) -> WebhookConfig:
        """PATCH /webhook — set or clear your webhook URL, and/or rotate its
        secret. Pass `webhook_url=None` explicitly to clear it; omit the
        argument entirely to leave the current one untouched."""
        body: dict = {}
        if webhook_url is not _UNSET:
            body["webhook_url"] = webhook_url
        if webhook_secret is not _UNSET:
            body["webhook_secret"] = webhook_secret
        if regenerate_secret is not _UNSET:
            body["regenerate_secret"] = regenerate_secret
        return WebhookConfig._from_dict(self._http.request("PATCH", "/webhook", body=body))

    def test(self) -> WebhookTestResult:
        """POST /webhook/test — sends a synthetic `webhook.test` event to
        your configured URL right now. Raises SMSGeckoError if no
        webhook_url is set yet."""
        return WebhookTestResult._from_dict(self._http.request("POST", "/webhook/test"))
