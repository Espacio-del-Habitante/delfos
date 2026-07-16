"""Cotizaciones vía Alpha Vantage (GLOBAL_QUOTE + crypto USD)."""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone

from services import quote_settings

logger = logging.getLogger(__name__)

_BASE_URL = "https://www.alphavantage.co/query"
_CACHE_TTL_SECONDS = 15 * 60
_cache: dict[tuple[str, str], tuple[float, ProviderQuote]] = {}


@dataclass
class ProviderQuote:
    price: float
    currency: str
    timestamp: str
    is_delayed: bool = False
    delay_label: str | None = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fetch_json(params: dict[str, str]) -> dict | None:
    cfg = quote_settings.load_config()
    api_key = (cfg.get("alpha_vantage_api_key") or "").strip()
    if not api_key:
        return None
    params = {**params, "apikey": api_key}
    url = f"{_BASE_URL}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(url, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("Alpha Vantage fetch failed: %s", exc)
        return None
    return data if isinstance(data, dict) else None


def _quote_from_global(payload: dict) -> ProviderQuote | None:
    gq = payload.get("Global Quote") or payload.get("globalQuote")
    if not isinstance(gq, dict):
        return None
    price_raw = gq.get("05. price") or gq.get("price")
    if price_raw is None:
        return None
    try:
        price = float(price_raw)
    except (TypeError, ValueError):
        return None
    if price <= 0:
        return None
    ts = gq.get("07. latest trading day") or _now_iso()
    return ProviderQuote(
        price=price,
        currency="USD",
        timestamp=str(ts),
        is_delayed=True,
        delay_label="delayed EOD",
    )


def _quote_from_crypto(payload: dict) -> ProviderQuote | None:
    rt = payload.get("Realtime Currency Exchange Rate")
    if not isinstance(rt, dict):
        return None
    price_raw = rt.get("5. Exchange Rate")
    if price_raw is None:
        return None
    try:
        price = float(price_raw)
    except (TypeError, ValueError):
        return None
    if price <= 0:
        return None
    ts = rt.get("6. Last Refreshed") or _now_iso()
    return ProviderQuote(
        price=price,
        currency="USD",
        timestamp=str(ts),
        is_delayed=False,
    )


def fetch_quote(normalized: dict) -> ProviderQuote | None:
    asset_type = normalized.get("asset_type", "stock")
    symbol = normalized.get("alpha_vantage_symbol") or normalized.get("query_symbol")
    if not symbol:
        return None

    cache_key = ("alpha_vantage", f"{asset_type}:{symbol}")
    now = time.time()
    cached = _cache.get(cache_key)
    if cached and (now - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]

    if asset_type == "crypto":
        payload = _fetch_json(
            {
                "function": "CURRENCY_EXCHANGE_RATE",
                "from_currency": symbol,
                "to_currency": "USD",
            }
        )
        quote = _quote_from_crypto(payload) if payload else None
    else:
        payload = _fetch_json({"function": "GLOBAL_QUOTE", "symbol": symbol})
        quote = _quote_from_global(payload) if payload else None

    if quote is None:
        return None
    _cache[cache_key] = (now, quote)
    return quote


def clear_cache() -> None:
    _cache.clear()
