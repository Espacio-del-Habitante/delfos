"""Cotizaciones vía Twelve Data REST (/price)."""

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

_BASE_URL = "https://api.twelvedata.com/price"
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


def _parse_timestamp(raw: str | None) -> str:
    if not raw:
        return _now_iso()
    return raw


def fetch_quote(normalized: dict) -> ProviderQuote | None:
    cfg = quote_settings.load_config()
    api_key = (cfg.get("twelve_data_api_key") or "").strip()
    if not api_key:
        return None

    symbol = normalized.get("twelve_data_symbol") or normalized.get("query_symbol")
    if not symbol:
        return None

    cache_key = ("twelve_data", symbol)
    now = time.time()
    cached = _cache.get(cache_key)
    if cached and (now - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]

    params = urllib.parse.urlencode({"symbol": symbol, "apikey": api_key})
    url = f"{_BASE_URL}?{params}"
    try:
        with urllib.request.urlopen(url, timeout=12) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("Twelve Data fetch failed for %s: %s", symbol, exc)
        return None

    if not isinstance(payload, dict) or payload.get("status") == "error":
        return None

    price_raw = payload.get("price")
    if price_raw is None:
        return None
    try:
        price = float(price_raw)
    except (TypeError, ValueError):
        return None
    if price <= 0:
        return None

    ts = _parse_timestamp(payload.get("datetime"))
    is_delayed = bool(payload.get("is_delayed"))
    delay_label = "delayed 15min" if is_delayed else None

    quote = ProviderQuote(
        price=price,
        currency="USD",
        timestamp=ts,
        is_delayed=is_delayed,
        delay_label=delay_label,
    )
    _cache[cache_key] = (now, quote)
    return quote


def clear_cache() -> None:
    _cache.clear()
