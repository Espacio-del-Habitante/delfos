"""Cotizaciones vía yfinance (siempre disponible)."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import yfinance as yf

logger = logging.getLogger(__name__)

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


def _price_from_ticker(ticker: yf.Ticker) -> float | None:
    try:
        fast = getattr(ticker, "fast_info", None)
        if fast:
            for key in ("lastPrice", "last_price", "regularMarketPrice", "previousClose"):
                value = fast.get(key) if hasattr(fast, "get") else getattr(fast, key, None)
                if value is not None and float(value) > 0:
                    return float(value)
    except Exception:
        pass

    try:
        hist = ticker.history(period="1d", auto_adjust=False)
        if hist is not None and not hist.empty:
            close = hist["Close"].iloc[-1]
            if close and float(close) > 0:
                return float(close)
    except Exception:
        pass

    return None


def fetch_quote(normalized: dict) -> ProviderQuote | None:
    """Consulta yfinance para el símbolo normalizado."""
    if normalized.get("fixed_price") is not None:
        return ProviderQuote(
            price=float(normalized["fixed_price"]),
            currency="USD",
            timestamp=_now_iso(),
        )

    symbol = normalized.get("query_symbol")
    if not symbol:
        return None

    cache_key = ("yfinance", symbol)
    now = time.time()
    cached = _cache.get(cache_key)
    if cached and (now - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]

    try:
        ticker = yf.Ticker(symbol)
        price = _price_from_ticker(ticker)
        if price is None or price <= 0:
            return None
        quote = ProviderQuote(
            price=price,
            currency="USD",
            timestamp=_now_iso(),
            is_delayed=True,
            delay_label="delayed ~15min",
        )
        _cache[cache_key] = (now, quote)
        return quote
    except Exception as exc:
        logger.warning("yfinance fetch failed for %s: %s", symbol, exc)
        return None


def clear_cache() -> None:
    _cache.clear()
