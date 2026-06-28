import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import app
from integrations import registry
from integrations import settings as ai_settings
from integrations.base import IntegrationError
from integrations.gemini import GeminiIntegration
from integrations.ollama import OllamaIntegration
from integrations.openai_compatible import OpenAICompatibleIntegration
from services import ai_service, finance_store, vision_service
from services.investment_ledger import parse_date, refine_ocr_row


class ApiTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data_path = Path(self.tmp.name) / "delfos_data.json"
        self.original_path = finance_store.DATA_PATH
        finance_store.DATA_PATH = self.data_path
        finance_store.save_data(
            {
                "settings": {"currency": "COP"},
                "categories": [],
                "accounts": [],
                "expenses": [],
                "incomes": [],
                "investments": [],
                "notes": [],
            }
        )
        self.client = app.test_client()

    def tearDown(self):
        finance_store.DATA_PATH = self.original_path
        self.tmp.cleanup()

    def test_reset_requires_confirmation(self):
        res = self.client.post("/api/settings/reset", json={"confirmation": "wrong"})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.get_json()["error"], "Invalid reset confirmation")

    def test_reset_clears_data(self):
        self.client.post(
            "/api/accounts",
            json={"name": "Efectivo", "type": "cash", "currency": "COP", "initial_balance": 100},
        )
        res = self.client.post("/api/settings/reset", json={"confirmation": "RESTABLECER"})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["summary"]["total_accounts"], 0)
        self.assertEqual(data["summary"]["total_movements"], 0)
        stored = json.loads(self.data_path.read_text(encoding="utf-8"))
        self.assertEqual(stored["settings"], {"currency": "COP"})
        self.assertEqual(stored["accounts"], [])
        self.assertTrue(len(stored["categories"]) > 0)

    def test_category_crud(self):
        create = self.client.post(
            "/api/categories",
            json={"name": "Comida", "emoji": "🍽️", "kind": "expense"},
        )
        self.assertEqual(create.status_code, 200)
        cat = create.get_json()["category"]
        self.assertEqual(cat["name"], "Comida")
        self.assertEqual(cat["emoji"], "🍽️")
        self.assertEqual(cat["kind"], "expense")
        self.assertTrue(cat["id"])

        listed = self.client.get("/api/categories?kind=expense")
        self.assertEqual(listed.status_code, 200)
        names = [c["name"] for c in listed.get_json()["categories"]]
        self.assertIn("Comida", names)

        patch = self.client.patch(
            f"/api/categories/{cat['id']}",
            json={"name": "Comida rápida", "emoji": "🍔"},
        )
        self.assertEqual(patch.status_code, 200)
        updated = patch.get_json()["category"]
        self.assertEqual(updated["name"], "Comida rápida")
        self.assertEqual(updated["emoji"], "🍔")

        delete = self.client.delete(f"/api/categories/{cat['id']}")
        self.assertEqual(delete.status_code, 200)
        stored = json.loads(self.data_path.read_text(encoding="utf-8"))
        self.assertFalse(any(c["id"] == cat["id"] for c in stored["categories"]))

    def test_category_create_requires_name(self):
        res = self.client.post("/api/categories", json={"emoji": "🏷️"})
        self.assertEqual(res.status_code, 400)

    def test_category_not_found(self):
        res = self.client.patch("/api/categories/missing_id", json={"name": "X"})
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.get_json()["error"], "Category not found")

    def test_finance_payload_includes_categories(self):
        res = self.client.get("/api/finance")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("categories", data)
        self.assertIsInstance(data["categories"], list)

    def test_finance_payload_includes_movement_filters(self):
        res = self.client.get("/api/finance")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("movement_filters", data)
        filters = data["movement_filters"]
        self.assertEqual(len(filters), 5)
        self.assertEqual(filters[0], {"id": "all", "label": "Todos"})
        self.assertEqual(filters[1]["id"], "expense")
        self.assertEqual(filters[2], {"id": "income", "label": "Ingreso"})
        self.assertEqual(filters[3]["id"], "investment")
        self.assertEqual(filters[4]["id"], "note")

    def test_legacy_categories_migration(self):
        legacy = {
            "settings": {
                "currency": "COP",
                "categories": [{"name": "Legacy Cat", "emoji": "📦"}],
            },
            "accounts": [],
            "expenses": [],
            "incomes": [],
            "investments": [],
            "notes": [],
        }
        finance_store.save_data(legacy)
        cats = finance_store.get_categories()
        self.assertTrue(any(c["name"] == "Legacy Cat" for c in cats))
        data = json.loads(self.data_path.read_text(encoding="utf-8"))
        self.assertNotIn("categories", data.get("settings", {}))

    def test_confirm_analysis_saves_suggested_category(self):
        result = finance_store.confirm_analysis(
            {
                "expenses": [
                    {
                        "kind": "expense",
                        "amount": 5000,
                        "currency": "COP",
                        "category": "General",
                        "description": "Test",
                        "suggested_new_category": "Snacks",
                        "accept_category_suggestion": True,
                        "category_emoji": "🍿",
                    }
                ]
            }
        )
        self.assertEqual(result["saved"]["expenses"], 1)
        cats = finance_store.get_categories()
        self.assertTrue(any(c["name"] == "Snacks" for c in cats))

    def test_account_crud_and_delete_nullifies_movements(self):
        acc = self.client.post(
            "/api/accounts",
            json={"name": "Nequi", "type": "wallet", "currency": "COP", "initial_balance": 50000},
        ).get_json()["account"]

        exp = self.client.post(
            "/api/expenses",
            json={
                "account_id": acc["id"],
                "amount": 10000,
                "currency": "COP",
                "description": "Comida",
            },
        ).get_json()["expense"]
        self.assertEqual(exp["account_id"], acc["id"])

        patch = self.client.patch(
            f"/api/accounts/{acc['id']}",
            json={"name": "Nequi 2", "current_balance": 40000},
        )
        self.assertEqual(patch.status_code, 200)
        updated = patch.get_json()["account"]
        self.assertEqual(updated["name"], "Nequi 2")
        self.assertEqual(updated["current_balance"], 40000)

        delete = self.client.delete(f"/api/accounts/{acc['id']}")
        self.assertEqual(delete.status_code, 200)
        stored = json.loads(self.data_path.read_text(encoding="utf-8"))
        self.assertEqual(stored["accounts"], [])
        self.assertIsNone(stored["expenses"][0]["account_id"])

    def test_expense_update_and_delete(self):
        exp = self.client.post(
            "/api/expenses",
            json={"amount": 5000, "currency": "COP", "description": "Cafe"},
        ).get_json()["expense"]

        patch = self.client.patch(
            f"/api/expenses/{exp['id']}",
            json={"description": "Cafe editado", "amount": 6000},
        )
        self.assertEqual(patch.status_code, 200)
        self.assertEqual(patch.get_json()["expense"]["description"], "Cafe editado")

        delete = self.client.delete(f"/api/expenses/{exp['id']}")
        self.assertEqual(delete.status_code, 200)
        self.assertEqual(delete.get_json()["summary"]["total_movements"], 0)

    def test_income_update_and_delete(self):
        inc = self.client.post(
            "/api/incomes",
            json={"amount": 5000000, "currency": "COP", "description": "Salario", "category": "Salario"},
        ).get_json()["income"]
        self.assertEqual(inc["amount"], 5000000.0)
        self.assertEqual(inc["category"], "Salario")

        patch = self.client.patch(
            f"/api/incomes/{inc['id']}",
            json={"description": "Salario editado", "amount": 5500000, "income_source": "Empresa"},
        )
        self.assertEqual(patch.status_code, 200)
        updated = patch.get_json()["income"]
        self.assertEqual(updated["description"], "Salario editado")
        self.assertEqual(updated["income_source"], "Empresa")

        movements = self.client.get("/api/finance").get_json()["movements"]
        self.assertTrue(any(m["type"] == "income" and m["id"] == inc["id"] for m in movements))

        delete = self.client.delete(f"/api/incomes/{inc['id']}")
        self.assertEqual(delete.status_code, 200)
        self.assertEqual(delete.get_json()["summary"]["total_movements"], 0)

    def test_investment_update_and_delete(self):
        inv = self.client.post(
            "/api/investments",
            json={"asset": "VOO", "amount": 100, "currency": "USD"},
        ).get_json()["investment"]

        patch = self.client.patch(
            f"/api/investments/{inv['id']}",
            json={"asset": "VTI", "notes": "Cambio"},
        )
        self.assertEqual(patch.status_code, 200)
        self.assertEqual(patch.get_json()["investment"]["asset"], "VTI")

        missing = self.client.delete("/api/investments/missing_id")
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.get_json()["error"], "Investment not found")

        delete = self.client.delete(f"/api/investments/{inv['id']}")
        self.assertEqual(delete.status_code, 200)

    def test_investment_assets_seeded_and_create_endpoint(self):
        finance_store.add_investment(
            {"asset": "VOO", "amount": 100, "currency": "USD", "operation_type": "buy"},
        )
        finance_store.add_investment(
            {"asset": "voo", "amount": 50, "currency": "USD", "operation_type": "buy"},
        )
        data = self.client.get("/api/finance").get_json()
        symbols = {a["symbol"] for a in data.get("investment_assets", [])}
        self.assertIn("VOO", symbols)
        self.assertEqual(len(symbols), 1)

        create = self.client.post("/api/investment-assets", json={"symbol": "vti", "label": "Vanguard"})
        self.assertEqual(create.status_code, 200)
        asset = create.get_json()["investment_asset"]
        self.assertEqual(asset["symbol"], "VTI")
        self.assertEqual(asset["label"], "Vanguard")

        dup = self.client.post("/api/investment-assets", json={"symbol": "VTI"})
        self.assertEqual(dup.status_code, 200)
        self.assertEqual(dup.get_json()["investment_asset"]["symbol"], "VTI")

        missing = self.client.post("/api/investment-assets", json={})
        self.assertEqual(missing.status_code, 400)

    def test_add_investment_registers_asset_in_catalog(self):
        inv = self.client.post(
            "/api/investments",
            json={"asset": "NVDA", "amount": 200, "currency": "USD", "operation_type": "buy"},
        ).get_json()["investment"]
        self.assertEqual(inv["asset"], "NVDA")
        assets = self.client.get("/api/finance").get_json().get("investment_assets", [])
        self.assertTrue(any(a["symbol"] == "NVDA" for a in assets))

    def test_note_update_and_delete(self):
        note = self.client.post("/api/note", json={"text": "Mi nota"}).get_json()["note"]

        patch = self.client.patch(
            f"/api/notes/{note['id']}",
            json={"text": "Nota actualizada", "tags": ["ideas"]},
        )
        self.assertEqual(patch.status_code, 200)
        self.assertEqual(patch.get_json()["note"]["text"], "Nota actualizada")

        delete = self.client.delete(f"/api/notes/{note['id']}")
        self.assertEqual(delete.status_code, 200)

    def test_not_found_errors(self):
        res = self.client.patch("/api/accounts/bad_id", json={"name": "X"})
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.get_json()["error"], "Account not found")

    def test_export_csv_header_and_rows(self):
        finance_store.add_investment(
            {
                "operation_type": "buy",
                "date": "2024-11-14",
                "asset": "ACWI",
                "quantity": 0.18274,
                "amount_usd": 22.0,
                "unit_price": 120.38,
                "closing_cost": 0.15,
                "total": 22.15,
                "amount": 22.15,
            }
        )
        res = self.client.get("/api/investments/export.csv")
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/csv", res.content_type)
        text = res.data.decode("utf-8-sig")
        lines = text.strip().splitlines()
        self.assertEqual(
            lines[0],
            "Tipo de Operación,Fecha,Activo,Cantidad,Monto USD,Monto COP,Precio Unitario,Costo de Cierre,Ganancia/Pérdida USD,Total",
        )
        self.assertIn("Compra", text)
        self.assertIn("ACWI", text)
        self.assertIn("2024-11-14", text)

    def test_import_csv_preview_and_confirm_round_trip(self):
        finance_store.add_investment(
            {
                "operation_type": "deposit",
                "date": "2024-11-14",
                "amount_usd": 22.36,
                "amount_cop": 111413.0,
                "total": 22.36,
                "amount": 22.36,
            }
        )
        exported = self.client.get("/api/investments/export.csv")
        csv_text = exported.data.decode("utf-8-sig")

        preview = self.client.post("/api/investments/import.csv", json={"csv": csv_text})
        self.assertEqual(preview.status_code, 200)
        preview_data = preview.get_json()
        self.assertEqual(preview_data["count"], 1)
        self.assertEqual(preview_data["preview"][0]["operation_type"], "deposit")

        finance_store.reset_finance_data()
        confirmed = self.client.post(
            "/api/investments/import.csv",
            json={"csv": csv_text, "confirm": True},
        )
        self.assertEqual(confirmed.status_code, 200)
        data = confirmed.get_json()
        self.assertEqual(data["imported"], 1)
        inv = data["investments"][0]
        self.assertEqual(inv["operation_type"], "deposit")
        self.assertEqual(inv["amount_usd"], 22.36)
        self.assertEqual(inv["total"], 22.36)

    def test_investments_ocr_requires_image(self):
        res = self.client.post("/api/investments/ocr")
        self.assertEqual(res.status_code, 400)
        self.assertIn("Imagen requerida", res.get_json()["error"])

    def test_investments_ocr_confirm_requires_rows(self):
        res = self.client.post("/api/investments/ocr/confirm", json={"rows": []})
        self.assertEqual(res.status_code, 400)

    def test_investments_ocr_confirm_saves_rows(self):
        res = self.client.post(
            "/api/investments/ocr/confirm",
            json={
                "rows": [
                    {
                        "operation_type": "buy",
                        "date": "2024-11-14",
                        "asset": "VOO",
                        "amount_usd": 100,
                        "total": 100,
                        "amount": 100,
                    }
                ]
            },
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["saved"], 1)
        self.assertEqual(data["investments"][0]["asset"], "VOO")
        self.assertEqual(data["investments"][0]["operation_type"], "buy")

    def test_investments_ocr_mocked(self):
        from unittest.mock import patch

        mock_result = vision_service.mock_ocr_preview()
        ollama_ok = {
            "ok": True,
            "vision_model": "llava",
            "vision_model_found": True,
        }
        with patch("app.ai_service.check_ollama_connection", return_value=ollama_ok):
            with patch("app.vision_service.analyze_investment_image", return_value=mock_result):
                res = self.client.post(
                    "/api/investments/ocr",
                    data={"image": (io.BytesIO(b"fake"), "shot.png")},
                    content_type="multipart/form-data",
                )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(len(data["rows"]), 1)
        self.assertEqual(data["rows"][0]["asset"], "VOO")
        self.assertTrue(data["ai_available"])

    def test_investments_ocr_503_when_vision_model_missing(self):
        from unittest.mock import patch

        with patch(
            "app.ai_service.check_ollama_connection",
            return_value={
                "ok": True,
                "vision_model": "llava",
                "vision_model_found": False,
            },
        ):
            res = self.client.post(
                "/api/investments/ocr",
                data={"image": (io.BytesIO(b"fake"), "shot.png")},
                content_type="multipart/form-data",
            )
        self.assertEqual(res.status_code, 503)
        data = res.get_json()
        self.assertFalse(data["ai_available"])
        self.assertFalse(data["vision_model_found"])
        self.assertIn("llava", data["hint"])
        self.assertEqual(data["rows"], [])

    def test_expenses_import_csv_preview_and_confirm(self):
        self.client.post(
            "/api/accounts",
            json={"name": "Nequi", "type": "wallet", "currency": "COP", "initial_balance": 100000},
        )
        csv_text = (
            "Fecha,Cuenta,Monto,Moneda,Categoría,Emoji,Descripción,Método de pago\n"
            "2025-01-15,Nequi,25000,COP,Comida,🍽️,Almuerzo,Efectivo\n"
            "2025-01-16,,15000,COP,Transporte,🚌,Bus,\n"
        )

        preview = self.client.post("/api/expenses/import.csv", json={"csv": csv_text})
        self.assertEqual(preview.status_code, 200)
        preview_data = preview.get_json()
        self.assertEqual(preview_data["count"], 2)
        self.assertEqual(preview_data["preview"][0]["amount"], 25000.0)
        self.assertEqual(preview_data["preview"][0]["category"], "Comida")
        self.assertIsNotNone(preview_data["preview"][0]["account_id"])

        confirmed = self.client.post(
            "/api/expenses/import.csv",
            json={"csv": csv_text, "confirm": True},
        )
        self.assertEqual(confirmed.status_code, 200)
        data = confirmed.get_json()
        self.assertEqual(data["imported"], 2)
        self.assertEqual(len(data["expenses"]), 2)
        self.assertEqual(data["expenses"][0]["amount"], 25000)

    def test_incomes_import_csv_preview_and_confirm(self):
        self.client.post(
            "/api/accounts",
            json={"name": "Bancolombia", "type": "bank", "currency": "COP", "initial_balance": 0},
        )
        csv_text = (
            "Fecha,Cuenta,Monto,Moneda,Categoría,Emoji,Descripción,Fuente\n"
            "2025-03-01,Bancolombia,5000000,COP,Salario,💼,Nómina marzo,Empresa SA\n"
            "2025-03-05,,800000,COP,Freelance,💻,Proyecto web,Cliente X\n"
        )

        preview = self.client.post("/api/incomes/import.csv", json={"csv": csv_text})
        self.assertEqual(preview.status_code, 200)
        preview_data = preview.get_json()
        self.assertEqual(preview_data["count"], 2)
        self.assertEqual(preview_data["preview"][0]["amount"], 5000000.0)
        self.assertEqual(preview_data["preview"][0]["category"], "Salario")
        self.assertEqual(preview_data["preview"][0]["income_source"], "Empresa SA")
        self.assertIsNotNone(preview_data["preview"][0]["account_id"])

        confirmed = self.client.post(
            "/api/incomes/import.csv",
            json={"csv": csv_text, "confirm": True},
        )
        self.assertEqual(confirmed.status_code, 200)
        data = confirmed.get_json()
        self.assertEqual(data["imported"], 2)
        self.assertEqual(len(data["incomes"]), 2)
        self.assertEqual(data["incomes"][0]["amount"], 5000000)
        self.assertIn("monthly_incomes", data["summary"])

    def test_notes_import_csv_preview_and_confirm(self):
        csv_text = (
            "Fecha,Cuenta,Texto,Tags\n"
            '2025-02-01,,"Revisar portafolio Q1","inversiones,ideas"\n'
            "2025-02-02,,Llamar al banco,\n"
        )

        preview = self.client.post("/api/notes/import.csv", json={"csv": csv_text})
        self.assertEqual(preview.status_code, 200)
        preview_data = preview.get_json()
        self.assertEqual(preview_data["count"], 2)
        self.assertEqual(preview_data["preview"][0]["text"], "Revisar portafolio Q1")
        self.assertEqual(preview_data["preview"][0]["tags"], ["inversiones", "ideas"])

        confirmed = self.client.post(
            "/api/notes/import.csv",
            json={"csv": csv_text, "confirm": True},
        )
        self.assertEqual(confirmed.status_code, 200)
        data = confirmed.get_json()
        self.assertEqual(data["imported"], 2)
        self.assertEqual(len(data["notes"]), 2)
        self.assertEqual(data["notes"][0]["tags"], ["inversiones", "ideas"])

    def test_portfolio_empty(self):
        from unittest.mock import patch

        with patch("services.portfolio_service.quote_service.get_quotes", return_value=({}, None, False)):
            res = self.client.get("/api/investments/portfolio")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["positions"], [])
        self.assertIsNone(data["strongest_asset"])
        self.assertEqual(data["total_pnl_usd"], 0)
        self.assertFalse(data["has_positions"])

    def test_portfolio_dca_buy_and_sell(self):
        from unittest.mock import patch

        finance_store.bulk_add_investments(
            [
                {
                    "operation_type": "buy",
                    "date": "2024-01-01",
                    "asset": "VOO",
                    "quantity": 1.0,
                    "amount_usd": 400.0,
                },
                {
                    "operation_type": "buy",
                    "date": "2024-02-01",
                    "asset": "VOO",
                    "quantity": 1.0,
                    "amount_usd": 450.0,
                },
                {
                    "operation_type": "sell",
                    "date": "2024-03-01",
                    "asset": "VOO",
                    "quantity": 0.5,
                    "amount_usd": 250.0,
                    "pnl_usd": 25.0,
                },
            ]
        )
        mock_quotes = {"VOO": 500.0}
        with patch(
            "services.portfolio_service.quote_service.get_quotes",
            return_value=(mock_quotes, "2025-01-01T00:00:00+00:00", False),
        ):
            res = self.client.get("/api/investments/portfolio")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["has_positions"])
        self.assertEqual(len(data["positions"]), 1)
        pos = data["positions"][0]
        self.assertEqual(pos["asset"], "VOO")
        self.assertAlmostEqual(pos["quantity"], 1.5)
        self.assertAlmostEqual(pos["cost_basis_usd"], 637.5)
        self.assertAlmostEqual(pos["market_value_usd"], 750.0)
        self.assertAlmostEqual(pos["unrealized_pnl_usd"], 112.5)
        self.assertAlmostEqual(data["total_realized_pnl_usd"], 25.0)
        self.assertAlmostEqual(data["total_pnl_usd"], 137.5)
        strongest = data["strongest_asset"]
        self.assertEqual(strongest["asset"], "VOO")
        self.assertAlmostEqual(strongest["market_value_usd"], 750.0)
        self.assertFalse(strongest["quote_missing"])

    def test_portfolio_dividend_and_deposit_ignored(self):
        from unittest.mock import patch

        finance_store.bulk_add_investments(
            [
                {
                    "operation_type": "deposit",
                    "date": "2024-01-01",
                    "amount_usd": 1000.0,
                    "total": 1000.0,
                },
                {
                    "operation_type": "buy",
                    "date": "2024-01-02",
                    "asset": "NU",
                    "quantity": 10.0,
                    "amount_usd": 100.0,
                },
                {
                    "operation_type": "dividend",
                    "date": "2024-06-01",
                    "asset": "NU",
                    "pnl_usd": 5.0,
                },
            ]
        )
        with patch(
            "services.portfolio_service.quote_service.get_quotes",
            return_value=({"NU": 12.0}, "2025-01-01T00:00:00+00:00", False),
        ):
            res = self.client.get("/api/investments/portfolio")
        data = res.get_json()
        self.assertEqual(len(data["positions"]), 1)
        self.assertAlmostEqual(data["total_realized_pnl_usd"], 5.0)
        self.assertAlmostEqual(data["positions"][0]["market_value_usd"], 120.0)

    def test_portfolio_strongest_by_market_value(self):
        from unittest.mock import patch

        finance_store.bulk_add_investments(
            [
                {
                    "operation_type": "buy",
                    "date": "2024-01-01",
                    "asset": "VOO",
                    "quantity": 1.0,
                    "amount_usd": 400.0,
                },
                {
                    "operation_type": "buy",
                    "date": "2024-01-01",
                    "asset": "NU",
                    "quantity": 50.0,
                    "amount_usd": 500.0,
                },
            ]
        )
        with patch(
            "services.portfolio_service.quote_service.get_quotes",
            return_value=({"VOO": 500.0, "NU": 8.0}, "2025-01-01T00:00:00+00:00", False),
        ):
            data = self.client.get("/api/investments/portfolio").get_json()
        strongest = data["strongest_asset"]
        self.assertEqual(strongest["asset"], "VOO")
        self.assertAlmostEqual(strongest["market_value_usd"], 500.0)

    def test_portfolio_missing_quote_fallback(self):
        from unittest.mock import patch

        finance_store.add_investment(
            {
                "operation_type": "buy",
                "date": "2024-01-01",
                "asset": "XYZ",
                "quantity": 2.0,
                "amount_usd": 200.0,
            }
        )
        with patch(
            "services.portfolio_service.quote_service.get_quotes",
            return_value=({"XYZ": None}, "2025-01-01T00:00:00+00:00", True),
        ):
            data = self.client.get("/api/investments/portfolio").get_json()
        strongest = data["strongest_asset"]
        self.assertEqual(strongest["asset"], "XYZ")
        self.assertTrue(strongest["quote_missing"])
        self.assertAlmostEqual(strongest["cost_basis_usd"], 200.0)
        self.assertTrue(data["quotes_partial"])


class AiSettingsTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.settings_path = Path(self.tmp.name) / "ai_settings.json"
        self.original_path = ai_settings.SETTINGS_PATH
        ai_settings.SETTINGS_PATH = self.settings_path
        registry.clear_cache()
        # Aislar de variables de entorno del host (p.ej. GEMINI_API_KEY real).
        self.env_patch = patch.dict(
            "os.environ",
            {
                "AI_PROVIDER": "local",
                "AI_CLOUD_ENABLED": "false",
                "AI_TEXT_MODEL": "",
                "AI_VISION_MODEL": "",
                "AI_BASE_URL": "",
                "GEMINI_API_KEY": "",
                "AI_API_KEY": "",
            },
            clear=False,
        )
        self.env_patch.start()
        self.client = app.test_client()

    def tearDown(self):
        self.env_patch.stop()
        ai_settings.SETTINGS_PATH = self.original_path
        registry.clear_cache()
        self.tmp.cleanup()

    def test_get_settings_defaults_no_key(self):
        res = self.client.get("/api/settings/ai")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("config", data)
        self.assertIn("providers", data)
        cfg = data["config"]
        self.assertFalse(cfg["cloud_enabled"])
        self.assertEqual(cfg["provider"], "local")
        self.assertFalse(cfg["has_api_key"])
        self.assertEqual(cfg["masked_key"], "")
        self.assertNotIn("api_key", cfg)
        provider_ids = {p["id"] for p in data["providers"]}
        self.assertEqual(provider_ids, {"local", "gemini", "compatible"})

    def test_api_key_never_returned_plaintext(self):
        save = self.client.post(
            "/api/settings/ai",
            json={"cloud_enabled": True, "provider": "gemini", "api_key": "SECRET123456"},
        )
        self.assertEqual(save.status_code, 200)
        cfg = save.get_json()["config"]
        self.assertNotIn("api_key", cfg)
        self.assertTrue(cfg["has_api_key"])
        self.assertEqual(cfg["masked_key"], "****3456")

        # En el GET tampoco aparece en claro.
        body = self.client.get("/api/settings/ai").get_json()["config"]
        self.assertNotIn("api_key", body)
        self.assertTrue(body["has_api_key"])
        # Pero el secreto SÍ persiste en el archivo gitignored para uso interno.
        stored = json.loads(self.settings_path.read_text(encoding="utf-8"))
        self.assertEqual(stored["api_key"], "SECRET123456")

    def test_saving_without_key_keeps_previous(self):
        self.client.post(
            "/api/settings/ai",
            json={"cloud_enabled": True, "provider": "gemini", "api_key": "FIRSTKEY9999"},
        )
        # Guardar cambios sin enviar api_key no debe borrar la previa.
        res = self.client.post(
            "/api/settings/ai",
            json={"cloud_enabled": True, "provider": "gemini", "text_model": "gemini-2.0-flash"},
        )
        cfg = res.get_json()["config"]
        self.assertTrue(cfg["has_api_key"])
        self.assertEqual(cfg["masked_key"], "****9999")
        self.assertEqual(cfg["text_model"], "gemini-2.0-flash")
        stored = json.loads(self.settings_path.read_text(encoding="utf-8"))
        self.assertEqual(stored["api_key"], "FIRSTKEY9999")

    def test_registry_selects_local_when_cloud_disabled(self):
        ai_settings.save_config({"cloud_enabled": False, "provider": "gemini"})
        registry.clear_cache()
        integration = registry.get_active_integration()
        self.assertIsInstance(integration, OllamaIntegration)

    def test_registry_selects_gemini(self):
        ai_settings.save_config({"cloud_enabled": True, "provider": "gemini", "api_key": "k"})
        registry.clear_cache()
        integration = registry.get_active_integration()
        self.assertIsInstance(integration, GeminiIntegration)

    def test_registry_selects_compatible(self):
        ai_settings.save_config(
            {"cloud_enabled": True, "provider": "compatible", "api_key": "k", "base_url": "https://x/v1"}
        )
        registry.clear_cache()
        integration = registry.get_active_integration()
        self.assertIsInstance(integration, OpenAICompatibleIntegration)
        self.assertEqual(integration.base_url, "https://x/v1")

    def test_test_endpoint_reports_status_without_network(self):
        fake = OllamaIntegration()
        with patch.object(OllamaIntegration, "health", return_value={"ok": True, "provider": "local"}):
            res = self.client.post("/api/settings/ai/test", json={"cloud_enabled": False})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()["ok"])
        del fake

    def test_analyze_text_uses_active_integration(self):
        payload = json.dumps(
            {
                "expenses": [{"amount": 18000, "currency": "COP", "category": "Transporte", "description": "Taxi"}],
                "investments": [],
                "notes": [],
                "reflection": "1 gasto",
            }
        )

        class FakeIntegration:
            def complete_json(self, prompt):
                return payload

            def health(self):
                return {"ok": True}

        with patch("services.ai_service.registry.get_active_integration", return_value=FakeIntegration()):
            result = ai_service.analyze_text("taxi 18 mil")
        self.assertTrue(result["ai_available"])
        self.assertEqual(result["counts"]["expenses"], 1)
        self.assertEqual(result["expenses"][0]["amount"], 18000)

    def test_analyze_text_fallback_on_integration_error(self):
        class FailingIntegration:
            def complete_json(self, prompt):
                raise IntegrationError("boom", hint="revisa la key")

            def health(self):
                return {"ok": False, "error": "down"}

        with patch("services.ai_service.registry.get_active_integration", return_value=FailingIntegration()):
            result = ai_service.analyze_text("algo")
        self.assertFalse(result["ai_available"])
        self.assertTrue(result.get("can_save_as_note"))
        self.assertIn("boom", result["error"])
        self.assertEqual(result["hint"], "revisa la key")

    def test_ocr_image_uses_active_integration(self):
        payload = json.dumps(
            {
                "rows": [
                    {
                        "operation_type": "Compra",
                        "date": "2024-11-14",
                        "asset": "VOO",
                        "quantity": 0.5,
                        "amount_usd": 100,
                        "total": 100,
                    }
                ]
            }
        )

        class FakeVision:
            def vision_json(self, prompt, image_b64, mime="image/png"):
                return payload

            def health(self):
                return {"ok": True}

        with patch("services.vision_service.registry.get_active_integration", return_value=FakeVision()):
            result = vision_service.ocr_image(b"fakeimage", "image/png")
        self.assertTrue(result["ai_available"])
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["rows"][0]["asset"], "VOO")

    def test_ocr_image_fallback_on_integration_error(self):
        class FailingVision:
            def vision_json(self, prompt, image_b64, mime="image/png"):
                raise IntegrationError("no vision", hint="configura el modelo")

            def health(self):
                return {"ok": False}

        with patch("services.vision_service.registry.get_active_integration", return_value=FailingVision()):
            result = vision_service.ocr_image(b"fakeimage", "image/png")
        self.assertFalse(result["ai_available"])
        self.assertIn("no vision", result["error"])
        self.assertEqual(result["hint"], "configura el modelo")


