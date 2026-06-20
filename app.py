from flask import Flask, jsonify, render_template, request

import config
from services import ai_service, finance_store

app = Flask(__name__)


def finance_response(extra=None):
    payload = finance_store.get_finance_payload()
    if extra:
        payload.update(extra)
    return jsonify(payload)


@app.route("/")
def index():
    data = finance_store.get_finance_payload()
    return render_template(
        "index.html",
        summary=data["summary"],
        accounts=data["accounts"],
        movements=data["movements"],
        account_types=finance_store.ACCOUNT_TYPES,
    )


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


@app.route("/api/investments", methods=["POST"])
def create_investment():
    body = request.get_json(silent=True) or {}
    if not body.get("amount"):
        return jsonify({"error": "Monto obligatorio"}), 400
    investment = finance_store.add_investment(body)
    return finance_response({"investment": investment})


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
    has_items = body.get("items") or body.get("expenses") or body.get("investments") or body.get("notes")
    if not has_items:
        return jsonify({"error": "Nada que confirmar"}), 400

    result = finance_store.confirm_analysis(body)
    return finance_response({"saved": result["saved"], "created": result["created"]})


if __name__ == "__main__":
    app.run(debug=config.FLASK_DEBUG, host=config.FLASK_HOST, port=config.FLASK_PORT)
