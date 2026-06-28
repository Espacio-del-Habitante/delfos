"""Portfolio position aggregation and P&L from investment ledger."""

from __future__ import annotations

from typing import Any

from services import finance_store, quote_service
from services.investment_ledger import _sorted_investments


def _ledger_amount_usd(inv: dict[str, Any]) -> float:
    amount_usd = inv.get("amount_usd")
    if amount_usd is not None:
        return float(amount_usd)
    quantity = inv.get("quantity")
    unit_price = inv.get("unit_price")
    if quantity is not None and unit_price is not None:
        return float(quantity) * float(unit_price)
    total = inv.get("total")
    if total is not None:
        return float(total)
    amount = inv.get("amount")
    if amount is not None:
        return float(amount)
    return 0.0


def _normalize_asset(asset: str | None) -> str:
    return (asset or "").strip().upper()


def _aggregate_positions(investments: list[dict[str, Any]]) -> tuple[dict[str, dict[str, float]], float]:
    """Return per-asset state and total realized P&L across all assets."""
    positions: dict[str, dict[str, float]] = {}
    total_realized = 0.0

    for inv in investments:
        op = (inv.get("operation_type") or inv.get("action") or "buy").lower()
        asset = _normalize_asset(inv.get("asset"))

        if op == "deposit":
            continue

        if op == "dividend":
            if not asset:
                continue
            pos = positions.setdefault(asset, {"qty": 0.0, "cost": 0.0, "realized": 0.0})
            pnl = inv.get("pnl_usd")
            dividend = float(pnl) if pnl is not None else _ledger_amount_usd(inv)
            pos["realized"] += dividend
            total_realized += dividend
            continue

        if not asset:
            continue

        pos = positions.setdefault(asset, {"qty": 0.0, "cost": 0.0, "realized": 0.0})

        if op == "buy":
            qty = float(inv.get("quantity") or 0)
            cost = _ledger_amount_usd(inv)
            pos["qty"] += qty
            pos["cost"] += cost
            continue

        if op == "sell":
            sell_qty = float(inv.get("quantity") or 0)
            qty_before = pos["qty"]
            if qty_before > 0 and sell_qty > 0:
                cost_sold = pos["cost"] * (sell_qty / qty_before)
            else:
                cost_sold = 0.0
            proceeds = _ledger_amount_usd(inv)
            pnl = inv.get("pnl_usd")
            if pnl is not None:
                realized = float(pnl)
            else:
                realized = proceeds - cost_sold
            pos["qty"] = max(0.0, qty_before - sell_qty)
            pos["cost"] = max(0.0, pos["cost"] - cost_sold)
            pos["realized"] += realized
            total_realized += realized

    return positions, total_realized


def _build_position_row(asset: str, state: dict[str, float], price: float | None) -> dict[str, Any]:
    qty = state["qty"]
    cost_basis = state["cost"]
    row: dict[str, Any] = {
        "asset": asset,
        "quantity": round(qty, 8),
        "cost_basis_usd": round(cost_basis, 2),
        "market_price_usd": round(price, 4) if price is not None else None,
        "market_value_usd": None,
        "unrealized_pnl_usd": None,
        "unrealized_pnl_percent": None,
    }
    if price is not None and qty > 0:
        market_value = qty * price
        unrealized = market_value - cost_basis
        row["market_value_usd"] = round(market_value, 2)
        row["unrealized_pnl_usd"] = round(unrealized, 2)
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
        "quote_missing": best.get("market_value_usd") is None,
    }


def get_portfolio_insights(investments: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    rows = _sorted_investments(investments)
    positions_state, total_realized = _aggregate_positions(rows)

    open_positions = {asset: state for asset, state in positions_state.items() if state["qty"] > 1e-12}
    tickers = list(open_positions.keys())
    quotes, quotes_as_of, quotes_partial = quote_service.get_quotes(tickers)

    positions: list[dict[str, Any]] = []
    total_unrealized = 0.0
    for asset, state in sorted(open_positions.items()):
        price = quotes.get(asset)
        row = _build_position_row(asset, state, price)
        if row.get("unrealized_pnl_usd") is not None:
            total_unrealized += float(row["unrealized_pnl_usd"])
        positions.append(row)

    total_pnl = total_unrealized + total_realized

    return {
        "positions": positions,
        "strongest_asset": _pick_strongest_asset(positions),
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
