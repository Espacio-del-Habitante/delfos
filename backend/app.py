from flask import Flask, abort, jsonify, request, send_file, send_from_directory
from flask_cors import CORS
import io

import config
from integrations import registry, settings as ai_settings
from integrations.base import IntegrationError
from services import (
    ai_service,
    bulk_import,
    finance_store,
    investment_ledger,
    portfolio_service,
    quote_service,
    quote_settings,
    vision_service,
)

app = Flask(__name__)
CORS(app, origins=["http://localhost:4321"])


def finance_response(extra=None):
    payload = finance_store.get_finance_payload()
    if extra:
        payload.update(extra)
    return jsonify(payload)


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    """Sirve el frontend compilado (frontend/dist). Las rutas /api/* las atienden
    las vistas específicas, que tienen prioridad sobre este catch-all."""
    if path == "api" or path.startswith("api/"):
        abort(404)

    index_html = config.FRONTEND_DIR / "index.html"
    if not index_html.is_file():
        # Sin build (dev con Astro en :4321): no hay nada que servir aquí.
        return jsonify({"service": "delfos-api", "docs": "Frontend dev en http://localhost:4321"})

    requested = config.FRONTEND_DIR / path
    if path and requested.is_file():
        return send_from_directory(config.FRONTEND_DIR, path)

    # Páginas multipágina de Astro (p.ej. /inversiones -> inversiones/index.html).
    nested = config.FRONTEND_DIR / path / "index.html"
    if path and nested.is_file():
        return send_from_directory(config.FRONTEND_DIR / path, "index.html")

    return send_from_directory(config.FRONTEND_DIR, "index.html")


@app.route("/api/finance")
def api_finance():
    return finance_response()


@app.route("/api/charts")
def api_charts():
    return jsonify(finance_store.get_chart_data())


@app.route("/api/accounts", methods=["POST"])
def create_account():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    if not name:
        return jsonify({"error": "El nombre es obligatorio"}), 400

    account = finance_store.add_account(
        {
            "name": name,
            "type": body.get("type", "other"),
            "currency": body.get("currency", "COP"),
            "initial_balance": body.get("initial_balance", 0),
            "emoji": body.get("emoji", "💰"),
        }
    )
    return finance_response({"account": account})


@app.route("/api/accounts/<account_id>", methods=["PATCH"])
def patch_account(account_id):
    body = request.get_json(silent=True) or {}
    account = finance_store.update_account(account_id, body)
    if not account:
        return jsonify({"error": "Account not found"}), 404
    return finance_response({"account": account})


@app.route("/api/accounts/<account_id>", methods=["DELETE"])
def delete_account_route(account_id):
    if not finance_store.delete_account(account_id):
        return jsonify({"error": "Account not found"}), 404
    return finance_response()


@app.route("/api/expenses/<expense_id>", methods=["PATCH"])
def patch_expense(expense_id):
    body = request.get_json(silent=True) or {}
    expense = finance_store.update_expense(expense_id, body)
    if not expense:
        return jsonify({"error": "Expense not found"}), 404
    return finance_response({"expense": expense})


@app.route("/api/expenses/<expense_id>", methods=["DELETE"])
def delete_expense_route(expense_id):
    if not finance_store.delete_expense(expense_id):
        return jsonify({"error": "Expense not found"}), 404
    return finance_response()


@app.route("/api/incomes/<income_id>", methods=["PATCH"])
def patch_income(income_id):
    body = request.get_json(silent=True) or {}
    income = finance_store.update_income(income_id, body)
    if not income:
        return jsonify({"error": "Income not found"}), 404
    return finance_response({"income": income})


@app.route("/api/incomes/<income_id>", methods=["DELETE"])
def delete_income_route(income_id):
    if not finance_store.delete_income(income_id):
        return jsonify({"error": "Income not found"}), 404
    return finance_response()


@app.route("/api/investments/<investment_id>", methods=["PATCH"])
def patch_investment(investment_id):
    body = request.get_json(silent=True) or {}
    investment = finance_store.update_investment(investment_id, body)
    if not investment:
        return jsonify({"error": "Investment not found"}), 404
    return finance_response({"investment": investment})


