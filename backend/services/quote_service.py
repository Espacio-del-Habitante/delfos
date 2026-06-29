"""Live stock quotes via yfinance with in-memory TTL cache."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

import yfinance as yf

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 15 * 60
_cache: dict[str, tuple[float, float]] = {}
_cache_as_of: str | None = None


def _normalize_ticker(symbol: str) -> str:
    return symbol.strip().upper()


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


def _fetch_single_price(symbol: str) -> float | None:
    try:
        ticker = yf.Ticker(symbol)
        return _price_from_ticker(ticker)
    except Exception as exc:
        logger.warning("Quote fetch failed for %s: %s", symbol, exc)
        return None


def get_quotes(tickers: list[str]) -> tuple[dict[str, float | None], str | None, bool]:
    """Return (quotes, as_of_iso, partial_missing)."""
    global _cache_as_of

    now = time.time()
    unique = []
    seen: set[str] = set()
    for raw in tickers:
        symbol = _normalize_ticker(raw)
        if symbol and symbol not in seen:
            seen.add(symbol)
            unique.append(symbol)

    if not unique:
        return {}, _cache_as_of, False

    quotes: dict[str, float | None] = {}
    missing = False
    fetched_any = False

    for symbol in unique:
        cached = _cache.get(symbol)
        if cached and (now - cached[0]) < _CACHE_TTL_SECONDS:
            quotes[symbol] = cached[1]
            continue

        price = _fetch_single_price(symbol)
        if price is not None:
            _cache[symbol] = (now, price)
            quotes[symbol] = price
            fetched_any = True
        else:
            quotes[symbol] = None
            missing = True

    if fetched_any or _cache_as_of is None:
        _cache_as_of = datetime.now(timezone.utc).isoformat()

    return quotes, _cache_as_of, missing


def clear_cache() -> None:
    """Clear quote cache (useful in tests)."""
    global _cache_as_of
    _cache.clear()
    _cache_as_of = None
