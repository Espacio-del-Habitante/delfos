"""Propuesta determinista de distribución de salario (sin LLM).

Flujo: propose → usuario acepta/declina/edita → confirm aplica transfers/expenses.
"""

from __future__ import annotations

from copy import deepcopy

from services import finance_store


def _pct(value):
    try:
        n = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, n)


def _money(value):
    return round(max(0.0, float(value or 0)), 2)


def _split_exact(total, weights):
    """Reparte `total` según pesos; la última parte absorbe el residuo de redondeo."""
    total = _money(total)
    if not weights:
        return []
    weight_sum = sum(max(0.0, float(w or 0)) for w in weights) or 1.0
    parts = []
    allocated = 0.0
    for i, w in enumerate(weights):
        if i == len(weights) - 1:
            parts.append(_money(total - allocated))
        else:
            part = _money(total * (max(0.0, float(w or 0)) / weight_sum))
            parts.append(part)
            allocated = _money(allocated + part)
    return parts


def _pick_linked_account(accounts, goal_id, currency):
    """Si hay varias cuentas para la meta: mayor saldo; si empate, la primera."""
    linked = [
        a
        for a in accounts
        if a.get("goal_id") == goal_id and (a.get("currency") or "COP") == currency
    ]
    if not linked:
        return None
    return max(linked, key=lambda a: (float(a.get("current_balance") or 0), a.get("id") or ""))


def _fixed_total(profile):
    total = profile.get("monthly_fixed_expenses")
    if total not in (None, ""):
        return _money(total)
    items = profile.get("fixed_expenses") or []
    return _money(sum(float(x.get("amount") or 0) for x in items if isinstance(x, dict)))


def _monthly_ref(profile, currency="COP"):
    """Referencia mensual para gap de emergencia: fijos > gasto mes > ingreso perfil."""
    data = finance_store.load_data()
    fixed = _fixed_total(profile)
    if fixed > 0:
        return fixed
    from datetime import datetime, timezone

    prefix = datetime.now(timezone.utc).replace(tzinfo=None).strftime("%Y-%m")
    expense_month = 0.0
    for row in data.get("expenses") or []:
        if not str(row.get("date") or "").startswith(prefix):
            continue
        if (row.get("currency") or currency) != currency:
            continue
        expense_month += float(row.get("amount") or 0)
    if expense_month > 0:
        return _money(expense_month)
    income_base = float(profile.get("monthly_income_fixed") or 0) + float(
        profile.get("monthly_income_variable_avg") or 0
    )
    return _money(income_base)


def _line(
    *,
    line_id,
    kind,
    label,
    amount,
    enabled=True,
    disabled_reason=None,
    to_account_id=None,
    goal_id=None,
    accepted=True,
    editable=True,
):
    return {
        "id": line_id,
        "kind": kind,
        "label": label,
        "amount": _money(amount),
        "enabled": enabled,
        "disabled_reason": disabled_reason,
        "to_account_id": to_account_id,
        "goal_id": goal_id,
        "accepted": bool(accepted) if enabled else False,
        "editable": editable and enabled,
    }


