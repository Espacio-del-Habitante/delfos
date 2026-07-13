"""Portfolio position aggregation and P&L from investment ledger."""

from __future__ import annotations

from typing import Any

from services import finance_store, quote_service
from services.investment_ledger import _sorted_investments
from services.portfolio_accounting import NEGATIVE_CASH_WARNING, aggregate_portfolio

LIVE_QUOTE_SOURCE = "live_quote"
FALLBACK_PRICE_SOURCE = "last_imported_unit_price"
NO_PRICE_SOURCE_LABEL = "Sin precio disponible"


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _price_source_label(source: str | None) -> str:
    if source == LIVE_QUOTE_SOURCE:
        return "Cotización actual"
    if source == FALLBACK_PRICE_SOURCE:
        return "Último precio importado"
    return NO_PRICE_SOURCE_LABEL


def _build_position_row(
    asset: str,
    state: dict[str, float],
    price: float | None,
    *,
    price_source: str | None,
) -> dict[str, Any]:
    qty = state["qty"]
    cost_basis = state["cost"]
    realized_sales = state["realized_sales"]
    dividends = state["dividends"]
    fees = state["fees"]
    capital_invested = state["capital_invested"]
    average_cost = cost_basis / qty if qty > 1e-12 else None

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

    return {
        "asset": asset,
        "quantity": round(qty, 8),
        "cost_basis_usd": round(cost_basis, 2),
        "average_cost_usd": round(average_cost, 4) if average_cost is not None else None,
        "market_price_usd": round(price, 4) if price is not None else None,
        "used_price_usd": round(price, 4) if price is not None else None,
        "price_source": price_source,
        "price_source_label": _price_source_label(price_source) if price is not None else NO_PRICE_SOURCE_LABEL,
        "market_value_usd": round(market_value, 2) if market_value is not None else None,
        "unrealized_pnl_usd": round(unrealized, 2) if unrealized is not None else None,
        "unrealized_pnl_percent": round(unrealized_percent, 2) if unrealized_percent is not None else None,
        "realized_pnl_usd": round(realized_sales, 2),
        "dividends_usd": round(dividends, 2),
        "fees_paid_usd": round(fees, 2),
        "total_pnl_usd": round(total_pnl, 2),
        "total_return_percent": round(total_return_percent, 2) if total_return_percent is not None else None,
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

    return {
        "asset": best["asset"],
        "market_value_usd": best.get("market_value_usd"),
        "cost_basis_usd": best.get("cost_basis_usd"),
        "portfolio_percent": portfolio_percent,
        "quote_missing": best.get("price_source") != LIVE_QUOTE_SOURCE,
    }


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
    tickers = list(open_positions.keys())
    quotes, quotes_as_of, quotes_partial = quote_service.get_quotes(tickers)

    positions: list[dict[str, Any]] = []
    total_unrealized = 0.0
    for asset, state in sorted(open_positions.items()):
        quote_price = _to_float(quotes.get(asset))
        fallback_price = last_unit_prices.get(asset)
        if quote_price is not None and quote_price > 0:
            used_price = quote_price
            source = LIVE_QUOTE_SOURCE
        elif fallback_price is not None and fallback_price > 0:
            used_price = fallback_price
            source = FALLBACK_PRICE_SOURCE
        else:
            used_price = None
            source = None
        row = _build_position_row(asset, state, used_price, price_source=source)
        if row.get("unrealized_pnl_usd") is not None:
            total_unrealized += float(row["unrealized_pnl_usd"])
        positions.append(row)

    total_pnl = total_unrealized + total_realized + total_dividends
    total_assets_value = sum(float(p.get("market_value_usd") or 0) for p in positions)
    total_portfolio_value = total_assets_value + cash_available
    cash_warning = NEGATIVE_CASH_WARNING if cash_available < -1e-9 else None

    global_gain = total_portfolio_value - total_deposits
    total_return_percent: float | None = None
    if total_deposits > 0:
        total_return_percent = (global_gain / total_deposits) * 100

    return {
        "positions": positions,
        "strongest_asset": _pick_strongest_asset(positions),
        "total_market_value_usd": round(total_assets_value, 2),
        "total_assets_value_usd": round(total_assets_value, 2),
        "cash_available_usd": round(cash_available, 2),
        "total_portfolio_value_usd": round(total_portfolio_value, 2),
        "cash_warning": cash_warning,
        "warnings": warnings,
        "total_unrealized_pnl_usd": round(total_unrealized, 2),
        "total_realized_pnl_usd": round(total_realized, 2),
        "total_dividends_usd": round(total_dividends, 2),
        "total_fees_usd": round(total_fees, 2),
        "total_pnl_usd": round(total_pnl, 2),
        "total_deposits_usd": round(total_deposits, 2),
        "global_gain_by_contributions_usd": round(global_gain, 2),
        "total_return_percent": round(total_return_percent, 2) if total_return_percent is not None else None,
        "quotes_as_of": quotes_as_of,
        "quotes_partial": quotes_partial,
        "has_positions": len(positions) > 0,
    }


def get_portfolio_payload() -> dict[str, Any]:
    data = finance_store.load_data()
    return get_portfolio_insights(data.get("investments", []))
