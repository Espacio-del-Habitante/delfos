"""Pure portfolio accounting: weighted average cost, cash, dividends, fees."""

from __future__ import annotations

from typing import Any

from services.investment_ledger import _sorted_investments

NEGATIVE_CASH_WARNING = (
    "El efectivo calculado es negativo. Puede faltar algún depósito, existir una compra duplicada "
    "o haber un error en la importación."
)
OVERSELL_WARNING = (
    "Venta superior a la cantidad disponible. Revisa si falta una compra previa o un ajuste de posición."
)


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _is_non_zero(value: float | None) -> bool:
    return value is not None and abs(value) > 1e-12


def _operation_type(inv: dict[str, Any]) -> str:
    return (inv.get("operation_type") or inv.get("action") or "buy").strip().lower()


def _normalize_asset(asset: str | None) -> str:
    return (asset or "").strip().upper()


def _empty_position() -> dict[str, float]:
    return {
        "qty": 0.0,
        "cost": 0.0,
        "realized_sales": 0.0,
        "dividends": 0.0,
        "fees": 0.0,
        "capital_invested": 0.0,
    }


def _buy_cost_usd(inv: dict[str, Any]) -> float:
    total = _to_float(inv.get("total"))
    if _is_non_zero(total):
        return abs(total) if total < 0 else total
    amount_usd = _to_float(inv.get("amount_usd"))
    closing_cost = _to_float(inv.get("closing_cost")) or 0.0
    if amount_usd is not None:
        raw = amount_usd + closing_cost
        return abs(raw) if raw < 0 else raw
    amount = _to_float(inv.get("amount"))
    if _is_non_zero(amount):
        return abs(amount) if amount < 0 else amount
    quantity = _to_float(inv.get("quantity"))
    unit_price = _to_float(inv.get("unit_price"))
    if quantity is not None and unit_price is not None:
        raw = quantity * unit_price + closing_cost
        return abs(raw) if raw < 0 else raw
    if total is not None:
        return abs(total) if total < 0 else total
    return 0.0


def _sell_proceeds_usd(inv: dict[str, Any]) -> float:
    total = _to_float(inv.get("total"))
    if _is_non_zero(total):
        return total
    amount_usd = _to_float(inv.get("amount_usd"))
    closing_cost = abs(_to_float(inv.get("closing_cost")) or 0.0)
    if amount_usd is not None:
        return amount_usd - closing_cost
    amount = _to_float(inv.get("amount"))
    if _is_non_zero(amount):
        return amount
    quantity = _to_float(inv.get("quantity"))
    unit_price = _to_float(inv.get("unit_price"))
    if quantity is not None and unit_price is not None:
        return quantity * unit_price - closing_cost
    if total is not None:
        return total
    return 0.0


def _dividend_net_usd(inv: dict[str, Any]) -> tuple[float, float]:
    """Return (net dividend, fee from withholding)."""
    total = _to_float(inv.get("total"))
    amount_usd = _to_float(inv.get("amount_usd"))
    amount = _to_float(inv.get("amount"))
    pnl = _to_float(inv.get("pnl_usd"))
    closing_cost = _to_float(inv.get("closing_cost")) or 0.0
    fee = abs(closing_cost) if closing_cost < 0 else 0.0

    if _is_non_zero(total):
        return total, fee
    if _is_non_zero(amount_usd):
        return amount_usd, fee
    if _is_non_zero(amount):
        return amount, fee
    if pnl is not None:
        return pnl, fee
    if total is not None:
        return total, fee
    if amount_usd is not None:
        return amount_usd, fee
    if amount is not None:
        return amount, fee
    return 0.0, fee


def _deposit_amount_usd(inv: dict[str, Any]) -> float:
    total = _to_float(inv.get("total"))
    if _is_non_zero(total):
        return total
    amount_usd = _to_float(inv.get("amount_usd"))
    if _is_non_zero(amount_usd):
        return amount_usd
    amount = _to_float(inv.get("amount"))
    if _is_non_zero(amount):
        return amount
    if total is not None:
        return total
    if amount_usd is not None:
        return amount_usd
    if amount is not None:
        return amount
    return 0.0