def propose_allocation(income_amount, from_account_id, currency="COP"):
    income = _money(income_amount)
    if income <= 0:
        raise ValueError("income_amount debe ser > 0")
    if not from_account_id:
        raise ValueError("from_account_id es obligatorio")

    data = finance_store.load_data()
    accounts = data.get("accounts") or []
    src = next((a for a in accounts if a.get("id") == from_account_id), None)
    if not src:
        raise ValueError("cuenta operativa no encontrada")
    currency = currency or src.get("currency") or "COP"
    if src.get("currency") != currency:
        raise ValueError("la moneda no coincide con la cuenta operativa")

    profile = finance_store.get_financial_profile()
    goals = [
        g
        for g in (data.get("goals") or [])
        if g.get("status") in (None, "active")
    ]

    cushion_pct = _pct(profile.get("cushion_percent"))
    savings_pct = _pct(profile.get("savings_target_percent"))
    invest_pct = _pct(profile.get("investment_target_percent"))

    cushion_amt = _money(income * cushion_pct / 100.0)
    savings_budget = _money(income * savings_pct / 100.0)
    invest_budget = _money(income * invest_pct / 100.0)
    fixed_amt = _fixed_total(profile)
    fixed_profile = fixed_amt
    warning = None
    shortfall_reason = "Ingreso insuficiente para cubrir fijos"

    # Nunca escalar fijos con ahorro/inversión. Si fijos > ingreso: cap + cero el resto.
    if fixed_amt > income:
        warning = shortfall_reason
        fixed_amt = income
        savings_budget = 0.0
        invest_budget = 0.0
        cushion_amt = 0.0
    else:
        leftover = _money(max(0.0, income - fixed_amt - cushion_amt))
        planned_si = savings_budget + invest_budget
        if planned_si > leftover:
            if leftover <= 0 or planned_si <= 0:
                savings_budget = 0.0
                invest_budget = 0.0
            else:
                # Solo recorta ahorro/inversión al sobrante (fijos y colchón intactos).
                scale = leftover / planned_si
                savings_budget = _money(savings_budget * scale)
                invest_budget = _money(leftover - savings_budget)

    lines = []
    fixed_reason = None
    if fixed_profile <= 0:
        fixed_reason = "Sin gastos fijos en el perfil"
    elif warning:
        fixed_reason = (
            f"{warning} (perfil: {_money(fixed_profile)}; se propone cap al ingreso)"
        )
    lines.append(
        _line(
            line_id="fixed",
            kind="fixed_expense",
            label="Gastos fijos del mes",
            amount=fixed_amt,
            enabled=fixed_amt > 0,
            disabled_reason=fixed_reason,
            accepted=fixed_amt > 0,
        )
    )

    emergency_goals = [g for g in goals if g.get("type") == "emergency_fund"]
    monthly_ref = _monthly_ref(profile, currency)
    target_months = profile.get("emergency_fund_target_months")
    emergency_spend = 0.0

    if emergency_goals:
        eg = sorted(emergency_goals, key=lambda g: g.get("priority", 99))[0]
        dest = _pick_linked_account(accounts, eg["id"], currency)
        current = 0.0
        for a in accounts:
            if a.get("goal_id") == eg["id"] and (a.get("currency") or "COP") == currency:
                current += float(a.get("current_balance") or 0)
        gap = 0.0
        if target_months is not None and monthly_ref > 0:
            gap = max(0.0, float(target_months) * monthly_ref - current)
        suggested = savings_budget
        if eg.get("monthly_target") is not None:
            suggested = min(suggested, float(eg["monthly_target"]))
        if gap > 0:
            suggested = min(suggested, gap)
        else:
            suggested = 0.0
        emergency_spend = _money(suggested)
        months_short = (
            round(gap / monthly_ref, 1) if gap > 0 and monthly_ref > 0 else None
        )
        emergency_label = f"¿Aportas a emergencia? · {eg.get('title') or 'Emergencia'}"
        if months_short is not None:
            emergency_label += f" (te faltan ~{months_short} meses)"
        if warning:
            emergency_reason = shortfall_reason
        elif not dest:
            emergency_reason = "Enlaza una cuenta a la meta de emergencia"
        else:
            emergency_reason = None
        lines.append(
            _line(
                line_id=f"emergency_{eg['id']}",
                kind="emergency",
                label=emergency_label,
                amount=emergency_spend,
                enabled=bool(dest) and emergency_spend > 0 and not warning,
                disabled_reason=emergency_reason,
                to_account_id=dest["id"] if dest else None,
                goal_id=eg["id"],
                accepted=bool(dest) and emergency_spend > 0 and not warning,
            )
        )
    else:
        lines.append(
            _line(
                line_id="emergency_none",
                kind="emergency",
                label="Fondo de emergencia",
                amount=0,
                enabled=False,
                disabled_reason=(
                    shortfall_reason if warning else "Crea una meta de tipo fondo de emergencia"
                ),
                accepted=False,
            )
        )

    remaining_savings = _money(max(0.0, savings_budget - emergency_spend))
    savings_goals = [
        g for g in goals if g.get("type") in ("savings", "custom")
    ]
    savings_goals = sorted(savings_goals, key=lambda g: g.get("priority", 99))

    if remaining_savings > 0 and savings_goals:
        with_target = [g for g in savings_goals if g.get("monthly_target")]
        if with_target:
            weights = [float(g["monthly_target"]) for g in with_target]
            weight_sum = sum(weights) or 1.0
            for g, w in zip(with_target, weights):
                share = _money(remaining_savings * (w / weight_sum))
                dest = _pick_linked_account(accounts, g["id"], currency)
                lines.append(
                    _line(
                        line_id=f"goal_{g['id']}",
                        kind="goal",
                        label=g.get("title") or "Meta",
                        amount=share,
                        enabled=bool(dest),
                        disabled_reason=None if dest else "Enlaza una cuenta a esta meta",
                        to_account_id=dest["id"] if dest else None,
                        goal_id=g["id"],
                        accepted=bool(dest) and share > 0,
                    )
                )
        else:
            share = _money(remaining_savings / len(savings_goals))
            for g in savings_goals:
                dest = _pick_linked_account(accounts, g["id"], currency)
                lines.append(
                    _line(
                        line_id=f"goal_{g['id']}",
                        kind="goal",
                        label=g.get("title") or "Meta",
                        amount=share,
                        enabled=bool(dest),
                        disabled_reason=None if dest else "Enlaza una cuenta a esta meta",
                        to_account_id=dest["id"] if dest else None,
                        goal_id=g["id"],
                        accepted=bool(dest) and share > 0,
                    )
                )
    elif remaining_savings > 0:
        lines.append(
            _line(
                line_id="savings_unlinked",
                kind="goal",
                label="Ahorro (sin meta enlazada)",
                amount=remaining_savings,
                enabled=False,
                disabled_reason="Crea metas de ahorro y enlaza cuentas",
                accepted=False,
            )
        )

    broker = next(
        (
            a
            for a in accounts
            if a.get("type") == "broker" and (a.get("currency") or "COP") == currency
        ),
        None,
    )
    if warning:
        invest_reason = shortfall_reason
    elif invest_pct <= 0:
        invest_reason = "Sin % de inversión en el perfil"
    elif invest_budget <= 0:
        invest_reason = "Sin sobrante tras fijos y colchón"
    else:
        invest_reason = None
    lines.append(
        _line(
            line_id="investment",
            kind="investment",
            label="Inversión" + (f" · {broker['name']}" if broker else " (reserva)"),
            amount=invest_budget,
            enabled=invest_budget > 0 and not warning,
            disabled_reason=invest_reason,
            to_account_id=broker["id"] if broker else None,
            accepted=invest_budget > 0 and bool(broker) and not warning,
            editable=True,
        )
    )
    if invest_budget > 0 and not broker and not warning:
        lines[-1]["disabled_reason"] = "Sin cuenta broker: puedes reservar sin mover"
        lines[-1]["enabled"] = True
        lines[-1]["accepted"] = False
        lines[-1]["kind"] = "investment_reserve"

    cushion_label = (
        f"¿Apartas el {int(cushion_pct) if cushion_pct == int(cushion_pct) else cushion_pct}% de colchón?"
        if cushion_pct > 0
        else "Colchón (queda en operativa)"
    )
    lines.append(
        _line(
            line_id="cushion",
            kind="cushion",
            label=cushion_label,
            amount=cushion_amt,
            enabled=False,
            disabled_reason=(
                shortfall_reason
                if warning
                else "No se transfiere; queda líquido en la cuenta operativa"
            ),
            accepted=False,
            editable=False,
        )
    )

    # Resumen: montos propuestos con destino / fijos (cap ≤ ingreso ya aplicado arriba).
    proposed_move = _money(
        sum(
            float(ln["amount"])
            for ln in lines
            if ln["kind"] not in ("cushion", "investment_reserve")
            and ln.get("enabled")
            and float(ln["amount"]) > 0
            and ln.get("to_account_id")
        )
        + sum(
            float(ln["amount"])
            for ln in lines
            if ln["kind"] == "fixed_expense" and ln.get("enabled") and float(ln["amount"]) > 0
        )
    )
    all_proposed = _money(
        sum(
            float(ln["amount"])
            for ln in lines
            if ln["kind"] != "cushion" and float(ln.get("amount") or 0) > 0
        )
    )
    if all_proposed > income:
        cushion_amt = _money(max(0.0, income - (all_proposed - cushion_amt)))
        for ln in lines:
            if ln["kind"] == "cushion":
                ln["amount"] = cushion_amt

    liquid_remaining = _money(income - proposed_move)

    return {
        "income_amount": income,
        "from_account_id": from_account_id,
        "currency": currency,
        "lines": lines,
        "summary": {
            "to_move": proposed_move,
            "fixed": _money(
                next((ln["amount"] for ln in lines if ln["kind"] == "fixed_expense"), 0)
            ),
            "cushion": _money(cushion_amt),
            "liquid_remaining": liquid_remaining,
            "warning": warning,
        },
    }


