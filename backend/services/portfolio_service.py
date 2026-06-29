"""Portfolio position aggregation and P&L from investment ledger."""

from __future__ import annotations

from typing import Any

from services import finance_store, quote_service
from services.investment_ledger import _sorted_investments

LIVE_QUOTE_SOURCE = "live_quote"
FALLBACK_PRICE_SOURCE = "last_imported_unit_price"
NEGATIVE_CASH_WARNING = (
    "El efectivo calculado es negativo. Puede faltar algún depósito, existir una compra duplicada "
    "o haber un error en la importación."
)


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _operation_type(inv: dict[str, Any]) -> str:
    return (inv.get("operation_type") or inv.get("action") or "buy").strip().lower()


def _trade_total_usd(inv: dict[str, Any]) -> float:
    total = _to_float(inv.get("total"))
    if total is not None:
        return total
    amount_usd = _to_float(inv.get("amount_usd"))
    if amount_usd is not None:
        return amount_usd
    amount = _to_float(inv.get("amount"))
    if amount is not None:
        return amount
    quantity = _to_float(inv.get("quantity"))
    unit_price = _to_float(inv.get("unit_price"))
    if quantity is not None and unit_price is not None:
        return quantity * unit_price
    return 0.0


def _dividend_total_usd(inv: dict[str, Any]) -> float:
    total = _to_float(inv.get("total"))
    if total is not None:
        return total
    amount_usd = _to_float(inv.get("amount_usd"))
    if amount_usd is not None:
        return amount_usd
    amount = _to_float(inv.get("amount"))
    if amount is not None:
        return amount
    pnl = _to_float(inv.get("pnl_usd"))
    if pnl is not None:
        return pnl
    return 0.0


def _trade_unit_price(inv: dict[str, Any]) -> float | None:
    unit_price = _to_float(inv.get("unit_price"))
    if unit_price is not None and unit_price > 0:
        return unit_price
    qty = _to_float(inv.get("quantity"))
    if qty is None or qty <= 0:
        return None
    implied_total = _trade_total_usd(inv)
    if implied_total <= 0:
        return None
    return implied_total / qty


def _normalize_asset(asset: str | None) -> str:
    return (asset or "").strip().upper()


def _aggregate_positions(
    investments: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, float]], float, dict[str, float], float]:
    """Return per-asset state, total realized P&L, last unit prices and available cash."""
    positions: dict[str, dict[str, float]] = {}
    last_unit_prices: dict[str, float] = {}
    total_realized = 0.0
    cash_available = 0.0

    for inv in investments:
        op = _operation_type(inv)
        asset = _normalize_asset(inv.get("asset"))

        if op == "deposit":
            cash_available += _trade_total_usd(inv)
            continue

        if op == "dividend":
            dividend = _dividend_total_usd(inv)
            cash_available += dividend
            if asset:
                pos = positions.setdefault(asset, {"qty": 0.0, "cost": 0.0, "realized": 0.0})
                pos["realized"] += dividend
            total_realized += dividend
            continue

        if op not in ("buy", "sell"):
            continue

        trade_total = _trade_total_usd(inv)
        unit_price = _trade_unit_price(inv)
        if asset and unit_price is not None:
            last_unit_prices[asset] = unit_price

        if op == "buy":
            qty = float(inv.get("quantity") or 0)
            if asset:
                pos = positions.setdefault(asset, {"qty": 0.0, "cost": 0.0, "realized": 0.0})
                pos["qty"] += qty
                pos["cost"] += trade_total
            cash_available -= trade_total
            continue

        if op == "sell":
            cash_available += trade_total
            if not asset:
                continue
            pos = positions.setdefault(asset, {"qty": 0.0, "cost": 0.0, "realized": 0.0})
            sell_qty = float(inv.get("quantity") or 0)
            qty_before = pos["qty"]
            matched_qty = min(sell_qty, qty_before) if qty_before > 0 and sell_qty > 0 else 0.0
            cost_sold = pos["cost"] * (matched_qty / qty_before) if qty_before > 0 else 0.0
            pnl = _to_float(inv.get("pnl_usd"))
            realized = pnl if pnl is not None else trade_total - cost_sold
            pos["qty"] = max(0.0, qty_before - sell_qty)
            pos["cost"] = max(0.0, pos["cost"] - cost_sold)
            pos["realized"] += realized
            total_realized += realized

    return positions, total_realized, last_unit_prices, cash_available


def _price_source_label(source: str | None) -> str | None:
    if source == LIVE_QUOTE_SOURCE:
        return "cotización actual"
    if source == FALLBACK_PRICE_SOURCE:
        return "último precio importado"
    return None


def _build_position_row(
    asset: str,
    state: dict[str, float],
    price: float | None,
    *,
    price_source: str | None,
) -> dict[str, Any]:
    qty = state["qty"]
    cost_basis = state["cost"]
    realized = state["realized"]
    row: dict[str, Any] = {
        "asset": asset,
        "quantity": round(qty, 8),
        "cost_basis_usd": round(cost_basis, 2),
        "market_price_usd": round(price, 4) if price is not None else None,
        "used_price_usd": round(price, 4) if price is not None else None,
        "price_source": price_source,
        "price_source_label": _price_source_label(price_source),
        "market_value_usd": None,
        "unrealized_pnl_usd": None,
        "unrealized_pnl_percent": None,
        "realized_pnl_usd": round(realized, 2),
        "total_pnl_usd": round(realized, 2),
    }
    if price is not None and qty > 0:
        market_value = qty * price
        unrealized = market_value - cost_basis
        row["market_value_usd"] = round(market_value, 2)
        row["unrealized_pnl_usd"] = round(unrealized, 2)
        row["total_pnl_usd"] = round(realized + unrealized, 2)
        if cost_basis > 0:
            row["unrealized_pnl_percent"] = round((unrealized / cost_basis) * 100, 2)
    return row


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
    positions_state, total_realized, last_unit_prices, cash_available = _aggregate_positions(rows)

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

    total_pnl = total_unrealized + total_realized
    total_assets_value = sum(float(p.get("market_value_usd") or 0) for p in positions)
    total_portfolio_value = total_assets_value + cash_available
    cash_warning = NEGATIVE_CASH_WARNING if cash_available < -1e-9 else None

    return {
        "positions": positions,
        "strongest_asset": _pick_strongest_asset(positions),
        "total_market_value_usd": round(total_assets_value, 2),
        "total_assets_value_usd": round(total_assets_value, 2),
        "cash_available_usd": round(cash_available, 2),
        "total_portfolio_value_usd": round(total_portfolio_value, 2),
        "cash_warning": cash_warning,
        "total_unrealized_pnl_usd": round(total_unrealized, 2),
        "total_realized_pnl_usd": round(total_realized, 2),
        "total_pnl_usd": round(total_pnl, 2),
        "quotes_as_of": quotes_as_of,
        "quotes_partial": quotes_partial,
        "has_positions": len(positions) > 0,
    }


def get_portfolio_payload() -> dict[str, Any]:
    data = finance_store.load_data()
    return get_portfolio_insights(data.get("investments", []))