@app.route("/api/investments/<investment_id>", methods=["DELETE"])
def delete_investment_route(investment_id):
    if not finance_store.delete_investment(investment_id):
        return jsonify({"error": "Investment not found"}), 404
    return finance_response()


@app.route("/api/notes/<note_id>", methods=["PATCH"])
def patch_note(note_id):
    body = request.get_json(silent=True) or {}
    note = finance_store.update_note(note_id, body)
    if not note:
        return jsonify({"error": "Note not found"}), 404
    return finance_response({"note": note})


@app.route("/api/notes/<note_id>", methods=["DELETE"])
def delete_note_route(note_id):
    if not finance_store.delete_note(note_id):
        return jsonify({"error": "Note not found"}), 404
    return finance_response()


@app.route("/api/categories", methods=["GET"])
def list_categories():
    kind = request.args.get("kind")
    return jsonify({"categories": finance_store.get_categories(kind)})


@app.route("/api/categories", methods=["POST"])
def create_category():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    if not name:
        return jsonify({"error": "El nombre es obligatorio"}), 400
    category = finance_store.add_category(
        name,
        body.get("emoji", ""),
        kind=body.get("kind", "general"),
    )
    if not category:
        return jsonify({"error": "No se pudo crear la categoría"}), 400
    return finance_response({"category": category})


@app.route("/api/categories/<category_id>", methods=["PATCH"])
def patch_category(category_id):
    body = request.get_json(silent=True) or {}
    category = finance_store.update_category(category_id, body)
    if not category:
        return jsonify({"error": "Category not found"}), 404
    return finance_response({"category": category})


@app.route("/api/categories/<category_id>", methods=["DELETE"])
def delete_category_route(category_id):
    if not finance_store.delete_category(category_id):
        return jsonify({"error": "Category not found"}), 404
    return finance_response()


@app.route("/api/settings/reset", methods=["POST"])
def reset_settings():
    body = request.get_json(silent=True) or {}
    if body.get("confirmation") != "RESTABLECER":
        return jsonify({"error": "Invalid reset confirmation"}), 400
    finance_store.reset_finance_data()
    return finance_response({"reset": True})


@app.route("/api/expenses", methods=["POST"])
def create_expense():
    body = request.get_json(silent=True) or {}
    if not body.get("amount"):
        return jsonify({"error": "Monto obligatorio"}), 400
    expense = finance_store.add_expense(body)
    return finance_response({"expense": expense})


@app.route("/api/incomes", methods=["POST"])
def create_income():
    body = request.get_json(silent=True) or {}
    if not body.get("amount"):
        return jsonify({"error": "Monto obligatorio"}), 400
    income = finance_store.add_income(body)
    return finance_response({"income": income})


@app.route("/api/investments", methods=["POST"])
def create_investment():
    body = request.get_json(silent=True) or {}
    if not body.get("amount") and body.get("total") is None:
        return jsonify({"error": "Monto obligatorio"}), 400
    investment = finance_store.add_investment(body)
    return finance_response({"investment": investment})


@app.route("/api/investment-assets", methods=["POST"])
def create_investment_asset():
    body = request.get_json(silent=True) or {}
    symbol = (body.get("symbol") or body.get("asset") or "").strip()
    if not symbol:
        return jsonify({"error": "El símbolo del activo es obligatorio"}), 400
    asset = finance_store.add_investment_asset(symbol, body.get("label"))
    if not asset:
        return jsonify({"error": "No se pudo crear el activo"}), 400
    return finance_response({"investment_asset": asset})


@app.route("/api/investments/portfolio")
def investments_portfolio():
    return jsonify(portfolio_service.get_portfolio_payload())


@app.route("/api/investments/export.csv")
def export_investments_csv():
    content = investment_ledger.export_csv()
    return send_file(
        io.BytesIO(content.encode("utf-8")),
        mimetype="text/csv; charset=utf-8",
        as_attachment=True,
        download_name="inversiones.csv",
    )


