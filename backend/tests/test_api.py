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
from services import ai_service, finance_store, quote_service, quote_settings, vision_service
from services.investment_ledger import parse_date, refine_ocr_row


def _mock_quote_snapshots(prices: dict[str, float | None], alerts=None):
    snapshots = {}
    for sym, price in prices.items():
        if price is None:
            snapshots[sym] = quote_service.QuoteSnapshot(
                symbol=sym,
                price=None,
                currency="USD",
                timestamp=None,
                provider=None,
                confidence="missing",
                asset_type="stock",
            )
        else:
            snapshots[sym] = quote_service.QuoteSnapshot(
                symbol=sym,
                price=price,
                currency="USD",
                timestamp="2025-01-01T00:00:00+00:00",
                provider="yfinance",
                confidence="ok",
                asset_type="stock",
            )
    return snapshots, alerts or []


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

    def test_backup_export_round_trip_and_no_secrets(self):
        ai_path = Path(self.tmp.name) / "ai_settings.json"
        quote_path = Path(self.tmp.name) / "quote_settings.json"
        original_ai = ai_settings.SETTINGS_PATH
        original_quote = quote_settings.SETTINGS_PATH
        ai_settings.SETTINGS_PATH = ai_path
        quote_settings.SETTINGS_PATH = quote_path
        try:
            ai_settings.save_config(
                {
                    "cloud_enabled": True,
                    "provider": "gemini",
                    "api_key": "SECRET_AI_KEY",
                    "text_model": "gemini-2.0-flash",
                }
            )
            quote_settings.save_config(
                {
                    "twelve_data_api_key": "SECRET_TD",
                    "alpha_vantage_api_key": "SECRET_AV",
                    "broker_reference_total_usd": 1234.5,
                }
            )
            self.client.post(
                "/api/accounts",
                json={"name": "Efectivo", "type": "cash", "currency": "COP", "initial_balance": 50},
            )

            export = self.client.get("/api/settings/backup")
            self.assertEqual(export.status_code, 200)
            bundle = json.loads(export.data.decode("utf-8"))
            self.assertEqual(bundle["version"], 1)
            self.assertIn("exported_at", bundle)
            self.assertEqual(len(bundle["delfos_data"]["accounts"]), 1)
            self.assertNotIn("api_key", bundle["ai_settings"])
            self.assertNotIn("twelve_data_api_key", bundle["quote_settings"])
            self.assertNotIn("alpha_vantage_api_key", bundle["quote_settings"])
            export_text = export.data.decode("utf-8")
            self.assertNotIn("SECRET_AI_KEY", export_text)
            self.assertNotIn("SECRET_TD", export_text)
            self.assertNotIn("SECRET_AV", export_text)

            bad = self.client.post(
                "/api/settings/backup/restore",
                json={"confirmation": "wrong", **bundle},
            )
            self.assertEqual(bad.status_code, 400)
            self.assertEqual(bad.get_json()["error"], "Invalid restore confirmation")

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
            ai_settings.save_config({"text_model": "other-model"})  # keep api_key
            quote_settings.save_config({"broker_reference_total_usd": 1})

            ok = self.client.post(
                "/api/settings/backup/restore",
                json={"confirmation": "RESTAURAR", **bundle},
            )
            self.assertEqual(ok.status_code, 200)
            data = ok.get_json()
            self.assertTrue(data.get("restored"))
            self.assertEqual(len(data["accounts"]), 1)
            self.assertEqual(data["accounts"][0]["name"], "Efectivo")

            stored_ai = json.loads(ai_path.read_text(encoding="utf-8"))
            self.assertEqual(stored_ai["api_key"], "SECRET_AI_KEY")
            self.assertEqual(stored_ai["text_model"], "gemini-2.0-flash")
            stored_quote = json.loads(quote_path.read_text(encoding="utf-8"))
            self.assertEqual(stored_quote["twelve_data_api_key"], "SECRET_TD")
            self.assertEqual(stored_quote["broker_reference_total_usd"], 1234.5)
        finally:
            ai_settings.SETTINGS_PATH = original_ai
            quote_settings.SETTINGS_PATH = original_quote

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

        after_expense = next(
            a for a in self.client.get("/api/finance").get_json()["accounts"] if a["id"] == acc["id"]
        )
        self.assertEqual(after_expense["current_balance"], 40000.0)

        patch = self.client.patch(
            f"/api/accounts/{acc['id']}",
            json={"name": "Nequi 2"},
        )
        self.assertEqual(patch.status_code, 200)
        updated = patch.get_json()["account"]
        self.assertEqual(updated["name"], "Nequi 2")
        self.assertEqual(updated["current_balance"], 40000.0)

        delete = self.client.delete(f"/api/accounts/{acc['id']}")
        self.assertEqual(delete.status_code, 200)
        stored = json.loads(self.data_path.read_text(encoding="utf-8"))
        self.assertEqual(stored["accounts"], [])
        self.assertIsNone(stored["expenses"][0]["account_id"])

    def test_expense_update_and_delete_adjusts_balance(self):
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
                "description": "Cafe",
            },
        ).get_json()["expense"]

        def balance():
            return next(
                a for a in self.client.get("/api/finance").get_json()["accounts"] if a["id"] == acc["id"]
            )["current_balance"]

        self.assertEqual(balance(), 40000.0)

        patch = self.client.patch(
            f"/api/expenses/{exp['id']}",
            json={"description": "Cafe editado", "amount": 6000},
        )
        self.assertEqual(patch.status_code, 200)
        self.assertEqual(patch.get_json()["expense"]["description"], "Cafe editado")
        self.assertEqual(balance(), 44000.0)

        delete = self.client.delete(f"/api/expenses/{exp['id']}")
        self.assertEqual(delete.status_code, 200)
        self.assertEqual(delete.get_json()["summary"]["total_movements"], 0)
        self.assertEqual(balance(), 50000.0)

    def test_income_update_and_delete_adjusts_balance(self):
        acc = self.client.post(
            "/api/accounts",
            json={"name": "Bancolombia", "type": "bank", "currency": "COP", "initial_balance": 100000},
        ).get_json()["account"]

        inc = self.client.post(
            "/api/incomes",
            json={
                "account_id": acc["id"],
                "amount": 50000,
                "currency": "COP",
                "description": "Salario",
                "category": "Salario",
            },
        ).get_json()["income"]

        def balance():
            return next(
                a for a in self.client.get("/api/finance").get_json()["accounts"] if a["id"] == acc["id"]
            )["current_balance"]

        self.assertEqual(balance(), 150000.0)

        patch = self.client.patch(
            f"/api/incomes/{inc['id']}",
            json={"description": "Salario editado", "amount": 40000, "income_source": "Empresa"},
        )
        self.assertEqual(patch.status_code, 200)
        updated = patch.get_json()["income"]
        self.assertEqual(updated["description"], "Salario editado")
        self.assertEqual(updated["income_source"], "Empresa")
        self.assertEqual(balance(), 140000.0)

        delete = self.client.delete(f"/api/incomes/{inc['id']}")
        self.assertEqual(delete.status_code, 200)
        self.assertEqual(balance(), 100000.0)

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

    def test_frontend_catch_all_does_not_swallow_unknown_api(self):
        # El catch-all que sirve el frontend no debe devolver index.html para /api/*.
        res = self.client.get("/api/ruta-que-no-existe")
        self.assertEqual(res.status_code, 404)

    def test_root_serves_without_crashing(self):
        # Con o sin build del frontend, la raíz responde 200 (no 500).
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)

    def test_investments_template_csv_has_header_and_examples(self):
        res = self.client.get("/api/investments/template.csv")
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/csv", res.content_type)
        text = res.data.decode("utf-8-sig")
        lines = text.strip().splitlines()
        self.assertEqual(
            lines[0],
            "Tipo de Operación,Fecha,Activo,Cantidad,Monto USD,Monto COP,Precio Unitario,Costo de Cierre,Ganancia/Pérdida USD,Total",
        )
        self.assertGreaterEqual(len(lines), 5)
        self.assertIn("Depósito", text)
        self.assertIn("Compra", text)
        self.assertIn("Venta", text)
        self.assertIn("Dividendo", text)

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
        from unittest.mock import MagicMock, patch

        fake = MagicMock()
        fake.health.return_value = {
            "ok": True,
            "vision_model": "llava",
            "vision_model_found": False,
        }
        with patch("services.vision_service.ai_settings.effective_provider", return_value="local"), patch(
            "services.vision_service.registry.get_active_integration",
            return_value=fake,
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

        with patch(
            "services.portfolio_service.quote_service.get_quote_snapshots",
            return_value=({}, []),
        ):
            res = self.client.get("/api/investments/portfolio")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["positions"], [])
        self.assertIsNone(data["strongest_asset"])
        self.assertEqual(data["total_pnl_usd"], 0)
        self.assertEqual(data["total_assets_value_usd"], 0)
        self.assertEqual(data["cash_available_usd"], 0)
        self.assertEqual(data["total_portfolio_value_usd"], 0)
        self.assertIsNone(data["cash_warning"])
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
            "services.portfolio_service.quote_service.get_quote_snapshots",
            return_value=_mock_quote_snapshots(mock_quotes),
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
        self.assertAlmostEqual(data["total_realized_pnl_usd"], 37.5)
        self.assertAlmostEqual(data["total_pnl_usd"], 150.0)
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
            "services.portfolio_service.quote_service.get_quote_snapshots",
            return_value=_mock_quote_snapshots({"NU": 12.0}),
        ):
            res = self.client.get("/api/investments/portfolio")
        data = res.get_json()
        self.assertEqual(len(data["positions"]), 1)
        self.assertAlmostEqual(data["total_realized_pnl_usd"], 0.0)
        self.assertAlmostEqual(data["total_dividends_usd"], 5.0)
        self.assertAlmostEqual(data["positions"][0]["market_value_usd"], 120.0)
        self.assertAlmostEqual(data["cash_available_usd"], 905.0)
        self.assertAlmostEqual(data["total_portfolio_value_usd"], 1025.0)

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
            "services.portfolio_service.quote_service.get_quote_snapshots",
            return_value=_mock_quote_snapshots({"VOO": 500.0, "NU": 8.0}),
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
        fallback_snap = {
            "XYZ": quote_service.QuoteSnapshot(
                symbol="XYZ",
                price=100.0,
                currency="USD",
                timestamp=None,
                provider="last_imported_unit_price",
                confidence="fallback",
                asset_type="stock",
            )
        }
        with patch(
            "services.portfolio_service.quote_service.get_quote_snapshots",
            return_value=(fallback_snap, []),
        ):
            data = self.client.get("/api/investments/portfolio").get_json()
        strongest = data["strongest_asset"]
        self.assertEqual(strongest["asset"], "XYZ")
        self.assertFalse(strongest["quote_missing"])
        self.assertAlmostEqual(strongest["cost_basis_usd"], 200.0)
        self.assertTrue(data["quotes_partial"])
        self.assertAlmostEqual(data["positions"][0]["market_price_usd"], 100.0)
        self.assertEqual(data["positions"][0]["price_source"], "last_imported_unit_price")
        self.assertEqual(data["positions"][0]["price_source_label"], "Último precio importado")
        self.assertAlmostEqual(data["total_assets_value_usd"], 200.0)

    def test_portfolio_deposit_with_usd_asset_stays_in_cash(self):
        from unittest.mock import patch

        finance_store.bulk_add_investments(
            [
                {
                    "operation_type": "deposit",
                    "date": "2026-06-20",
                    "asset": "USD",
                    "quantity": 200.0,
                    "amount_usd": 200.0,
                    "total": 200.0,
                },
                {
                    "operation_type": "buy",
                    "date": "2026-06-21",
                    "asset": "ACWI",
                    "quantity": 1.0,
                    "amount_usd": 200.0,
                    "total": 200.0,
                    "unit_price": 200.0,
                },
            ]
        )
        with patch(
            "services.portfolio_service.quote_service.get_quote_snapshots",
            return_value=_mock_quote_snapshots({"ACWI": 210.0}),
        ):
            data = self.client.get("/api/investments/portfolio").get_json()

        assets = [row["asset"] for row in data["positions"]]
        self.assertEqual(assets, ["ACWI"])
        self.assertAlmostEqual(data["cash_available_usd"], 0.0)
        self.assertAlmostEqual(data["total_assets_value_usd"], 210.0)
        self.assertAlmostEqual(data["total_portfolio_value_usd"], 210.0)

    def test_portfolio_cash_warning_when_negative(self):
        from unittest.mock import patch

        finance_store.add_investment(
            {
                "operation_type": "buy",
                "date": "2026-06-22",
                "asset": "GLD",
                "quantity": 1.0,
                "amount_usd": 150.0,
                "total": 150.0,
                "unit_price": 150.0,
            }
        )
        with patch(
            "services.portfolio_service.quote_service.get_quote_snapshots",
            return_value=_mock_quote_snapshots({"GLD": 151.0}),
        ):
            data = self.client.get("/api/investments/portfolio").get_json()

        self.assertAlmostEqual(data["cash_available_usd"], -150.0)
        self.assertIsNotNone(data["cash_warning"])
        self.assertIn("efectivo calculado es negativo", data["cash_warning"])
        self.assertIn(data["cash_warning"], data["warnings"])

    def test_portfolio_withdrawal_fields_and_net_contributions(self):
        from unittest.mock import patch

        finance_store.bulk_add_investments(
            [
                {"operation_type": "deposit", "date": "2024-01-01", "total": 1000.0},
                {"operation_type": "withdrawal", "date": "2024-02-01", "total": 150.0},
                {
                    "operation_type": "buy",
                    "date": "2024-01-15",
                    "asset": "VOO",
                    "quantity": 1.0,
                    "amount_usd": 400.0,
                },
            ]
        )
        with patch(
            "services.portfolio_service.quote_service.get_quote_snapshots",
            return_value=_mock_quote_snapshots({"VOO": 450.0}),
        ):
            data = self.client.get("/api/investments/portfolio").get_json()

        self.assertAlmostEqual(data["total_deposits_usd"], 1000.0)
        self.assertAlmostEqual(data["total_withdrawals_usd"], 150.0)
        self.assertAlmostEqual(data["net_contributions_usd"], 850.0)
        self.assertAlmostEqual(data["cash_available_usd"], 450.0)
        self.assertAlmostEqual(data["total_portfolio_value_usd"], 900.0)
        self.assertAlmostEqual(data["global_gain_by_contributions_usd"], 50.0)
        self.assertAlmostEqual(data["total_return_percent"], 5.88, places=2)

    def test_create_withdrawal_via_api(self):
        finance_store.add_investment(
            {"operation_type": "deposit", "date": "2024-01-01", "total": 500.0, "amount": 500.0}
        )
        res = self.client.post(
            "/api/investments",
            json={
                "operation_type": "withdrawal",
                "date": "2024-03-01",
                "amount_usd": 75.0,
                "total": 75.0,
                "amount": 75.0,
                "currency": "USD",
            },
        )
        self.assertEqual(res.status_code, 200)
        inv = res.get_json()["investment"]
        self.assertEqual(inv["operation_type"], "withdrawal")
        self.assertEqual(inv["total"], 75.0)

    def test_portfolio_buy_sell_rebuy_and_deposit_excluded(self):
        from unittest.mock import patch

        finance_store.bulk_add_investments(
            [
                # Efectivo aportado: no debe sumarse al total del portafolio.
                {"operation_type": "deposit", "date": "2024-01-01", "amount_usd": 1000.0, "total": 1000.0},
                # Compra promediada: 2@100 y luego 2@150 -> qty 4, cost 500 (avg 125).
                {"operation_type": "buy", "date": "2024-01-02", "asset": "TEST", "quantity": 2.0, "amount_usd": 200.0},
                {"operation_type": "buy", "date": "2024-01-03", "asset": "TEST", "quantity": 2.0, "amount_usd": 300.0},
                # Venta parcial: 1 unidad, cost_sold 125, realized 160-125=35.
                {"operation_type": "sell", "date": "2024-01-04", "asset": "TEST", "quantity": 1.0, "amount_usd": 160.0},
                # Venta total del resto: 3 unidades, cost_sold 375, realized 480-375=105.
                {"operation_type": "sell", "date": "2024-01-05", "asset": "TEST", "quantity": 3.0, "amount_usd": 480.0},
                # Recompra: el coste arranca limpio (qty 1, cost 200), realized se conserva.
                {"operation_type": "buy", "date": "2024-01-06", "asset": "TEST", "quantity": 1.0, "amount_usd": 200.0},
            ]
        )
        with patch(
            "services.portfolio_service.quote_service.get_quote_snapshots",
            return_value=_mock_quote_snapshots({"TEST": 250.0}),
        ):
            data = self.client.get("/api/investments/portfolio").get_json()

        self.assertEqual(len(data["positions"]), 1)
        pos = data["positions"][0]
        self.assertEqual(pos["asset"], "TEST")
        self.assertAlmostEqual(pos["quantity"], 1.0)
        self.assertAlmostEqual(pos["cost_basis_usd"], 200.0)
        self.assertAlmostEqual(pos["market_value_usd"], 250.0)
        self.assertAlmostEqual(pos["unrealized_pnl_usd"], 50.0)
        self.assertAlmostEqual(data["total_realized_pnl_usd"], 140.0)
        self.assertAlmostEqual(data["total_unrealized_pnl_usd"], 50.0)
        self.assertAlmostEqual(data["total_pnl_usd"], 190.0)
        # El depósito de 1000 NO entra: el total es solo el valor del activo.
        self.assertAlmostEqual(data["total_market_value_usd"], 250.0)
        self.assertAlmostEqual(data["total_assets_value_usd"], 250.0)
        self.assertAlmostEqual(data["cash_available_usd"], 940.0)
        self.assertAlmostEqual(data["total_portfolio_value_usd"], 1190.0)


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
                return {"ok": True, "vision_model_found": True}

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
                return {"ok": True, "vision_model_found": True}

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


class QuoteSettingsApiTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.settings_path = Path(self.tmp.name) / "quote_settings.json"
        self.original_path = quote_settings.SETTINGS_PATH
        quote_settings.SETTINGS_PATH = self.settings_path
        self.client = app.test_client()
        self.env_patch = patch.dict(
            "os.environ",
            {"TWELVE_DATA_API_KEY": "", "ALPHA_VANTAGE_API_KEY": ""},
            clear=False,
        )
        self.env_patch.start()

    def tearDown(self):
        quote_settings.SETTINGS_PATH = self.original_path
        self.env_patch.stop()
        self.tmp.cleanup()

    def test_get_quote_settings_no_keys_exposed(self):
        res = self.client.get("/api/settings/quotes")
        self.assertEqual(res.status_code, 200)
        cfg = res.get_json()["config"]
        self.assertFalse(cfg["has_twelve_data_key"])
        self.assertNotIn("twelve_data_api_key", cfg)

    def test_save_quote_settings_masks_keys(self):
        res = self.client.post(
            "/api/settings/quotes",
            json={
                "twelve_data_api_key": "secret-twelve-key",
                "broker_reference_total_usd": 10000,
            },
        )
        self.assertEqual(res.status_code, 200)
        cfg = res.get_json()["config"]
        self.assertTrue(cfg["has_twelve_data_key"])
        self.assertIn("****", cfg["masked_twelve_data_key"])
        self.assertNotIn("secret", cfg["masked_twelve_data_key"])
        self.assertEqual(cfg["broker_reference_total_usd"], 10000)

    def test_test_quote_settings_mocked(self):
        with patch(
            "services.quote_service.test_provider_connection",
            return_value={"ok": True, "provider": "yfinance", "symbol": "AAPL", "price": 100.0},
        ):
            res = self.client.post("/api/settings/quotes/test", json={})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()["ok"])


