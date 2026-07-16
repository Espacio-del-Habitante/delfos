"""Motor de cotizaciones en capas con trazabilidad por activo."""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from services import quote_settings
from services.quote_providers import alpha_vantage, twelve_data, yfinance
from services.quote_symbol import normalize_symbol

logger = logging.getLogger(__name__)

Confidence = str  # ok | fallback | warning | missing
ProviderName = str  # twelve_data | alpha_vantage | yfinance | last_imported_unit_price

_DIVERGENCE_THRESHOLD = 0.01
_MIXED_TIMESTAMP_MINUTES = 5

YFINANCE_INFO_ALERT = (
    "Cotizaciones vía yfinance (Twelve Data / Alpha Vantage no configurados)"
)


@dataclass
class QuoteSnapshot:
    symbol: str
    price: float | None
    currency: str
    timestamp: str | None
    provider: ProviderName | None
    confidence: Confidence
    is_delayed: bool = False
    delay_label: str | None = None
    candidates: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    asset_type: str = "stock"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def clear_cache() -> None:
    """Limpia caches de proveedores (útil en tests)."""
    yfinance.clear_cache()
    twelve_data.clear_cache()
    alpha_vantage.clear_cache()


def _pct_diff(a: float, b: float) -> float:
    if a <= 0 or b <= 0:
        return 0.0
    return abs(a - b) / max(a, b)


