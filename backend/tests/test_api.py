import io
import json
import tempfile
import unittest
from pathlib import Path

from app import app
from services import finance_store, vision_service


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

    def test_legacy_categories_migration(self):
        legacy = {
            "settings": {
                "currency": "COP",
                "categories": [{"name": "Legacy Cat", "emoji": "📦"}],
            },
            "accounts": [],
            "expenses": [],
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


if __name__ == "__main__":
    unittest.main()
