"""Portfolio position aggregation and P&L from investment ledger."""

from __future__ import annotations

from typing import Any

from services import finance_store, quote_service, quote_settings
from services.investment_ledger import _sorted_investments
from services.portfolio_accounting import NEGATIVE_CASH_WARNING, aggregate_portfolio
from services.quote_symbol import infer_asset_type

LIVE_QUOTE_SOURCE = "live_quote"
FALLBACK_PRICE_SOURCE = "last_imported_unit_price"
NO_PRICE_SOURCE_LABEL = "Sin precio disponible"

LIVE_PROVIDERS = frozenset({"twelve_data", "alpha_vantage", "yfinance"})

PROVIDER_LABELS: dict[str, str] = {
    "twelve_data": "Twelve Data",
    "alpha_vantage": "Alpha Vantage",
    "yfinance": "Yahoo Finance (yfinance)",
    "last_imported_unit_price": "Último precio importado",
}

CONFIDENCE_LABELS: dict[str, str] = {
    "ok": "Confiable",
    "fallback": "Respaldo",
    "warning": "Revisar",
    "missing": "Sin precio",
}


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _round_money(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value, 2)


def _round_price(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value, 4)


def _price_source_label(source: str | None) -> str:
    if source == LIVE_QUOTE_SOURCE:
        return "Cotización actual"
    if source == FALLBACK_PRICE_SOURCE:
        return "Último precio importado"
    return NO_PRICE_SOURCE_LABEL


def _provider_label(provider: str | None) -> str:
    if not provider:
        return NO_PRICE_SOURCE_LABEL
    return PROVIDER_LABELS.get(provider, provider)


def _legacy_price_source(provider: str | None, confidence: str) -> str | None:
    if confidence == "missing" or provider is None:
        return None
    if provider == "last_imported_unit_price":
        return FALLBACK_PRICE_SOURCE
    if provider in LIVE_PROVIDERS:
        return LIVE_QUOTE_SOURCE
    return None


def _resolve_asset_types(investments: list[dict[str, Any]], assets: list[str]) -> dict[str, str]:
    by_asset: dict[str, str] = {}
    for row in reversed(_sorted_investments(investments)):
        asset = (row.get("asset") or "").strip()
        if not asset or asset in by_asset:
            continue
        by_asset[asset] = infer_asset_type(asset, row.get("asset_type"))
    for asset in assets:
        if asset not in by_asset:
            by_asset[asset] = infer_asset_type(asset, None)
    return by_asset


def _build_position_row(
    asset: str,
    state: dict[str, float],
    snapshot: quote_service.QuoteSnapshot,
) -> dict[str, Any]:
    qty = state["qty"]
    cost_basis = state["cost"]
    realized_sales = state["realized_sales"]
    dividends = state["dividends"]
    fees = state["fees"]
    capital_invested = state["capital_invested"]
    average_cost = cost_basis / qty if qty > 1e-12 else None

    price = snapshot.price
    unrealized: float | None = None
    unrealized_percent: float | None = None
    market_value: float | None = None
    if price is not None and qty > 0:
        market_value = qty * price
        unrealized = market_value - cost_basis
        if cost_basis > 0:
            unrealized_percent = (unrealized / cost_basis) * 100

    total_pnl = realized_sales + (unrealized or 0.0) + dividends
    total_return_percent: float | None = None
    if capital_invested > 0:
        total_return_percent = (total_pnl / capital_invested) * 100

    legacy_source = _legacy_price_source(snapshot.provider, snapshot.confidence)

    return {
        "asset": asset,
        "asset_type": snapshot.asset_type,
        "quantity": round(qty, 8),
        "cost_basis_usd": _round_money(cost_basis),
        "average_cost_usd": _round_price(average_cost),
        "market_price_usd": _round_price(price),
        "used_price_usd": _round_price(price),
        "currency": snapshot.currency,
        "quote_timestamp": snapshot.timestamp,
        "quote_provider": snapshot.provider,
        "quote_provider_label": _provider_label(snapshot.provider),
        "quote_confidence": snapshot.confidence,
        "quote_confidence_label": CONFIDENCE_LABELS.get(snapshot.confidence, snapshot.confidence),
        "is_delayed": snapshot.is_delayed,
        "delay_label": snapshot.delay_label,
        "quote_warnings": list(snapshot.warnings),
        "quote_candidates": snapshot.candidates or None,
        "price_source": legacy_source,
        "price_source_label": _price_source_label(legacy_source) if price is not None else NO_PRICE_SOURCE_LABEL,
        "market_value_usd": _round_money(market_value),
        "unrealized_pnl_usd": _round_money(unrealized),
        "unrealized_pnl_percent": _round_money(unrealized_percent),
        "realized_pnl_usd": _round_money(realized_sales),
        "dividends_usd": _round_money(dividends),
        "fees_paid_usd": _round_money(fees),
        "total_pnl_usd": _round_money(total_pnl),
        "total_return_percent": _round_money(total_return_percent),
    }


