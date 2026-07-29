"""Seed de fixture QA (números redondos) en un path aparte.

Uso:
  cd backend
  uv run python scripts/seed_qa_fixture.py
  uv run python scripts/seed_qa_fixture.py --out data/qa_delfos_data.json

No toca el delfos_data.json activo salvo --apply (sobrescribe DATA_PATH).
"""

from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path

# backend/ en sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services import finance_store  # noqa: E402

_BOGOTA = timezone(timedelta(hours=-5))


def _month_day(day: int) -> str:
    now = datetime.now(timezone.utc).astimezone(_BOGOTA)
    return f"{now.year:04d}-{now.month:02d}-{day:02d}"


def build_qa_payload() -> dict:
    """Perfil 5M / fijos 1.5M / 20% ahorro / 10% inv / 10% colchón + ledger redondo."""
    base = deepcopy(finance_store.RESET_DATA)
    base["settings"] = {"currency": "COP"}
    base["accounts"] = [
        {
            "id": "account_001",
            "name": "Nómina",
            "type": "bank",
            "currency": "COP",
            "initial_balance": 2_000_000,
            "current_balance": 5_500_000,
            "emoji": "🏦",
            "goal_id": None,
            "role": "operating",
            "created_at": "2026-01-01T00:00:00",
        },
        {
            "id": "account_002",
            "name": "Fondo emergencia",
            "type": "savings",
            "currency": "COP",
            "initial_balance": 3_000_000,
            "current_balance": 3_000_000,
            "emoji": "🛟",
            "goal_id": "goal_001",
            "role": "goal",
            "created_at": "2026-01-01T00:00:00",
        },
        {
            "id": "account_003",
            "name": "Broker",
            "type": "broker",
            "currency": "USD",
            "initial_balance": 0,
            "current_balance": 0,
            "emoji": "📈",
            "goal_id": None,
            "role": "general",
            "created_at": "2026-01-01T00:00:00",
        },
    ]
    base["goals"] = [
        {
            "id": "goal_001",
            "type": "emergency_fund",
            "title": "Fondo de emergencia",
            "target_amount": None,
            "target_date": None,
            "monthly_target": None,
            "status": "active",
            "priority": 1,
            "notes": None,
            "created_at": "2026-01-01T00:00:00",
            "updated_at": "2026-01-01T00:00:00",
        }
    ]
    base["financial_profile"] = {
        **deepcopy(finance_store.DEFAULT_FINANCIAL_PROFILE),
        "monthly_income_fixed": 5_000_000,
        "monthly_income_variable_avg": 0,
        "monthly_fixed_expenses": 1_500_000,
        "fixed_expenses": [
            {"label": "Arriendo", "amount": 1_200_000},
            {"label": "Servicios", "amount": 300_000},
        ],
        "savings_target_percent": 20,
        "investment_target_percent": 10,
        "cushion_percent": 10,
        "emergency_fund_target_months": 6,
        "income_payday_day": 1,
        "onboarding_completed": True,
        "last_reviewed_at": "2026-07-01T00:00:00",
    }
    # Mes actual (Bogotá): ingreso 5M + gastos 1M → ahorro 80%; emergencia 3M/1.5M = 2 meses.
    base["incomes"] = [
        {
            "id": "income_001",
            "account_id": "account_001",
            "amount": 5_000_000,
            "currency": "COP",
            "category": "Salario",
            "category_emoji": "💼",
            "description": "Salario QA",
            "income_source": "nómina",
            "date": _month_day(1),
            "created_at": f"{_month_day(1)}T12:00:00",
            "source": "seed",
        }
    ]
    base["expenses"] = [
        {
            "id": "expense_001",
            "account_id": "account_001",
            "amount": 800_000,
            "currency": "COP",
            "category": "Mercado",
            "category_emoji": "🛒",
            "description": "Mercado mes",
            "payment_method": "debit",
            "date": _month_day(5),
            "created_at": f"{_month_day(5)}T12:00:00",
            "source": "seed",
        },
        {
            "id": "expense_002",
            "account_id": "account_001",
            "amount": 200_000,
            "currency": "COP",
            "category": "Transporte",
            "category_emoji": "🚌",
            "description": "Transporte mes",
            "payment_method": "debit",
            "date": _month_day(8),
            "created_at": f"{_month_day(8)}T12:00:00",
            "source": "seed",
        },
    ]
    # Extras fuera del mes para probar filtros/paginación.
    for i in range(1, 21):
        base["expenses"].append(
            {
                "id": f"expense_old_{i:03d}",
                "account_id": "account_001",
                "amount": 10_000 * i,
                "currency": "COP",
                "category": "Comida",
                "category_emoji": "🍽️",
                "description": f"Gasto histórico {i}",
                "payment_method": "cash",
                "date": f"2026-05-{(i % 28) + 1:02d}",
                "created_at": f"2026-05-{(i % 28) + 1:02d}T10:00:00",
                "source": "seed",
            }
        )
    # buy 10 AAPL @100; buy 5 MSFT @200; sell 2 AAPL @130; div 15
    base["investments"] = [
        {
            "id": "inv_001",
            "operation_type": "buy",
            "action": "buy",
            "date": "2026-01-10",
            "asset": "AAPL",
            "quantity": 10.0,
            "amount": 1000.0,
            "amount_usd": 1000.0,
            "unit_price": 100.0,
            "currency": "USD",
            "account_id": "account_003",
            "created_at": "2026-01-10T00:00:00",
            "source": "seed",
        },
        {
            "id": "inv_002",
            "operation_type": "buy",
            "action": "buy",
            "date": "2026-01-15",
            "asset": "MSFT",
            "quantity": 5.0,
            "amount": 1000.0,
            "amount_usd": 1000.0,
            "unit_price": 200.0,
            "currency": "USD",
            "account_id": "account_003",
            "created_at": "2026-01-15T00:00:00",
            "source": "seed",
        },
        {
            "id": "inv_003",
            "operation_type": "sell",
            "action": "sell",
            "date": "2026-03-01",
            "asset": "AAPL",
            "quantity": 2.0,
            "amount": 260.0,
            "amount_usd": 260.0,
            "unit_price": 130.0,
            "currency": "USD",
            "account_id": "account_003",
            "created_at": "2026-03-01T00:00:00",
            "source": "seed",
        },
        {
            "id": "inv_004",
            "operation_type": "dividend",
            "action": "dividend",
            "date": "2026-04-01",
            "asset": "AAPL",
            "quantity": 0,
            "amount": 15.0,
            "amount_usd": 15.0,
            "currency": "USD",
            "account_id": "account_003",
            "created_at": "2026-04-01T00:00:00",
            "source": "seed",
        },
    ]
    return base


def main():
    parser = argparse.ArgumentParser(description="Seed fixture QA de Delfos")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data" / "qa_delfos_data.json",
        help="Ruta de salida (default: backend/data/qa_delfos_data.json)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="También escribe sobre finance_store.DATA_PATH (datos activos)",
    )
    args = parser.parse_args()
    payload = build_qa_payload()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {args.out}")
    if args.apply:
        finance_store.DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        finance_store.save_data(payload)
        print(f"Applied to {finance_store.DATA_PATH}")
    print(
        "Golden expect (mes actual Bogota): "
        "ahorro 80%, emergencia 2.0 meses, "
        "allocation parcial 600k -> fijos 180k sin warning; "
        "completo 5M -> fijos 1.5M."
    )


if __name__ == "__main__":
    main()
