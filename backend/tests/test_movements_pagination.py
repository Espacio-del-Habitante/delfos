"""Paginación y filtros de GET /api/movements + list_movements."""

import tempfile
import unittest
from pathlib import Path

from app import app
from services import finance_store


class MovementsPaginationTests(unittest.TestCase):
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
                        "initial_balance": 0,
                        "current_balance": 0,
                        "emoji": "🏦",
                        "goal_id": None,
                        "role": "operating",
                    }
                ],
                "expenses": [],
                "incomes": [],
                "investments": [],
                "notes": [],
                "transfers": [],
                "financial_profile": dict(finance_store.DEFAULT_FINANCIAL_PROFILE),
                "goals": [],
                "chat_threads": [],
                "chat_messages": [],
                "memory_facts": [],
                "memory_summaries": [],
            }
        )
        # 30 gastos en junio + 5 en julio (fechas de negocio explícitas).
        for i in range(30):
            finance_store.add_expense(
                {
                    "amount": 1000 + i,
                    "currency": "COP",
                    "category": "Comida",
                    "description": f"Junio {i:02d}",
                    "date": f"2026-06-{(i % 28) + 1:02d}",
                    "account_id": "account_001",
                }
            )
        for i in range(5):
            finance_store.add_income(
                {
                    "amount": 50_000,
                    "currency": "COP",
                    "category": "Salario",
                    "description": f"Julio ingreso {i}",
                    "date": f"2026-07-{10 + i:02d}",
                    "account_id": "account_001",
                }
            )
        self.client = app.test_client()

    def tearDown(self):
        finance_store.DATA_PATH = self.original_path
        self.tmp.cleanup()

    def test_list_movements_date_range_inclusive(self):
        page = finance_store.list_movements(
            date_from="2026-07-10", date_to="2026-07-12", page=1, page_size=25
        )
        self.assertEqual(page["total"], 3)
        self.assertEqual(len(page["items"]), 3)
        days = {m["date"] for m in page["items"]}
        self.assertTrue(days <= {"2026-07-10", "2026-07-11", "2026-07-12"})

    def test_list_movements_pagination(self):
        page1 = finance_store.list_movements(page=1, page_size=10)
        page2 = finance_store.list_movements(page=2, page_size=10)
        self.assertEqual(page1["total"], 35)
        self.assertEqual(page1["page"], 1)
        self.assertEqual(page1["page_size"], 10)
        self.assertEqual(len(page1["items"]), 10)
        self.assertEqual(len(page2["items"]), 10)
        ids1 = {m["id"] for m in page1["items"]}
        ids2 = {m["id"] for m in page2["items"]}
        self.assertFalse(ids1 & ids2)

    def test_list_movements_kind_and_q(self):
        page = finance_store.list_movements(kind="income", q="Julio", page=1, page_size=25)
        self.assertEqual(page["total"], 5)
        self.assertTrue(all(m["type"] == "income" for m in page["items"]))

    def test_api_movements_query_params(self):
        res = self.client.get(
            "/api/movements?date_from=2026-06-01&date_to=2026-06-30&page=2&page_size=10"
        )
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertEqual(body["total"], 30)
        self.assertEqual(body["page"], 2)
        self.assertEqual(body["page_size"], 10)
        self.assertEqual(len(body["items"]), 10)

    def test_finance_preview_stays_short(self):
        preview = finance_store.get_movements(limit=12)
        self.assertEqual(len(preview), 12)


if __name__ == "__main__":
    unittest.main()