def _trade_unit_price(inv: dict[str, Any], *, buy: bool) -> float | None:
    unit_price = _to_float(inv.get("unit_price"))
    if unit_price is not None and unit_price > 0:
        return unit_price
    qty = _to_float(inv.get("quantity"))
    if qty is None or qty <= 0:
        return None
    trade_total = _buy_cost_usd(inv) if buy else _sell_proceeds_usd(inv)
    if trade_total <= 0:
        return None
    return trade_total / qty


def aggregate_portfolio(investments: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Process ledger chronologically; return positions, cash, deposits and totals."""
    rows = _sorted_investments(investments)
    positions: dict[str, dict[str, float]] = {}
    last_unit_prices: dict[str, float] = {}
    cash = 0.0
    total_deposits = 0.0
    warnings: list[str] = []
    total_realized_sales = 0.0
    total_dividends = 0.0
    total_fees = 0.0

    for inv in rows:
        op = _operation_type(inv)
        asset = _normalize_asset(inv.get("asset"))

        if op == "deposit":
            deposit = _deposit_amount_usd(inv)
            cash += deposit
            total_deposits += deposit
            continue

        if op == "dividend":
            net, fee = _dividend_net_usd(inv)
            cash += net
            total_dividends += net
            total_fees += fee
            if asset:
                pos = positions.setdefault(asset, _empty_position())
                pos["dividends"] += net
                pos["fees"] += fee
            continue

        if op not in ("buy", "sell"):
            continue

        if op == "buy":
            buy_cost = _buy_cost_usd(inv)
            closing_cost = _to_float(inv.get("closing_cost")) or 0.0
            fee = closing_cost if closing_cost > 0 else 0.0
            qty = float(inv.get("quantity") or 0)
            unit_price = _trade_unit_price(inv, buy=True)
            if asset and unit_price is not None:
                last_unit_prices[asset] = unit_price
            if asset:
                pos = positions.setdefault(asset, _empty_position())
                pos["qty"] += qty
                pos["cost"] += buy_cost
                pos["capital_invested"] += buy_cost
                pos["fees"] += fee
            total_fees += fee
            cash -= buy_cost
            continue

        # sell
        proceeds = _sell_proceeds_usd(inv)
        closing_cost = _to_float(inv.get("closing_cost")) or 0.0
        fee = abs(closing_cost) if closing_cost < 0 else (closing_cost if closing_cost > 0 else 0.0)
        unit_price = _trade_unit_price(inv, buy=False)
        if asset and unit_price is not None:
            last_unit_prices[asset] = unit_price
        cash += proceeds
        total_fees += fee
        if not asset:
            continue
        pos = positions.setdefault(asset, _empty_position())
        pos["fees"] += fee
        sell_qty = float(inv.get("quantity") or 0)
        qty_before = pos["qty"]
        if sell_qty > qty_before + 1e-12:
            warnings.append(OVERSELL_WARNING)
        matched_qty = min(sell_qty, qty_before) if qty_before > 0 and sell_qty > 0 else 0.0
        avg = pos["cost"] / qty_before if qty_before > 0 else 0.0
        cost_sold = matched_qty * avg
        realized = proceeds - cost_sold
        pos["qty"] = max(0.0, qty_before - sell_qty)
        pos["cost"] = max(0.0, pos["cost"] - cost_sold)
        pos["realized_sales"] += realized
        total_realized_sales += realized

    if cash < -1e-9:
        warnings.append(NEGATIVE_CASH_WARNING)

    return {
        "positions_state": positions,
        "last_unit_prices": last_unit_prices,
        "cash": cash,
        "total_deposits": total_deposits,
        "warnings": warnings,
        "total_realized_sales": total_realized_sales,
        "total_dividends": total_dividends,
        "total_fees": total_fees,
    }
