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

    def test_confirm_fixed_total_one_expense(self):
        """Modo Total: una línea agregada → un solo expense (sin split silencioso)."""
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
        self.assertEqual(proposal.get("fixed_mode"), "total")
        self.assertEqual(len(proposal.get("fixed_desglose") or []), 2)
        for ln in proposal["lines"]:
            ln["accepted"] = ln["kind"] == "fixed_expense" and ln["enabled"]
        result = allocation_service.confirm_allocation(proposal)
        self.assertLessEqual(result["moved"], 600_000 + 0.01)
        self.assertEqual(result["moved"], 600_000)
        self.assertEqual(result["applied"]["expenses"], 1)
        self.assertEqual(result["expenses"][0]["description"], "Gastos fijos del mes")

    def test_confirm_fixed_desglose_one_expense_per_line(self):
        finance_store.update_financial_profile(
            {
                "monthly_fixed_expenses": 1_000_000,
                "fixed_expenses": [
                    {"label": "Arriendo", "amount": 800_000},
                    {"label": "Internet", "amount": 200_000},
                ],
                "savings_target_percent": 0,
                "investment_target_percent": 0,
                "cushion_percent": 0,
            }
        )
        proposal = allocation_service.propose_allocation(
            5_000_000, "account_001", currency="COP"
        )
        desglose = proposal.get("fixed_desglose") or []
        self.assertEqual(len(desglose), 2)
        self.assertEqual(sum(float(x["amount"]) for x in desglose), 1_000_000)
        lines = [*desglose]
        for ln in proposal["lines"]:
            if ln["kind"] != "fixed_expense":
                lines.append({**ln, "accepted": False})
        for ln in lines:
            if ln["kind"] == "fixed_expense":
                ln["accepted"] = True
                ln["enabled"] = True
        proposal["fixed_mode"] = "desglose"
        proposal["lines"] = lines
        result = allocation_service.confirm_allocation(proposal)
        self.assertEqual(result["applied"]["expenses"], 2)
        self.assertEqual(result["moved"], 1_000_000)
        labels = {e["description"] for e in result["expenses"]}
        self.assertEqual(labels, {"Arriendo", "Internet"})

    def test_cushion_copy_names_operating_account(self):
        proposal = allocation_service.propose_allocation(
            5_000_000, "account_001", currency="COP"
        )
        cushion = next(ln for ln in proposal["lines"] if ln["kind"] == "cushion")
        self.assertIn("Nómina", cushion["disabled_reason"] or "")
        self.assertIn("no se transfiere", (cushion["disabled_reason"] or "").lower())
        self.assertTrue(cushion["enabled"])
        self.assertFalse(cushion["accepted"])
        self.assertTrue(cushion.get("create_cushion_account"))

    def test_confirm_cushion_creates_account_and_transfer(self):
        proposal = allocation_service.propose_allocation(
            5_000_000, "account_001", currency="COP"
        )
        for ln in proposal["lines"]:
            if ln["kind"] == "cushion":
                ln["accepted"] = True
            else:
                ln["accepted"] = False
        result = allocation_service.confirm_allocation(proposal)
        self.assertEqual(result["applied"]["transfers"], 1)
        self.assertEqual(result["applied"]["accounts"], 1)
        self.assertEqual(result["moved"], 500_000)
        data = finance_store.load_data()
        cushion_acc = next(
            a for a in data["accounts"] if "colchón" in (a.get("name") or "").lower()
        )
        self.assertEqual(cushion_acc["role"], "goal")
        self.assertEqual(cushion_acc["type"], "savings")
        self.assertEqual(float(cushion_acc["current_balance"]), 500_000)

    def test_confirm_cushion_uses_existing_account(self):
        finance_store.add_goal({"title": "Colchón líquido", "type": "savings", "priority": 2})
        goals = finance_store.load_data()["goals"]
        g = next(x for x in goals if "colchón" in (x.get("title") or "").lower())
        finance_store.add_account(
            {
                "name": "Bolsa Colchón",
                "type": "savings",
                "currency": "COP",
                "initial_balance": 0,
                "goal_id": g["id"],
                "role": "goal",
            }
        )
        proposal = allocation_service.propose_allocation(
            5_000_000, "account_001", currency="COP"
        )
        cushion = next(ln for ln in proposal["lines"] if ln["kind"] == "cushion")
        self.assertFalse(cushion.get("create_cushion_account"))
        self.assertIsNotNone(cushion.get("to_account_id"))
        self.assertIn("Bolsa Colchón", cushion["disabled_reason"] or "")
        for ln in proposal["lines"]:
            ln["accepted"] = ln["kind"] == "cushion"
        result = allocation_service.confirm_allocation(proposal)
        self.assertEqual(result["applied"]["accounts"], 0)
        self.assertEqual(result["applied"]["transfers"], 1)
        self.assertEqual(result["moved"], 500_000)

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
        self.assertEqual(result["applied"]["expenses"], 1)

    def test_partial_income_scales_fixed_no_warning(self):
        """income_is_complete=false → fijos * (ingreso / plantilla); sin shortfall."""
        finance_store.update_financial_profile(
            {
                "monthly_income_fixed": 5_000_000,
                "monthly_income_variable_avg": 0,
                "monthly_fixed_expenses": 1_500_000,
                "savings_target_percent": 20,
                "investment_target_percent": 10,
                "cushion_percent": 10,
            }
        )
        proposal = allocation_service.propose_allocation(
            600_000,
            "account_001",
            currency="COP",
            income_is_complete=False,
        )
        fixed = next(ln for ln in proposal["lines"] if ln["kind"] == "fixed_expense")
        # 1_500_000 * (600_000 / 5_000_000) = 180_000
        self.assertEqual(fixed["amount"], 180_000)
        self.assertIsNone(proposal["summary"]["warning"])
        self.assertEqual(
            proposal["summary"]["note"], "Propuesta proporcional al monto registrado"
        )
        self.assertFalse(proposal["income_is_complete"])
        movable = sum(
            float(ln["amount"])
            for ln in proposal["lines"]
            if ln["kind"] != "cushion" and float(ln.get("amount") or 0) > 0
        )
        self.assertLessEqual(movable, 600_000 + 0.01)

    def test_complete_income_shortfall_keeps_warning(self):
        finance_store.update_financial_profile(
            {
                "monthly_income_fixed": 5_000_000,
                "monthly_fixed_expenses": 1_500_000,
            }
        )
        proposal = allocation_service.propose_allocation(
            600_000,
            "account_001",
            currency="COP",
            income_is_complete=True,
        )
        fixed = next(ln for ln in proposal["lines"] if ln["kind"] == "fixed_expense")
        self.assertEqual(fixed["amount"], 600_000)
        self.assertIsNotNone(proposal["summary"]["warning"])
        self.assertTrue(proposal["income_is_complete"])

    def test_period_divisor(self):
        self.assertEqual(allocation_service.period_divisor("monthly"), 1)
        self.assertEqual(allocation_service.period_divisor("biweekly"), 2)
        self.assertEqual(allocation_service.period_divisor("weekly"), 4)
        self.assertEqual(allocation_service.period_divisor(None), 1)

    def test_biweekly_complete_uses_half_fixed(self):
        finance_store.update_financial_profile(
            {
                "pay_frequency": "biweekly",
                "monthly_income_fixed": 5_000_000,
                "monthly_fixed_expenses": 1_000_000,
                "savings_target_percent": 20,
                "investment_target_percent": 10,
                "cushion_percent": 10,
            }
        )
        proposal = allocation_service.propose_allocation(
            2_500_000,
            "account_001",
            currency="COP",
            income_is_complete=True,
        )
        fixed = next(ln for ln in proposal["lines"] if ln["kind"] == "fixed_expense")
        self.assertEqual(fixed["amount"], 500_000)  # 1_000_000 / 2
        self.assertEqual(proposal["period_fixed_amount"], 500_000)
        self.assertEqual(proposal["pay_frequency"], "biweekly")
        self.assertIsNone(proposal["summary"]["warning"])
        self.assertEqual(proposal["summary"]["note"], "Propuesta para quincena")
        self.assertIn("quincena", fixed["label"].lower())

    def test_weekly_complete_uses_quarter_fixed(self):
        finance_store.update_financial_profile(
            {
                "pay_frequency": "weekly",
                "monthly_income_fixed": 5_000_000,
                "monthly_fixed_expenses": 1_000_000,
                "savings_target_percent": 20,
                "investment_target_percent": 10,
                "cushion_percent": 10,
            }
        )
        proposal = allocation_service.propose_allocation(
            1_250_000,
            "account_001",
            currency="COP",
            income_is_complete=True,
        )
        fixed = next(ln for ln in proposal["lines"] if ln["kind"] == "fixed_expense")
        self.assertEqual(fixed["amount"], 250_000)  # 1_000_000 / 4
        self.assertEqual(proposal["period_fixed_amount"], 250_000)
        self.assertEqual(proposal["pay_frequency"], "weekly")
        self.assertIsNone(proposal["summary"]["warning"])
        self.assertEqual(proposal["summary"]["note"], "Propuesta para semana")

    def test_biweekly_shortfall_vs_period_fixed(self):
        """Cheque completo menor a fijos de quincena → warning; no exige fijos del mes."""
        finance_store.update_financial_profile(
            {
                "pay_frequency": "biweekly",
                "monthly_income_fixed": 5_000_000,
                "monthly_fixed_expenses": 1_000_000,  # periodo = 500k
            }
        )
        proposal = allocation_service.propose_allocation(
            400_000,
            "account_001",
            currency="COP",
            income_is_complete=True,
        )
        fixed = next(ln for ln in proposal["lines"] if ln["kind"] == "fixed_expense")
        self.assertEqual(fixed["amount"], 400_000)
        self.assertEqual(proposal["period_fixed_amount"], 500_000)
        self.assertIsNotNone(proposal["summary"]["warning"])

    def test_biweekly_partial_scales_vs_period_expected(self):
        finance_store.update_financial_profile(
            {
                "pay_frequency": "biweekly",
                "monthly_income_fixed": 5_000_000,  # periodo esperado = 2.5M
                "monthly_income_variable_avg": 0,
                "monthly_fixed_expenses": 1_000_000,  # periodo = 500k
            }
        )
        proposal = allocation_service.propose_allocation(
            1_250_000,  # mitad del esperado del periodo
            "account_001",
            currency="COP",
            income_is_complete=False,
        )
        fixed = next(ln for ln in proposal["lines"] if ln["kind"] == "fixed_expense")
        # 500_000 * (1_250_000 / 2_500_000) = 250_000
        self.assertEqual(fixed["amount"], 250_000)
        self.assertIsNone(proposal["summary"]["warning"])
        self.assertEqual(
            proposal["summary"]["note"], "Propuesta proporcional al monto registrado"
        )


if __name__ == "__main__":
    unittest.main()
