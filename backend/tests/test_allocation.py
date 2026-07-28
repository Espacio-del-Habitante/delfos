"""Checks: emergencia=0 sin cuentas enlazadas; propose suma ≤ ingreso."""

import tempfile
import unittest
from pathlib import Path

from services import allocation_service, assistant_service, finance_store


class AllocationAndEmergencyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.original_path = finance_store.DATA_PATH
        finance_store.DATA_PATH = Path(self.tmp.name) / "delfos_data.json"
        finance_store.save_data(
            {
                "settings": {"currency": "COP"},
                "categories": [],
                "accounts": [
                    {
                        "id": "account_001",
                        "name": "Nómina",
                        "type": "bank",
                        "currency": "COP",
                        "initial_balance": 5_000_000,
                        "current_balance": 5_000_000,
                        "emoji": "🏦",
                        "goal_id": None,
                        "role": "operating",
                    },
                    {
                        "id": "account_002",
                        "name": "Efectivo",
                        "type": "cash",
                        "currency": "COP",
                        "initial_balance": 1_000_000,
                        "current_balance": 1_000_000,
                        "emoji": "💵",
                        "goal_id": None,
                        "role": "general",
                    },
                ],
                "expenses": [],
                "incomes": [],
                "investments": [],
                "notes": [],
                "transfers": [],
                "financial_profile": {
                    **finance_store.DEFAULT_FINANCIAL_PROFILE,
                    "monthly_income_fixed": 5_000_000,
                    "monthly_fixed_expenses": 1_000_000,
                    "savings_target_percent": 20,
                    "investment_target_percent": 10,
                    "cushion_percent": 10,
                    "emergency_fund_target_months": 6,
                    "onboarding_completed": True,
                },
                "goals": [
                    {
                        "id": "goal_001",
                        "type": "emergency_fund",
                        "title": "Colchón",
                        "target_amount": None,
                        "target_date": None,
                        "monthly_target": None,
                        "status": "active",
                        "priority": 1,
                        "notes": None,
                        "created_at": "2026-01-01T00:00:00",
                        "updated_at": "2026-01-01T00:00:00",
                    }
                ],
                "chat_threads": [],
                "chat_messages": [],
                "memory_facts": [],
                "memory_summaries": [],
            }
        )

    def tearDown(self):
        finance_store.DATA_PATH = self.original_path
        self.tmp.cleanup()

    def test_emergency_months_zero_without_linked_accounts(self):
        kpis = assistant_service.build_kpis()
        self.assertEqual(kpis["emergency_months_approx"], 0)
        self.assertEqual(kpis["month_summary"]["emergency_balance"], 0)

    def test_savings_kpi_null_without_month_income(self):
        # Perfil tiene ingreso plantilla, pero el KPI no lo inventa.
        kpis = assistant_service.build_kpis()
        self.assertEqual(kpis["month_summary"]["income"], 0)
        self.assertIsNone(kpis["savings_actual_percent"])
        self.assertEqual(kpis["month_summary"]["income_base"], 0)

    def test_savings_kpi_uses_real_month_income(self):
        finance_store.add_income(
            {
                "amount": 5_000_000,
                "currency": "COP",
                "category": "Salario",
                "description": "Salario",
            }
        )
        finance_store.add_expense(
            {
                "amount": 1_000_000,
                "currency": "COP",
                "category": "Vivienda",
                "description": "Arriendo",
            }
        )
        kpis = assistant_service.build_kpis()
        self.assertEqual(kpis["month_summary"]["income"], 5_000_000)
        self.assertEqual(kpis["savings_actual_percent"], 80.0)

    def test_emergency_months_uses_linked_balance_only(self):
        finance_store.update_account(
            "account_002",
            {"goal_id": "goal_001", "role": "goal", "current_balance": 2_000_000},
        )
        kpis = assistant_service.build_kpis()
        # 2_000_000 / 1_000_000 fijos = 2 meses (no usa la liquidez total 6M)
        self.assertEqual(kpis["emergency_months_approx"], 2.0)
        self.assertEqual(kpis["month_summary"]["emergency_balance"], 2_000_000)

    def test_propose_sum_leq_income(self):
        proposal = allocation_service.propose_allocation(
            5_000_000, "account_001", currency="COP"
        )
        income = proposal["income_amount"]
        movable = sum(
            float(ln["amount"])
            for ln in proposal["lines"]
            if ln["kind"] != "cushion" and float(ln.get("amount") or 0) > 0
        )
        self.assertLessEqual(movable, income + 0.01)
        cushion = next(ln for ln in proposal["lines"] if ln["kind"] == "cushion")
        self.assertEqual(cushion["amount"], 500_000)  # 10%

    def test_income_insufficient_caps_fixed_zeros_rest(self):
        finance_store.update_financial_profile(
            {
                "monthly_fixed_expenses": 1_900_000,
                "fixed_expenses": [
                    {"label": "Arriendo", "amount": 1_880_000},
                    {"label": "Comida", "amount": 20_000},
                ],
                "savings_target_percent": 20,
                "investment_target_percent": 10,
                "cushion_percent": 10,
            }
        )
        proposal = allocation_service.propose_allocation(
            600_000, "account_001", currency="COP"
        )
        fixed = next(ln for ln in proposal["lines"] if ln["kind"] == "fixed_expense")
        invest = next(ln for ln in proposal["lines"] if ln["kind"] in ("investment", "investment_reserve"))
        cushion = next(ln for ln in proposal["lines"] if ln["kind"] == "cushion")
        self.assertEqual(fixed["amount"], 600_000)
        self.assertEqual(invest["amount"], 0)
        self.assertEqual(cushion["amount"], 0)
        self.assertEqual(proposal["summary"]["liquid_remaining"], 0)
        self.assertIsNotNone(proposal["summary"]["warning"])
        # Sin basura de float
        self.assertEqual(proposal["summary"]["liquid_remaining"], round(proposal["summary"]["liquid_remaining"], 2))

    def test_split_exact_sums_to_total(self):
        parts = allocation_service._split_exact(600_000, [1_880_000, 20_000])
        self.assertEqual(sum(parts), 600_000)
        self.assertEqual(parts, [round(p, 2) for p in parts])

    def test_confirm_fixed_split_does_not_exceed_income(self):
        finance_store.update_financial_profile(
            {
                "monthly_fixed_expenses": 1_900_000,
                "fixed_expenses": [
                    {"label": "Arriendo", "amount": 1_880_000},
                    {"label": "Comida", "amount": 20_000},
                ],
            }
        )
        proposal = allocation_service.propose_allocation(
            600_000, "account_001", currency="COP"
        )
        # Solo fijos aceptados (cap al ingreso).
        for ln in proposal["lines"]:
            ln["accepted"] = ln["kind"] == "fixed_expense" and ln["enabled"]
        result = allocation_service.confirm_allocation(proposal)
        self.assertLessEqual(result["moved"], 600_000 + 0.01)
        self.assertEqual(result["moved"], 600_000)
        self.assertEqual(result["applied"]["expenses"], 2)


if __name__ == "__main__":
    unittest.main()