def _pick_strongest_asset(
    positions: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if not positions:
        return None

    def sort_key(pos: dict[str, Any]) -> float:
        if pos.get("market_value_usd") is not None:
            return float(pos["market_value_usd"])
        return float(pos.get("cost_basis_usd") or 0)

    best = max(positions, key=sort_key)
    total_value = sum(
        float(p.get("market_value_usd") or p.get("cost_basis_usd") or 0) for p in positions
    )
    best_value = float(best.get("market_value_usd") or best.get("cost_basis_usd") or 0)
    portfolio_percent = round((best_value / total_value) * 100, 1) if total_value > 0 else 0.0

    quote_missing = best.get("quote_confidence") == "missing"

    return {
        "asset": best["asset"],
        "market_value_usd": best.get("market_value_usd"),
        "cost_basis_usd": best.get("cost_basis_usd"),
        "portfolio_percent": portfolio_percent,
        "quote_missing": quote_missing,
    }


def _build_quote_sources(
    positions: list[dict[str, Any]],
    quotes_as_of: str | None,
) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for pos in positions:
        provider = pos.get("quote_provider") or "unknown"
        if provider not in grouped:
            grouped[provider] = {
                "provider": provider,
                "provider_label": _provider_label(provider),
                "symbols": [],
                "fetched_at": quotes_as_of,
                "delayed_count": 0,
            }
        grouped[provider]["symbols"].append(pos["asset"])
        if pos.get("is_delayed"):
            grouped[provider]["delayed_count"] += 1
    return list(grouped.values())


def get_portfolio_insights(investments: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    rows = _sorted_investments(investments)
    agg = aggregate_portfolio(rows)
    positions_state = agg["positions_state"]
    last_unit_prices = agg["last_unit_prices"]
    cash_available = agg["cash"]
    warnings = list(agg["warnings"])
    total_realized = agg["total_realized_sales"]
    total_dividends = agg["total_dividends"]
    total_fees = agg["total_fees"]
    total_deposits = agg["total_deposits"]

    open_positions = {asset: state for asset, state in positions_state.items() if state["qty"] > 1e-12}
    asset_types = _resolve_asset_types(rows, list(open_positions.keys()))

    quote_items = [
        {"symbol": asset, "asset_type": asset_types.get(asset, "stock")}
        for asset in open_positions
    ]
    imported_for_quotes = {asset.upper(): price for asset, price in last_unit_prices.items()}
    snapshots, price_alerts = quote_service.get_quote_snapshots(quote_items, imported_for_quotes)

    positions: list[dict[str, Any]] = []
    excluded_from_total: list[dict[str, str]] = []
    price_problem_assets: list[dict[str, Any]] = []
    total_unrealized = 0.0
    total_assets_value = 0.0
    total_assets_excluded = 0.0
    quotes_as_of: str | None = None
    quotes_partial = False

    for asset, state in sorted(open_positions.items()):
        snap = snapshots.get(asset)
        if snap is None:
            snap = quote_service.QuoteSnapshot(
                symbol=asset,
                price=None,
                currency="USD",
                timestamp=None,
                provider=None,
                confidence="missing",
                asset_type=asset_types.get(asset, "stock"),
            )
        row = _build_position_row(asset, state, snap)
        positions.append(row)

        if snap.timestamp and (quotes_as_of is None or snap.timestamp > quotes_as_of):
            quotes_as_of = snap.timestamp

        conf = snap.confidence
        if conf in ("ok", "fallback", "warning") and snap.price is not None:
            mv = state["qty"] * snap.price
            total_assets_value += mv
            total_unrealized += mv - state["cost"]
        elif conf == "missing":
            excluded_from_total.append({"asset": asset, "reason": "Sin precio de mercado"})
            total_assets_excluded += state["cost"]
        else:
            excluded_from_total.append({"asset": asset, "reason": "Precio no válido"})

        if conf in ("missing", "warning"):
            price_problem_assets.append(row)
        if conf in ("fallback", "warning", "missing"):
            quotes_partial = True

    total_pnl = total_unrealized + total_realized + total_dividends
    total_portfolio_value = total_assets_value + cash_available
    cash_warning = NEGATIVE_CASH_WARNING if cash_available < -1e-9 else None

    global_gain = total_portfolio_value - total_deposits
    total_return_percent: float | None = None
    if total_deposits > 0:
        total_return_percent = (global_gain / total_deposits) * 100

    quote_sources = _build_quote_sources(positions, quotes_as_of)

    broker_comparison: dict[str, float] | None = None
    qcfg = quote_settings.load_config()
    broker_ref = _to_float(qcfg.get("broker_reference_total_usd"))
    if broker_ref is not None and broker_ref > 0:
        diff_usd = total_portfolio_value - broker_ref
        diff_percent = (diff_usd / broker_ref) * 100 if broker_ref else 0.0
        broker_comparison = {
            "reference_total_usd": _round_money(broker_ref) or 0.0,
            "diff_usd": _round_money(diff_usd) or 0.0,
            "diff_percent": _round_money(diff_percent) or 0.0,
        }

    return {
        "positions": positions,
        "strongest_asset": _pick_strongest_asset(positions),
        "total_market_value_usd": _round_money(total_assets_value),
        "total_assets_value_usd": _round_money(total_assets_value),
        "total_assets_excluded_usd": _round_money(total_assets_excluded),
        "cash_available_usd": _round_money(cash_available),
        "total_portfolio_value_usd": _round_money(total_portfolio_value),
        "cash_warning": cash_warning,
        "warnings": warnings,
        "price_alerts": price_alerts,
        "price_problem_assets": price_problem_assets,
        "quote_sources": quote_sources,
        "excluded_from_total": excluded_from_total,
        "broker_comparison": broker_comparison,
        "total_unrealized_pnl_usd": _round_money(total_unrealized),
        "total_realized_pnl_usd": _round_money(total_realized),
        "total_dividends_usd": _round_money(total_dividends),
        "total_fees_usd": _round_money(total_fees),
        "total_pnl_usd": _round_money(total_pnl),
        "total_deposits_usd": _round_money(total_deposits),
        "global_gain_by_contributions_usd": _round_money(global_gain),
        "total_return_percent": _round_money(total_return_percent),
        "quotes_as_of": quotes_as_of,
        "quotes_partial": quotes_partial,
        "has_positions": len(positions) > 0,
    }


def get_portfolio_payload() -> dict[str, Any]:
    data = finance_store.load_data()
    return get_portfolio_insights(data.get("investments", []))