@app.route("/api/investments/template.csv")
def download_investments_template_csv():
    content = investment_ledger.export_template_csv()
    return send_file(
        io.BytesIO(content.encode("utf-8")),
        mimetype="text/csv; charset=utf-8",
        as_attachment=True,
        download_name="plantilla-inversiones.csv",
    )


@app.route("/api/investments/export.xlsx")
def export_investments_xlsx():
    content = investment_ledger.export_xlsx()
    return send_file(
        io.BytesIO(content),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name="inversiones.xlsx",
    )


def _parse_csv_import_request():
    confirm = request.args.get("confirm", "").lower() == "true"
    csv_text = None

    if request.is_json:
        body = request.get_json(silent=True) or {}
        csv_text = body.get("csv") or body.get("content")
        confirm = confirm or bool(body.get("confirm"))
    elif request.files.get("file"):
        uploaded = request.files["file"]
        csv_text = uploaded.read().decode("utf-8-sig")
    else:
        csv_text = request.get_data(as_text=True)

    if not csv_text or not csv_text.strip():
        return None, confirm, (jsonify({"error": "CSV vacío"}), 400)
    return csv_text, confirm, None


def _csv_import_response(result, confirm):
    if not confirm:
        return jsonify(result)
    return finance_response(
        {
            "imported": result.get("count", 0),
            "warnings": result.get("warnings", []),
            "created": result.get("created", []),
        }
    )


@app.route("/api/investments/import.csv", methods=["POST"])
def import_investments_csv():
    csv_text, confirm, error = _parse_csv_import_request()
    if error:
        return error
    result = investment_ledger.import_csv(csv_text, confirm=confirm)
    return _csv_import_response(result, confirm)


@app.route("/api/expenses/import.csv", methods=["POST"])
def import_expenses_csv():
    csv_text, confirm, error = _parse_csv_import_request()
    if error:
        return error
    result = bulk_import.import_expenses_csv(csv_text, confirm=confirm)
    return _csv_import_response(result, confirm)


@app.route("/api/incomes/import.csv", methods=["POST"])
def import_incomes_csv():
    csv_text, confirm, error = _parse_csv_import_request()
    if error:
        return error
    result = bulk_import.import_incomes_csv(csv_text, confirm=confirm)
    return _csv_import_response(result, confirm)


@app.route("/api/notes/import.csv", methods=["POST"])
def import_notes_csv():
    csv_text, confirm, error = _parse_csv_import_request()
    if error:
        return error
    result = bulk_import.import_notes_csv(csv_text, confirm=confirm)
    return _csv_import_response(result, confirm)


@app.route("/api/accounts/import.csv", methods=["POST"])
def import_accounts_csv():
    csv_text, confirm, error = _parse_csv_import_request()
    if error:
        return error
    result = bulk_import.import_accounts_csv(csv_text, confirm=confirm)
    return _csv_import_response(result, confirm)


@app.route("/api/investments/ocr", methods=["POST"])
def investments_ocr():
    if not request.files.get("image"):
        return jsonify({"error": "Imagen requerida (campo image)"}), 400

    # El gate de modelo de visión solo aplica al proveedor local (Ollama).
    # En la nube (Gemini/compatible) confiamos en el adapter y su manejo de errores.
    if ai_settings.effective_provider() == "local":
        ollama_status = ai_service.check_ollama_connection()
        if not ollama_status.get("vision_model_found"):
            vision_model = config.OLLAMA_VISION_MODEL
            return (
                jsonify(
                    {
                        "error": f"Modelo de visión '{vision_model}' no encontrado en Ollama",
                        "hint": f"Ejecuta: ollama pull {vision_model}",
                        "vision_model": vision_model,
                        "vision_model_found": False,
                        "rows": [],
                        "warnings": [],
                        "count": 0,
                        "ai_available": False,
                    }
                ),
                503,
            )

    uploaded = request.files["image"]
    image_bytes = uploaded.read()
    content_type = (uploaded.content_type or "image/png").split(";")[0].strip().lower()
    result = vision_service.analyze_investment_image(image_bytes, content_type)
    status = 200 if result.get("ai_available", True) else 503
    print("result", result)
    return jsonify(result), status