def confirm_allocation(proposal):
    """Aplica solo líneas accepted+enabled. Crea transfers y/o expenses fijos."""
    if not isinstance(proposal, dict):
        raise ValueError("proposal inválida")
    from_account_id = proposal.get("from_account_id")
    currency = proposal.get("currency") or "COP"
    income = _money(proposal.get("income_amount"))
    lines = proposal.get("lines") or []
    if not from_account_id:
        raise ValueError("from_account_id es obligatorio")

    data = finance_store.load_data()
    if not any(a.get("id") == from_account_id for a in data.get("accounts") or []):
        raise ValueError("cuenta operativa no encontrada")

    # Pre-check: la suma aceptada no puede superar el ingreso (evita writes parciales).
    planned_move = 0.0
    for ln in lines:
        if not isinstance(ln, dict):
            continue
        if not ln.get("accepted") or not ln.get("enabled"):
            continue
        amount = _money(ln.get("amount"))
        if amount <= 0:
            continue
        kind = ln.get("kind")
        if kind == "fixed_expense":
            planned_move = _money(planned_move + amount)
        elif kind in ("emergency", "goal", "investment"):
            if ln.get("to_account_id"):
                planned_move = _money(planned_move + amount)
    if planned_move > income + 0.01:
        raise ValueError(
            f"la suma aceptada ({planned_move}) supera el ingreso ({income})"
        )

    applied = {"transfers": 0, "expenses": 0}
    created_transfers = []
    created_expenses = []
    moved = 0.0

    for ln in lines:
        if not isinstance(ln, dict):
            continue
        if not ln.get("accepted") or not ln.get("enabled"):
            continue
        amount = _money(ln.get("amount"))
        if amount <= 0:
            continue
        kind = ln.get("kind")
        if kind == "fixed_expense":
            detail = finance_store.get_financial_profile().get("fixed_expenses") or []
            if detail:
                weights = [float(x.get("amount") or 0) for x in detail]
                parts = _split_exact(amount, weights)
                for item, part in zip(detail, parts):
                    if part <= 0:
                        continue
                    exp = finance_store.add_expense(
                        {
                            "account_id": from_account_id,
                            "amount": part,
                            "currency": currency,
                            "category": "Servicios",
                            "category_emoji": "💡",
                            "description": item.get("label") or "Gasto fijo",
                            "payment_method": "allocation",
                        },
                        source="allocation",
                    )
                    created_expenses.append(exp)
                    applied["expenses"] += 1
                    moved = _money(moved + part)
            else:
                exp = finance_store.add_expense(
                    {
                        "account_id": from_account_id,
                        "amount": amount,
                        "currency": currency,
                        "category": "Servicios",
                        "category_emoji": "💡",
                        "description": ln.get("label") or "Gastos fijos",
                        "payment_method": "allocation",
                    },
                    source="allocation",
                )
                created_expenses.append(exp)
                applied["expenses"] += 1
                moved = _money(moved + amount)
            continue

        if kind in ("emergency", "goal", "investment"):
            to_id = ln.get("to_account_id")
            if not to_id:
                continue
            tr = finance_store.add_transfer(
                {
                    "from_account_id": from_account_id,
                    "to_account_id": to_id,
                    "amount": amount,
                    "currency": currency,
                    "goal_id": ln.get("goal_id"),
                    "label": ln.get("label") or "Asignación",
                    "source": "allocation",
                }
            )
            created_transfers.append(tr)
            applied["transfers"] += 1
            moved = _money(moved + amount)
            continue

        # investment_reserve / cushion: no-op

    return {
        "applied": applied,
        "transfers": created_transfers,
        "expenses": created_expenses,
        "moved": _money(moved),
        "proposal": deepcopy(proposal),
    }
