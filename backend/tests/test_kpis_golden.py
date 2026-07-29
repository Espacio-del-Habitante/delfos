"""Golden KPIs: ahorro del mes y emergencia (definición canónica).

savings_actual_percent = (income_month − expense_month) / income_month
- Sin ingresos del mes → null (el perfil no inventa %).
- Transfers a metas NO cuentan como gasto.
- Gastos creados por allocation SÍ bajan el %.
- Mes de negocio: America/Bogota (UTC−5) vía date del movimiento.
"""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from services import allocation_service, assistant_service, finance_store


class KpisGoldenTests(unittest.TestCase):
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
                        "id": "account_op",
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
                        "id": "account_emg",
                        "name": "Emergencia",
                        "type": "savings",
                        "currency": "COP",
                        "initial_balance": 3_000_000,
                        "current_balance": 3_000_000,
                        "emoji": "🛟",
                        "goal_id": "goal_emg",
                        "role": "goal",
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
                    "monthly_fixed_expenses": 1_500_000,
                    "savings_target_percent": 20,
                    "investment_target_percent": 10,
                    "cushion_percent": 10,
                    "emergency_fund_target_months": 6,
                    "onboarding_completed": True,
                },
                "goals": [
                    {
                        "id": "goal_emg",
                        "type": "emergency_fund",
                        "title": "Fondo emergencia",
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

    def test_savings_null_without_income(self):
        kpis = assistant_service.build_kpis()
        self.assertIsNone(kpis["savings_actual_percent"])

    def test_savings_positive_income_gt_expense(self):
        with patch.object(assistant_service, "_month_prefix", return_value="2026-07"):
            finance_store.add_income(
                {
                    "amount": 5_000_000,
                    "currency": "COP",
                    "category": "Salario",
                    "date": "2026-07-01",
                    "account_id": "account_op",
                }
            )
            finance_store.add_expense(
                {
                    "amount": 1_000_000,
                    "currency": "COP",
                    "category": "Vivienda",
                    "date": "2026-07-02",
                    "account_id": "account_op",
                }
            )
            kpis = assistant_service.build_kpis()
        # (5M − 1M) / 5M = 80%
        self.assertEqual(kpis["savings_actual_percent"], 80.0)
        self.assertEqual(kpis["savings_vs_target_delta"], 60.0)  # 80 − 20

    def test_allocation_fixed_expense_lowers_savings(self):
        with patch.object(assistant_service, "_month_prefix", return_value="2026-07"):
            finance_store.add_income(
                {
                    "amount": 5_000_000,
                    "currency": "COP",
                    "category": "Salario",
                    "date": "2026-07-01",
                    "account_id": "account_op",
                }
            )
            proposal = allocation_service.propose_allocation(
                5_000_000, "account_op", currency="COP", income_is_complete=True
            )
            for ln in proposal["lines"]:
                ln["accepted"] = ln["kind"] == "fixed_expense" and ln["enabled"]
            allocation_service.confirm_allocation(proposal)
            kpis = assistant_service.build_kpis()
        # fijos 1.5M → (5M − 1.5M) / 5M = 70%
        self.assertEqual(kpis["month_summary"]["expense"], 1_500_000)
        self.assertEqual(kpis["savings_actual_percent"], 70.0)

    def test_transfer_to_goal_does_not_count_as_expense(self):
        with patch.object(assistant_service, "_month_prefix", return_value="2026-07"):
            finance_store.add_income(
                {
                    "amount": 5_000_000,
                    "currency": "COP",
                    "category": "Salario",
                    "date": "2026-07-01",
                    "account_id": "account_op",
                }
            )
            finance_store.add_transfer(
                {
                    "from_account_id": "account_op",
                    "to_account_id": "account_emg",
                    "amount": 500_000,
                    "currency": "COP",
                    "goal_id": "goal_emg",
                    "label": "Aporte emergencia",
                    "source": "allocation",
                }
            )
            kpis = assistant_service.build_kpis()
        self.assertEqual(kpis["month_summary"]["expense"], 0)
        self.assertEqual(kpis["savings_actual_percent"], 100.0)

    def test_emergency_months_with_linked_account(self):
        # 3_000_000 / 1_500_000 fijos = 2.0 meses
        kpis = assistant_service.build_kpis()
        self.assertEqual(kpis["emergency_months_approx"], 2.0)
        self.assertEqual(kpis["month_summary"]["emergency_balance"], 3_000_000)
        self.assertEqual(kpis["emergency_vs_target_delta"], -4.0)  # 2 − 6

    def test_month_uses_business_date_not_created_at_only(self):
        """Un gasto con date del mes cuenta aunque created_at sea otro (vía _sum_month)."""
        with patch.object(assistant_service, "_month_prefix", return_value="2026-07"):
            data = finance_store.load_data()
            data["expenses"].append(
                {
                    "id": "expense_manual",
                    "account_id": "account_op",
                    "amount": 200_000,
                    "currency": "COP",
                    "category": "Café",
                    "description": "Borde de mes",
                    "date": "2026-07-31",
                    "created_at": "2026-08-01T05:00:00",
                }
            )
            data["incomes"].append(
                {
                    "id": "income_manual",
                    "account_id": "account_op",
                    "amount": 1_000_000,
                    "currency": "COP",
                    "category": "Salario",
                    "description": "Mes",
                    "date": "2026-07-01",
                    "created_at": "2026-07-01T12:00:00",
                }
            )
            finance_store.save_data(data)
            kpis = assistant_service.build_kpis()
        self.assertEqual(kpis["month_summary"]["expense"], 200_000)
        self.assertEqual(kpis["savings_actual_percent"], 80.0)


if __name__ == "__main__":
    unittest.main()