@app.route("/api/investments/ocr/confirm", methods=["POST"])
def investments_ocr_confirm():
    body = request.get_json(silent=True) or {}
    rows = body.get("rows") or []
    if not rows:
        return jsonify({"error": "Nada que confirmar"}), 400
    created = investment_ledger.confirm_ledger_rows(rows, source="ocr")
    return finance_response({"saved": len(created), "created": created})


@app.route("/api/note", methods=["POST"])
def save_note():
    body = request.get_json(silent=True) or {}
    text = (body.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Texto vacío"}), 400
    note = finance_store.add_note({"text": text, "account_id": body.get("account_id")}, source="manual")
    return finance_response({"note": note})


@app.route("/api/ollama/health")
def ollama_health():
    status = ai_service.check_ollama_connection()
    code = 200 if status.get("ok") else 503
    return jsonify(status), code


@app.route("/api/ai/health")
def ai_health():
    try:
        status = registry.get_active_integration().health()
    except IntegrationError as exc:
        status = {"ok": False, "error": str(exc), "hint": exc.hint}
    code = 200 if status.get("ok") else 503
    return jsonify(status), code


@app.route("/api/settings/ai", methods=["GET"])
def get_ai_settings():
    return jsonify(
        {
            "config": ai_settings.get_public_config(),
            "providers": registry.available_providers(),
        }
    )


@app.route("/api/settings/ai", methods=["POST"])
def save_ai_settings():
    body = request.get_json(silent=True) or {}
    public = ai_settings.save_config(body)
    registry.clear_cache()
    return jsonify({"config": public, "providers": registry.available_providers()})


@app.route("/api/settings/ai/test", methods=["POST"])
def test_ai_settings():
    body = request.get_json(silent=True) or {}
    try:
        integration = registry.build_integration(body)
        status = integration.health()
    except IntegrationError as exc:
        return jsonify({"ok": False, "error": str(exc), "hint": exc.hint}), 200
    code = 200 if status.get("ok") else 200
    return jsonify(status), code


@app.route("/api/settings/quotes", methods=["GET"])
def get_quote_settings():
    return jsonify({"config": quote_settings.get_public_config()})


@app.route("/api/settings/quotes", methods=["POST"])
def save_quote_settings():
    body = request.get_json(silent=True) or {}
    public = quote_settings.save_config(body)
    quote_service.clear_cache()
    return jsonify({"config": public})


@app.route("/api/settings/quotes/test", methods=["POST"])
def test_quote_settings():
    body = request.get_json(silent=True) or {}
    merged = quote_settings.load_config()
    for key in quote_settings.ALLOWED_KEYS:
        if key in body and body[key] is not None:
            merged[key] = body[key]
    status = quote_service.test_provider_connection(merged)
    return jsonify(status), 200


@app.route("/api/analyze", methods=["POST"])
def analyze():
    body = request.get_json(silent=True) or {}
    text = (body.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Texto vacío"}), 400

    result = ai_service.analyze_text(text)
    result["accounts"] = finance_store.get_accounts_view()
    status = 200 if result.get("ai_available", True) else 503
    return jsonify(result), status


@app.route("/api/confirm-analysis", methods=["POST"])
def confirm_analysis_route():
    body = request.get_json(silent=True) or {}
    has_items = (
        body.get("items")
        or body.get("expenses")
        or body.get("incomes")
        or body.get("investments")
        or body.get("notes")
    )
    if not has_items:
        return jsonify({"error": "Nada que confirmar"}), 400

    result = finance_store.confirm_analysis(body)
    return finance_response({"saved": result["saved"], "created": result["created"]})


def _serve_packaged():
    """Servidor de producción para el .exe: waitress + abrir el navegador."""
    import threading
    import webbrowser

    from waitress import serve

    url = f"http://localhost:{config.FLASK_PORT}"
    threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    print(f"Delfos corriendo en {url} (cierra esta ventana para detenerlo)")
    serve(app, host="127.0.0.1", port=config.FLASK_PORT)


if __name__ == "__main__":
    if config.FROZEN or not config.FLASK_DEBUG:
        _serve_packaged()
    else:
        app.run(debug=True, host=config.FLASK_HOST, port=config.FLASK_PORT)