class AssistantProfileTestCase(unittest.TestCase):
    """Fase 1: perfil financiero + metas en JSON local."""

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

    def test_profile_migrates_and_patches(self):
        res = self.client.get("/api/assistant/profile")
        self.assertEqual(res.status_code, 200)
        profile = res.get_json()["profile"]
        self.assertFalse(profile["onboarding_completed"])
        self.assertEqual(profile["fiscal_country"], "CO")

        res = self.client.patch(
            "/api/assistant/profile",
            json={
                "monthly_income_fixed": 5000000,
                "savings_target_percent": 20,
                "investment_target_percent": 10,
                "cushion_percent": 10,
                "risk_profile": "moderate",
                "onboarding_completed": True,
            },
        )
        self.assertEqual(res.status_code, 200)
        profile = res.get_json()["profile"]
        self.assertEqual(profile["monthly_income_fixed"], 5000000.0)
        self.assertEqual(profile["savings_target_percent"], 20.0)
        self.assertEqual(profile["cushion_percent"], 10.0)
        self.assertTrue(profile["onboarding_completed"])
        self.assertIsNotNone(profile["last_reviewed_at"])

        finance = self.client.get("/api/finance").get_json()
        self.assertTrue(finance["financial_profile"]["onboarding_completed"])

    def test_goals_crud(self):
        res = self.client.post(
            "/api/assistant/goals",
            json={"title": "Fondo emergencia", "type": "emergency_fund", "target_amount": 12000000},
        )
        self.assertEqual(res.status_code, 201)
        goal = res.get_json()["goal"]
        self.assertTrue(goal["id"].startswith("goal_"))
        self.assertEqual(goal["title"], "Fondo emergencia")

        res2 = self.client.post(
            "/api/assistant/goals",
            json={"title": "Viaje", "type": "savings", "target_amount": 3000000},
        )
        self.assertEqual(res2.status_code, 201)
        self.assertEqual(len(res2.get_json()["goals"]), 2)

        gid = goal["id"]
        res = self.client.patch(f"/api/assistant/goals/{gid}", json={"status": "paused"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["goal"]["status"], "paused")

        res = self.client.delete(f"/api/assistant/goals/{gid}")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.get_json()["goals"]), 1)

    def test_goal_requires_title(self):
        res = self.client.post("/api/assistant/goals", json={"type": "savings"})
        self.assertEqual(res.status_code, 400)

    def test_assistant_context_pack(self):
        self.client.patch(
            "/api/assistant/profile",
            json={
                "monthly_income_fixed": 5000000,
                "savings_target_percent": 20,
                "cushion_percent": 10,
                "emergency_fund_target_months": 6,
                "onboarding_completed": True,
            },
        )
        self.client.post(
            "/api/accounts",
            json={"name": "Nequi", "type": "wallet", "currency": "COP", "initial_balance": 3000000},
        )
        self.client.post(
            "/api/incomes",
            json={"amount": 5000000, "currency": "COP", "description": "Salario", "category": "Salario"},
        )
        self.client.post(
            "/api/expenses",
            json={"amount": 1000000, "currency": "COP", "description": "Renta", "category": "Vivienda"},
        )

        res = self.client.get("/api/assistant/context")
        self.assertEqual(res.status_code, 200)
        pack = res.get_json()
        self.assertIn("profile", pack)
        self.assertIn("kpis", pack)
        self.assertIn("goals", pack)
        kpis = pack["kpis"]
        self.assertIsNotNone(kpis["savings_actual_percent"])
        self.assertEqual(kpis["cushion_percent"], 10.0)
        portfolio = kpis["portfolio"]
        self.assertEqual(portfolio["basis"], "cost")
        self.assertIn("position_count", portfolio)
        self.assertIn("cash_available_usd", portfolio)
        self.assertIn("top_asset", portfolio)
        self.assertIn("top_weight_percent", portfolio)

        finance = self.client.get("/api/finance").get_json()
        self.assertIsNotNone(finance.get("assistant_kpis"))
        self.assertEqual(finance["assistant_kpis"]["cushion_percent"], 10.0)

    def test_assistant_chat_persists_turn(self):
        class _Fake:
            def complete_json(self, prompt):
                return json.dumps(
                    {
                        "reply": "Vas bien: tu ahorro del mes está encima de la meta.",
                        "follow_ups": ["¿Y mi emergencia?"],
                        "memory_updates": [],
                        "memory_summary": None,
                    }
                )

        with patch("integrations.registry.get_active_integration", return_value=_Fake()):
            res = self.client.post(
                "/api/assistant/chat",
                json={"message": "¿Cómo voy de ahorro?"},
            )
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertTrue(body["ai_available"])
        self.assertIn("ahorro", body["assistant_message"]["content"].lower())
        self.assertEqual(body["follow_ups"], ["¿Y mi emergencia?"])

        tid = body["thread"]["id"]
        hist = self.client.get(f"/api/assistant/threads/{tid}/messages").get_json()
        self.assertGreaterEqual(len(hist["messages"]), 2)
        roles = [m["role"] for m in hist["messages"]]
        self.assertIn("user", roles)
        self.assertIn("assistant", roles)

    def test_chat_profile_suggestion_requires_confirm(self):
        self.client.patch(
            "/api/assistant/profile",
            json={"monthly_income_fixed": 5000000, "onboarding_completed": True},
        )

        class _Fake:
            def complete_json(self, prompt):
                return json.dumps(
                    {
                        "reply": "Anoto: ahorro 30% y tus fijos. Confirma en la app para guardar.",
                        "off_topic": False,
                        "follow_ups": [],
                        "memory_updates": [
                            {"fact": "Quiere ahorrar 30%", "category": "goal"}
                        ],
                        "memory_summary": None,
                        "profile_patch": {
                            "savings_target_percent": 30,
                            "fixed_expenses": [
                                {"label": "Arriendo", "amount": 1500000},
                                {"label": "Internet", "amount": 80000},
                            ],
                            "monthly_income_fixed": None,
                            "risk_profile": None,
                        },
                    }
                )

        with patch("integrations.registry.get_active_integration", return_value=_Fake()):
            res = self.client.post(
                "/api/assistant/chat",
                json={"message": "Quiero ahorrar 30%. Fijos: arriendo 1.5M e internet 80 mil"},
            )
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        suggestion = body["profile_suggestion"]
        self.assertEqual(suggestion["savings_target_percent"], 30.0)
        self.assertEqual(suggestion["monthly_fixed_expenses"], 1580000.0)
        self.assertNotIn("monthly_income_fixed", suggestion)
        self.assertNotIn("risk_profile", suggestion)

        # Sin confirmar, el perfil aún no cambia
        profile = self.client.get("/api/assistant/profile").get_json()["profile"]
        self.assertIsNone(profile.get("savings_target_percent"))

        res = self.client.post(
            "/api/assistant/apply-profile",
            json={"suggestion": suggestion},
        )
        self.assertEqual(res.status_code, 200)
        applied = res.get_json()["profile"]
        self.assertEqual(applied["savings_target_percent"], 30.0)
        self.assertEqual(applied["monthly_fixed_expenses"], 1580000.0)
        self.assertEqual(len(applied["fixed_expenses"]), 2)

    def test_apply_profile_rejects_empty(self):
        res = self.client.post("/api/assistant/apply-profile", json={"suggestion": {}})
        self.assertEqual(res.status_code, 400)

    def test_sanitize_profile_patch_drops_nulls(self):
        clean = finance_store.sanitize_profile_patch(
            {
                "savings_target_percent": 25,
                "monthly_income_fixed": None,
                "fixed_expenses": [{"label": "Arriendo", "amount": 1000}],
            }
        )
        self.assertEqual(clean["savings_target_percent"], 25.0)
        self.assertNotIn("monthly_income_fixed", clean)
        self.assertEqual(clean["monthly_fixed_expenses"], 1000.0)

    def test_summarize_compacts_old_messages(self):
        thread = finance_store.get_or_create_main_thread()
        tid = thread["id"]
        for i in range(12):
            role = "user" if i % 2 == 0 else "assistant"
            finance_store.append_chat_message(tid, role, f"mensaje financiero {i}")

        class _Fake:
            def complete_json(self, prompt):
                assert "Mensajes a condensar" in prompt
                return json.dumps(
                    {
                        "summary": "Quiere ahorrar 30% y controla fijos de arriendo.",
                        "memory_updates": [
                            {"fact": "Meta de ahorro 30%", "category": "goal"}
                        ],
                        "reply": "Compacté el historial viejo; seguimos con lo reciente.",
                    }
                )

        fake = _Fake()
        with patch("integrations.registry.get_active_integration", return_value=fake):
            res = self.client.post(
                "/api/assistant/chat",
                json={"message": "/sumarize", "thread_id": tid},
            )
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertTrue(body["summarized"])
        self.assertGreater(body["compacted_count"], 0)
        self.assertIn("30%", body["memory_summary"])

        visible = finance_store.list_chat_messages(tid, limit=None)
        # Cola reciente + /sumarize + reply del asistente
        self.assertLessEqual(len(visible), 10)
        compacted = finance_store.list_chat_messages(tid, limit=None, include_compacted=True)
        self.assertGreater(len(compacted), len(visible))

    def test_summarize_alias_too_short(self):
        thread = finance_store.get_or_create_main_thread()
        finance_store.append_chat_message(thread["id"], "user", "hola corta")

        class _Fake:
            def complete_json(self, prompt):
                raise AssertionError("no debe llamar LLM si hay poco historial")

        with patch("integrations.registry.get_active_integration", return_value=_Fake()):
            res = self.client.post(
                "/api/assistant/chat",
                json={"message": "/summarize", "thread_id": thread["id"]},
            )
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertFalse(body["summarized"])
        self.assertEqual(body["compacted_count"], 0)

    def test_chat_movement_draft_confirm_saves_expense(self):
        self.client.post(
            "/api/accounts",
            json={"name": "Nequi", "type": "wallet", "currency": "COP", "initial_balance": 200000},
        )

        class _Fake:
            def complete_json(self, prompt):
                assert "movement_draft" in prompt
                return json.dumps(
                    {
                        "reply": "Anoto un Uber de 25 mil. Confirma para guardarlo.",
                        "off_topic": False,
                        "follow_ups": [],
                        "memory_updates": [],
                        "memory_summary": None,
                        "profile_patch": {},
                        "movement_draft": {
                            "needs_clarification": None,
                            "expenses": [
                                {
                                    "amount": 25000,
                                    "currency": "COP",
                                    "category": "Transporte",
                                    "category_emoji": "🚌",
                                    "description": "Uber",
                                    "payment_method": "",
                                    "account_name_hint": "Nequi",
                                    "suggested_new_category": None,
                                }
                            ],
                            "incomes": [],
                            "investments": [],
                            "notes": [],
                        },
                    }
                )

        with patch("integrations.registry.get_active_integration", return_value=_Fake()):
            res = self.client.post(
                "/api/assistant/chat",
                json={"message": "Gasté 25 mil en Uber por Nequi"},
            )
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        draft = body["movement_draft"]
        self.assertIsNotNone(draft)
        self.assertEqual(draft["counts"]["expenses"], 1)
        self.assertEqual(draft["items"][0]["amount"], 25000)
        self.assertIsNotNone(draft["items"][0]["account_id"])

        # Sin confirmar, aún no hay gasto
        finance = self.client.get("/api/finance").get_json()
        before = len(finance.get("expenses") or [])

        confirm = self.client.post(
            "/api/confirm-analysis",
            json={"items": draft["items"]},
        )
        self.assertEqual(confirm.status_code, 200)
        saved = confirm.get_json()["saved"]
        self.assertEqual(saved["expenses"], 1)

        finance = self.client.get("/api/finance").get_json()
        self.assertEqual(len(finance.get("expenses") or []), before + 1)

    def test_chat_asks_clarification_without_draft_items(self):
        class _Fake:
            def complete_json(self, prompt):
                return json.dumps(
                    {
                        "reply": "¿Cuánto fue el gasto?",
                        "off_topic": False,
                        "follow_ups": ["Fueron 40 mil"],
                        "memory_updates": [],
                        "profile_patch": {},
                        "movement_draft": {
                            "needs_clarification": "falta el monto",
                            "expenses": [],
                            "incomes": [],
                            "investments": [],
                            "notes": [],
                        },
                    }
                )

        with patch("integrations.registry.get_active_integration", return_value=_Fake()):
            res = self.client.post(
                "/api/assistant/chat",
                json={"message": "Pagué un Uber"},
            )
        body = res.get_json()
        draft = body["movement_draft"]
        self.assertIsNotNone(draft)
        self.assertEqual(draft["needs_clarification"], "falta el monto")
        self.assertEqual(draft["counts"]["total"], 0)

    def test_chat_multi_movement_draft(self):
        class _Fake:
            def complete_json(self, prompt):
                return json.dumps(
                    {
                        "reply": "Anoto 3 gastos. Confirma para guardarlos.",
                        "off_topic": False,
                        "follow_ups": [],
                        "profile_patch": {},
                        "movement_draft": {
                            "needs_clarification": None,
                            "expenses": [
                                {
                                    "amount": 12000,
                                    "currency": "COP",
                                    "category": "Café",
                                    "description": "Café",
                                    "account_name_hint": "",
                                },
                                {
                                    "amount": 45000,
                                    "currency": "COP",
                                    "category": "Comida",
                                    "description": "Almuerzo",
                                    "account_name_hint": "",
                                },
                                {
                                    "amount": 18000,
                                    "currency": "COP",
                                    "category": "Transporte",
                                    "description": "Uber",
                                    "account_name_hint": "",
                                },
                            ],
                            "incomes": [],
                            "investments": [],
                            "notes": [],
                        },
                    }
                )

        with patch("integrations.registry.get_active_integration", return_value=_Fake()):
            res = self.client.post(
                "/api/assistant/chat",
                json={"message": "café 12 mil, almuerzo 45 mil y Uber 18 mil"},
            )
        body = res.get_json()
        self.assertEqual(body["movement_draft"]["counts"]["expenses"], 3)
        self.assertEqual(len(body["movement_draft"]["items"]), 3)

    def test_buscar_command_and_lookup_intent(self):
        self.client.post(
            "/api/expenses",
            json={
                "amount": 25000,
                "currency": "COP",
                "description": "Uber aeropuerto",
                "category": "Transporte",
            },
        )
        res = self.client.post(
            "/api/assistant/chat",
            json={"message": "/buscar Uber"},
        )
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertGreaterEqual(body["lookup"]["count"], 1)
        self.assertIn("Uber", body["assistant_message"]["content"])

        class _Fake:
            def complete_json(self, prompt):
                return json.dumps(
                    {
                        "reply": "Revisé tus movimientos.",
                        "off_topic": False,
                        "follow_ups": [],
                        "profile_patch": {},
                        "movement_draft": {},
                        "lookup": {"q": "Uber", "kind": "expense", "period": "month"},
                    }
                )

        with patch("integrations.registry.get_active_integration", return_value=_Fake()):
            res = self.client.post(
                "/api/assistant/chat",
                json={"message": "¿Cuánto gasté en Uber este mes?"},
            )
        body = res.get_json()
        self.assertGreaterEqual(body["lookup"]["count"], 1)
        self.assertIn("25000", body["assistant_message"]["content"])

    def test_chat_account_draft_apply(self):
        class _Fake:
            def complete_json(self, prompt):
                return json.dumps(
                    {
                        "reply": "Puedo crear Nequi como billetera. Confirma.",
                        "off_topic": False,
                        "follow_ups": [],
                        "profile_patch": {},
                        "movement_draft": {},
                        "account_draft": {
                            "name": "Nequi Chat",
                            "type": "billetera",
                            "currency": "COP",
                            "initial_balance": 0,
                            "emoji": "💜",
                        },
                    }
                )

        with patch("integrations.registry.get_active_integration", return_value=_Fake()):
            res = self.client.post(
                "/api/assistant/chat",
                json={"message": "Crea una cuenta Nequi Chat"},
            )
        body = res.get_json()
        draft = body["account_draft"]
        self.assertEqual(draft["name"], "Nequi Chat")
        self.assertEqual(draft["type"], "wallet")

        applied = self.client.post(
            "/api/assistant/apply-account",
            json={"suggestion": draft},
        )
        self.assertEqual(applied.status_code, 200)
        accounts = applied.get_json()["accounts"]
        self.assertTrue(any(a["name"] == "Nequi Chat" for a in accounts))

    def test_finance_query_resolver_portfolio_metrics(self):
        from services import assistant_service

        finance_store.bulk_add_investments(
            [
                {
                    "operation_type": "deposit",
                    "date": "2024-01-01",
                    "asset": "USD",
                    "amount_usd": 5000.0,
                },
                {
                    "operation_type": "buy",
                    "date": "2024-01-02",
                    "asset": "VOO",
                    "quantity": 2.0,
                    "amount_usd": 800.0,
                },
                {
                    "operation_type": "buy",
                    "date": "2024-01-03",
                    "asset": "AAPL",
                    "quantity": 10.0,
                    "amount_usd": 1500.0,
                },
            ]
        )
        # VOO: 2 * 500 = 1000 MV, cost 800 → pnl 200, return 25%
        # AAPL: 10 * 200 = 2000 MV, cost 1500 → pnl 500, return ~33.3%
        mock_quotes = {"VOO": 500.0, "AAPL": 200.0}
        with patch(
            "services.portfolio_service.quote_service.get_quote_snapshots",
            return_value=_mock_quote_snapshots(mock_quotes),
        ):
            largest = assistant_service.resolve_finance_query(
                "portfolio", "largest_position"
            )
            gain = assistant_service.resolve_finance_query("portfolio", "highest_gain")
            ret = assistant_service.resolve_finance_query("portfolio", "highest_return")
            detail = assistant_service.resolve_finance_query(
                "portfolio", "asset_detail", "VOO"
            )
            summary = assistant_service.resolve_finance_query("portfolio", "summary")
            missing = assistant_service.resolve_finance_query(
                "portfolio", "asset_detail", "XYZ"
            )

        self.assertEqual(largest["position"]["asset"], "AAPL")
        self.assertAlmostEqual(largest["position"]["market_value_usd"], 2000.0)
        self.assertEqual(gain["position"]["asset"], "AAPL")
        self.assertEqual(ret["position"]["asset"], "AAPL")
        self.assertTrue(detail["found"])
        self.assertEqual(detail["position"]["asset"], "VOO")
        self.assertAlmostEqual(detail["position"]["market_value_usd"], 1000.0)
        self.assertFalse(missing["found"])
        self.assertEqual(summary["position_count"], 2)
        self.assertAlmostEqual(summary["total_assets_value_usd"], 3000.0)

        factual = assistant_service.format_finance_query_reply(largest)
        self.assertIn("AAPL", factual)
        self.assertIn("2000", factual)

    def test_chat_finance_query_appends_factual(self):
        finance_store.bulk_add_investments(
            [
                {
                    "operation_type": "deposit",
                    "date": "2024-01-01",
                    "asset": "USD",
                    "amount_usd": 2000.0,
                },
                {
                    "operation_type": "buy",
                    "date": "2024-01-02",
                    "asset": "VOO",
                    "quantity": 2.0,
                    "amount_usd": 800.0,
                },
            ]
        )

        class _Fake:
            def complete_json(self, prompt):
                return json.dumps(
                    {
                        "reply": "Revisé tu portafolio.",
                        "off_topic": False,
                        "follow_ups": [],
                        "profile_patch": {},
                        "movement_draft": {},
                        "finance_query": {
                            "domain": "portfolio",
                            "metric": "largest_position",
                            "asset": None,
                        },
                    }
                )

        with (
            patch("integrations.registry.get_active_integration", return_value=_Fake()),
            patch(
                "services.portfolio_service.quote_service.get_quote_snapshots",
                return_value=_mock_quote_snapshots({"VOO": 500.0}),
            ),
        ):
            res = self.client.post(
                "/api/assistant/chat",
                json={"message": "¿Cuál es mi activo más grande?"},
            )
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertIsNotNone(body.get("finance_query"))
        self.assertEqual(body["finance_query"]["metric"], "largest_position")
        self.assertEqual(body["finance_query"]["position"]["asset"], "VOO")
        content = body["assistant_message"]["content"]
        self.assertIn("Revisé tu portafolio", content)
        self.assertIn("VOO", content)
        self.assertIn("1000", content)

    def test_assistant_debug_payload_when_enabled(self):
        class _Fake:
            def complete_json(self, prompt):
                return json.dumps(
                    {
                        "reply": "Mirando ACWI.",
                        "off_topic": False,
                        "follow_ups": [],
                        "profile_patch": {},
                        "movement_draft": {},
                        "finance_query": {},
                    }
                )

        with (
            patch("services.assistant_service.config.ASSISTANT_DEBUG", True),
            patch("integrations.registry.get_active_integration", return_value=_Fake()),
        ):
            res = self.client.post(
                "/api/assistant/chat",
                json={"message": "¿Qué tal mi activo ACWI?"},
            )
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertIn("debug", body)
        self.assertTrue(body["debug"]["enabled"])
        self.assertEqual(body["debug"]["message"], "¿Qué tal mi activo ACWI?")
        self.assertIn("llm", body["debug"])
        self.assertIsNone(body.get("finance_query"))

    def test_context_pack_portfolio_kpi_with_positions(self):
        finance_store.bulk_add_investments(
            [
                {
                    "operation_type": "deposit",
                    "date": "2024-01-01",
                    "asset": "USD",
                    "amount_usd": 1000.0,
                },
                {
                    "operation_type": "buy",
                    "date": "2024-01-02",
                    "asset": "VOO",
                    "quantity": 1.0,
                    "amount_usd": 400.0,
                },
            ]
        )
        res = self.client.get("/api/assistant/context")
        self.assertEqual(res.status_code, 200)
        portfolio = res.get_json()["kpis"]["portfolio"]
        self.assertEqual(portfolio["basis"], "cost")
        self.assertEqual(portfolio["position_count"], 1)
        self.assertEqual(portfolio["top_asset"], "VOO")
        self.assertAlmostEqual(portfolio["cash_available_usd"], 600.0)


if __name__ == "__main__":
    unittest.main()
