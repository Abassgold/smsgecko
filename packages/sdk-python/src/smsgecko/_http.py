from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

from .errors import SMSGeckoError


class HttpClient:
    """Thin wrapper over the real /api/v2 wire format — every response is
    `{"success": true, "data": ...}` or `{"success": false, "error": {...}}`
    (see apps/api/src/controllers/v2.controller.ts#ok / v2ErrorHandler in the
    SMSGecko repo). Resource classes call `request()` and get back the
    unwrapped `data`, or a raised SMSGeckoError. Zero third-party
    dependencies — stdlib `urllib` only.
    """

    def __init__(self, token: str, base_url: str = "http://localhost:4000", timeout: float = 15.0) -> None:
        if not token:
            raise ValueError("SMSGeckoClient requires a `token`")
        self._token = token
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout

    def request(
        self,
        method: str,
        path: str,
        *,
        query: Optional[dict] = None,
        body: Optional[dict] = None,
        idempotency_key: Optional[str] = None,
    ) -> Any:
        url = f"{self._base_url}/api/v2{path}"
        if query:
            clean = {k: v for k, v in query.items() if v is not None}
            if clean:
                url += "?" + urllib.parse.urlencode(clean)

        headers = {"Authorization": f"Bearer {self._token}"}
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as res:
                status = res.status
                payload = json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            status = e.code
            try:
                payload = json.loads(e.read().decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError) as parse_err:
                raise SMSGeckoError(
                    status, "INVALID_RESPONSE", "Response body was not valid JSON"
                ) from parse_err
        except urllib.error.URLError as e:
            raise SMSGeckoError(0, "NETWORK_ERROR", str(e.reason)) from e

        if not payload.get("success"):
            err = payload.get("error") or {
                "code": "UNKNOWN_ERROR",
                "message": f"Request failed with status {status}",
            }
            raise SMSGeckoError(status, err.get("code", "UNKNOWN_ERROR"), err.get("message", ""), err.get("details"))

        return payload.get("data")