def _parse_ts(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        normalized = ts.replace("Z", "+00:00")
        if len(normalized) == 10:
            normalized += "T00:00:00+00:00"
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _build_chain(cfg: dict) -> list[tuple[str, Callable[[dict], Any]]]:
    # ponytail: proveedores premium se saltan si no hay key; yfinance siempre en la cadena
    chain: list[tuple[str, Callable[[dict], Any]]] = []
    if cfg.get("twelve_data_api_key"):
        chain.append(("twelve_data", twelve_data.fetch_quote))
    if cfg.get("alpha_vantage_api_key"):
        chain.append(("alpha_vantage", alpha_vantage.fetch_quote))
    chain.append(("yfinance", yfinance.fetch_quote))
    return chain


def _first_chain_index(chain: list[tuple[str, Callable]], provider: str | None) -> int:
    for idx, (name, _) in enumerate(chain):
        if name == provider:
            return idx
    return len(chain)


def _resolve_snapshot(
    symbol: str,
    asset_type: str,
    imported_price: float | None,
    chain: list[tuple[str, Callable[[dict], Any]]],
    normalized: dict,
) -> QuoteSnapshot:
    if not normalized.get("ok"):
        return QuoteSnapshot(
            symbol=symbol,
            price=None,
            currency="USD",
            timestamp=None,
            provider=None,
            confidence="missing",
            warnings=list(normalized.get("errors") or []),
            asset_type=asset_type or "stock",
        )

    resolved_type = normalized.get("asset_type") or asset_type or "stock"

    if normalized.get("fixed_price") is not None:
        return QuoteSnapshot(
            symbol=symbol,
            price=float(normalized["fixed_price"]),
            currency="USD",
            timestamp=datetime.now(timezone.utc).isoformat(),
            provider=None,
            confidence="ok",
            asset_type="cash",
        )

    api_hits: list[tuple[str, Any]] = []
    for name, fetcher in chain:
        try:
            quote = fetcher(normalized)
        except Exception as exc:
            logger.warning("Provider %s failed for %s: %s", name, symbol, exc)
            quote = None
        if quote is not None and quote.price > 0:
            api_hits.append((name, quote))

    candidates = [
        {
            "provider": name,
            "price": hit.price,
            "timestamp": hit.timestamp,
        }
        for name, hit in api_hits
    ]

    warnings: list[str] = []
    confidence: Confidence = "missing"
    chosen_provider: ProviderName | None = None
    chosen_price: float | None = None
    chosen_ts: str | None = None
    is_delayed = False
    delay_label: str | None = None

    if api_hits:
        winner_name, winner = api_hits[0]
        chosen_provider = winner_name  # type: ignore[assignment]
        chosen_price = winner.price
        chosen_ts = winner.timestamp
        is_delayed = winner.is_delayed
        delay_label = winner.delay_label

        winner_idx = _first_chain_index(chain, winner_name)
        confidence = "ok" if winner_idx == 0 else "fallback"

        if len(api_hits) > 1:
            for other_name, other in api_hits[1:]:
                diff = _pct_diff(winner.price, other.price)
                if diff > _DIVERGENCE_THRESHOLD:
                    pct = round(diff * 100, 2)
                    warnings.append(
                        f"Diferencia {pct}% entre {winner_name} y {other_name}"
                    )
                    confidence = "warning"
                    # Elegir el timestamp más reciente entre los que difieren
                    winner_dt = _parse_ts(winner.timestamp)
                    other_dt = _parse_ts(other.timestamp)
                    if other_dt and winner_dt and other_dt > winner_dt:
                        chosen_provider = other_name  # type: ignore[assignment]
                        chosen_price = other.price
                        chosen_ts = other.timestamp
                        is_delayed = other.is_delayed
                        delay_label = other.delay_label

    elif imported_price is not None and imported_price > 0:
        chosen_provider = "last_imported_unit_price"
        chosen_price = imported_price
        chosen_ts = None
        confidence = "fallback"
    else:
        return QuoteSnapshot(
            symbol=symbol,
            price=None,
            currency="USD",
            timestamp=None,
            provider=None,
            confidence="missing",
            candidates=candidates,
            warnings=warnings,
            asset_type=resolved_type,
        )

    return QuoteSnapshot(
        symbol=symbol,
        price=chosen_price,
        currency="USD",
        timestamp=chosen_ts,
        provider=chosen_provider,
        confidence=confidence,
        is_delayed=is_delayed,
        delay_label=delay_label,
        candidates=candidates,
        warnings=warnings,
        asset_type=resolved_type,
    )


def get_quote_snapshots(
    items: list[dict[str, str]],
    imported_prices: dict[str, float] | None = None,
) -> tuple[dict[str, QuoteSnapshot], list[str]]:
    """Resuelve cotizaciones por activo. Retorna snapshots indexados por símbolo original."""
    imported_prices = imported_prices or {}
    cfg = quote_settings.load_config()
    chain = _build_chain(cfg)
    global_alerts: list[str] = []

    has_premium = bool(cfg.get("twelve_data_api_key") or cfg.get("alpha_vantage_api_key"))
    if not has_premium and items:
        global_alerts.append(YFINANCE_INFO_ALERT)

    snapshots: dict[str, QuoteSnapshot] = {}
    timestamps: list[datetime] = []

    for item in items:
        symbol = (item.get("symbol") or "").strip()
        if not symbol:
            continue
        asset_type = item.get("asset_type") or "stock"
        normalized = normalize_symbol(symbol, asset_type)
        snap = _resolve_snapshot(
            symbol,
            asset_type,
            imported_prices.get(symbol.upper()) or imported_prices.get(symbol),
            chain,
            normalized,
        )
        snapshots[symbol] = snap
        ts = _parse_ts(snap.timestamp)
        if ts:
            timestamps.append(ts)

    if len(timestamps) > 1:
        spread_min = (max(timestamps) - min(timestamps)).total_seconds() / 60
        if spread_min > _MIXED_TIMESTAMP_MINUTES:
            global_alerts.append("Cotizaciones con timestamps mixtos")

    return snapshots, global_alerts


def get_quotes(tickers: list[str]) -> tuple[dict[str, float | None], str | None, bool]:
    """Compatibilidad legacy: devuelve precios planos desde snapshots."""
    items = [{"symbol": t, "asset_type": "stock"} for t in tickers]
    snapshots, _ = get_quote_snapshots(items)
    quotes: dict[str, float | None] = {}
    missing = False
    as_of: str | None = None
    for sym, snap in snapshots.items():
        key = sym.strip().upper()
        quotes[key] = snap.price
        if snap.price is None:
            missing = True
        if snap.timestamp and (as_of is None or snap.timestamp > as_of):
            as_of = snap.timestamp
    return quotes, as_of, missing


def test_provider_connection(cfg: dict | None = None) -> dict[str, Any]:
    """Prueba barata: AAPL o BTC/USD según keys disponibles."""
    cfg = cfg or quote_settings.load_config()
    chain = _build_chain(cfg)
    if not chain:
        return {"ok": False, "error": "Sin proveedores configurados"}

    probe_stock = normalize_symbol("AAPL", "stock")
    for name, fetcher in chain:
        quote = fetcher(probe_stock)
        if quote:
            return {"ok": True, "provider": name, "symbol": "AAPL", "price": quote.price}

    if cfg.get("alpha_vantage_api_key") or cfg.get("twelve_data_api_key"):
        probe_crypto = normalize_symbol("BTCUSD", "crypto")
        for name, fetcher in chain:
            quote = fetcher(probe_crypto)
            if quote:
                return {"ok": True, "provider": name, "symbol": "BTCUSD", "price": quote.price}

    return {"ok": False, "error": "Ningún proveedor respondió con AAPL o BTCUSD"}