class OpenAICompatiblePayloadTestCase(unittest.TestCase):
    def _capture_payload(self, call):
        captured = {}

        class FakeResp:
            def __enter__(self_inner):
                return self_inner

            def __exit__(self_inner, *args):
                return False

            def read(self_inner):
                return json.dumps({"choices": [{"message": {"content": "{}"}}]}).encode("utf-8")

        def fake_urlopen(req, timeout=None):
            captured["payload"] = json.loads(req.data.decode("utf-8"))
            return FakeResp()

        integration = OpenAICompatibleIntegration(
            text_model="text-model",
            vision_model="vision-model",
            api_key="k",
        )
        with patch("integrations.openai_compatible.urllib.request.urlopen", fake_urlopen):
            call(integration)
        return captured["payload"]

    def test_vision_json_omits_response_format(self):
        payload = self._capture_payload(lambda i: i.vision_json("read this", "Zm9v", "image/png"))
        self.assertNotIn("response_format", payload)

    def test_complete_json_includes_response_format(self):
        payload = self._capture_payload(lambda i: i.complete_json("hola"))
        self.assertEqual(payload["response_format"], {"type": "json_object"})


class OcrRefinementTestCase(unittest.TestCase):
    def test_parse_spanish_date(self):
        self.assertEqual(parse_date("22 jun 2026"), "2026-06-22")
        self.assertEqual(parse_date("5 de diciembre de 2024"), "2024-12-05")

    def test_refine_buy_computes_unit_price_and_total(self):
        row, warnings = refine_ocr_row(
            {
                "operation_type": "buy",
                "date": "2026-06-22",
                "asset": "ACWI",
                "quantity": 1.52039,
                "amount_usd": 240.0,
                "unit_price": None,
                "closing_cost": 0.15,
                "total": None,
                "pnl_usd": 50.0,
                "amount_cop": None,
                "amount": 240.0,
            }
        )
        self.assertAlmostEqual(row["unit_price"], 240.0 / 1.52039, places=4)
        self.assertAlmostEqual(row["total"], 240.15, places=2)
        self.assertIsNone(row["pnl_usd"])
        self.assertTrue(any("P/G USD eliminado" in w for w in warnings))

    def test_refine_buy_derives_amount_usd_from_total(self):
        row, _warnings = refine_ocr_row(
            {
                "operation_type": "buy",
                "date": "2026-06-22",
                "asset": "ACWI",
                "quantity": 1.52039,
                "amount_usd": None,
                "unit_price": 157.85,
                "closing_cost": 0.15,
                "total": 240.15,
                "pnl_usd": None,
                "amount_cop": None,
                "amount": 240.15,
            }
        )
        self.assertAlmostEqual(row["amount_usd"], 240.0, places=2)

    def test_refine_flags_cop_hallucination(self):
        _row, warnings = refine_ocr_row(
            {
                "operation_type": "buy",
                "date": "2026-06-22",
                "asset": "ACWI",
                "quantity": 1.0,
                "amount_usd": 100.0,
                "amount_cop": 500000.0,
                "unit_price": 100.0,
                "closing_cost": None,
                "total": 100.0,
                "pnl_usd": None,
                "amount": 100.0,
            }
        )
        self.assertTrue(any("COP" in w for w in warnings))

    def test_refine_flags_quantity_price_mismatch(self):
        _row, warnings = refine_ocr_row(
            {
                "operation_type": "buy",
                "date": "2026-06-22",
                "asset": "ACWI",
                "quantity": 56.0,
                "amount_usd": 240.0,
                "unit_price": 157.85,
                "closing_cost": None,
                "total": 240.0,
                "pnl_usd": None,
                "amount_cop": None,
                "amount": 240.0,
            }
        )
        self.assertTrue(any("difiere" in w for w in warnings))

    def test_common_broker_date_formats_normalize_to_iso(self):
        cases = {
            "22 jun 2026": "2026-06-22",
            "22 de junio de 2026": "2026-06-22",
            "22/06/2026": "2026-06-22",
            "22-06-2026": "2026-06-22",
            "2026-06-22": "2026-06-22",
            "22 jun. 2026": "2026-06-22",
            "22 jun 2026, 3:45 p.m.": "2026-06-22",
            "Fecha: 22 jun 2026": "2026-06-22",
            "jun 22 2026": "2026-06-22",
            "22 jun 26": "2026-06-22",
            "22-jun-2026": "2026-06-22",
        }
        for raw, expected in cases.items():
            self.assertEqual(parse_date(raw), expected, msg=raw)

    def test_ocr_row_with_spanish_date_not_flagged_unrecognized(self):
        row = vision_service.normalize_ocr_row(
            {
                "operation_type": "Compra",
                "date": "Fecha: 22 jun. 2026, 3:45 p.m.",
                "asset": "ACWI",
                "quantity": 1.52039,
                "amount_usd": 240,
            }
        )
        self.assertEqual(row["date"], "2026-06-22")
        # ocr_image raises "fecha no reconocida" only when refined date is falsy.
        self.assertTrue(row.get("date"))

    def test_vision_normalize_spanish_date_and_refine(self):
        row = vision_service.normalize_ocr_row(
            {
                "operation_type": "Compra",
                "date": "22 jun 2026",
                "asset": "ACWI",
                "quantity": 1.52039,
                "amount_usd": 240,
                "closing_cost": 0.15,
                "pnl_usd": 99,
                "amount_cop": 999999,
            }
        )
        self.assertEqual(row["date"], "2026-06-22")
        self.assertIsNone(row["pnl_usd"])
        self.assertAlmostEqual(row["unit_price"], 240.0 / 1.52039, places=4)
        self.assertAlmostEqual(row["total"], 240.15, places=2)


if __name__ == "__main__":
    unittest.main()
