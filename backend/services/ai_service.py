import json
import re

from integrations import registry
from integrations.base import IntegrationError
from integrations.ollama import OllamaIntegration
from services.finance_store import get_accounts, get_categories, match_account_hint


def build_finance_prompt(text, accounts):
    account_summaries = [
        {
            "id": account["id"],
            "name": account["name"],
            "type": account["type"],
            "currency": account["currency"],
        }
        for account in accounts
    ]

    existing_categories = [c["name"] for c in get_categories()]

    return f"""
Eres un asistente financiero personal.
Tu tarea es convertir texto libre en registros financieros estructurados.

El texto puede contener uno o varios movimientos financieros.
Debes separar cada movimiento claramente identificable en un registro independiente.
No mezcles varios gastos en un solo gasto.
No mezcles varias inversiones en una sola inversión.
No conviertas una lista de gastos en una sola nota.
No des consejos de inversión.
No recomiendes comprar ni vender activos.
Devuelve solo JSON válido. No expliques nada fuera del JSON.

Texto del usuario:
{text}

Cuentas disponibles:
{json.dumps(account_summaries, ensure_ascii=False)}

Categorías existentes:
{json.dumps(existing_categories, ensure_ascii=False)}

Formato:
{{
  "expenses": [
    {{
      "amount": 0,
      "currency": "COP",
      "category": "",
      "category_emoji": "",
      "description": "",
      "payment_method": "",
      "account_name_hint": "",
      "suggested_new_category": null
    }}
  ],
  "incomes": [
    {{
      "amount": 0,
      "currency": "COP",
      "category": "",
      "category_emoji": "",
      "description": "",
      "income_source": "",
      "account_name_hint": "",
      "suggested_new_category": null
    }}
  ],
  "investments": [
    {{
      "asset": "",
      "asset_type": "",
      "amount": 0,
      "currency": "USD",
      "action": "",
      "category": "Inversión",
      "category_emoji": "📈",
      "notes": "",
      "account_name_hint": "",
      "suggested_new_category": null
    }}
  ],
  "notes": [
    {{
      "text": "",
      "tags": [],
      "account_name_hint": null
    }}
  ],
  "reflection": ""
}}

Reglas importantes:
- Si el usuario menciona varios gastos, crea varios objetos dentro de expenses.
- Si menciona ingresos (salario, freelance, transferencia recibida), usa incomes.
- Si el usuario menciona varias inversiones, crea varios objetos dentro de investments.
- Si el usuario menciona varios recordatorios o reflexiones, crea varias notas si tiene sentido.
- Cada monto debe quedar asociado con su descripción más cercana.
- Si dice "18 mil en taxi", amount debe ser 18000 y description debe ser "Taxi".
- Si dice "45 mil en almuerzo", amount debe ser 45000 y category debe ser "Comida".
- En español colombiano, "mil" significa multiplicar por 1000.
- Si el usuario dice "100 dólares", usa amount 100 y currency USD.
- Si el usuario dice "45 mil pesos", usa amount 45000 y currency COP.
- Si no está clara la moneda de un gasto, usa COP.
- Si no está clara la moneda de una inversión internacional, usa USD.
- Si no estás seguro de un monto, usa 0.
- No inventes montos.
- No inventes activos.
- Sugiere una categoría corta y clara.
- Sugiere un emoji relacionado con la categoría.
- Usa emojis simples y conocidos.
- Si una cuenta disponible parece coincidir con el movimiento, escribe su nombre en account_name_hint.
- Analiza el nombre de las cuentas disponibles para intentar identificar automáticamente la cuenta correcta.
- Si el usuario menciona tarjeta, débito, crédito, efectivo, Nequi, Daviplata, broker o una entidad financiera, intenta asociarla a la cuenta más cercana disponible.
- Si existe una coincidencia razonable entre el movimiento y una cuenta disponible, prioriza esa cuenta en account_name_hint.
- Si no hay cuenta clara, usa account_name_hint vacío o null.
- Si ninguna categoría existente representa bien el movimiento, sugiere una nueva categoría en suggested_new_category.
- No fuerces una categoría existente cuando una nueva categoría tenga más sentido.
- Las nuevas categorías sugeridas deben ser cortas, claras y reutilizables.
- Para comida usa Comida 🍽️.
- Para café usa Café ☕.
- Para mercado usa Mercado 🛒.
- Para transporte usa Transporte 🚗 o Transporte público 🚌.
- Para educación usa Educación 📚.
- Para salud usa Salud 🏥.
- Para ocio usa Ocio 🎮 o Salidas 🍻.
- Para servicios usa Servicios 🧾.
- Para arriendo usa Vivienda 🏠.
- Para inversión usa Inversión 📈.
- Para ahorro usa Ahorro 🐖.
- La reflection debe resumir brevemente cuántos movimientos detectaste.
""".strip()


def _extract_json(raw):
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON found in model response")
    return json.loads(raw[start : end + 1])


def _needs_review(kind, item):
    if kind in ("expense", "income"):
        return not item.get("amount")
    if kind == "investment":
        return not item.get("asset")
    return False


def _build_preview_item(kind, raw, accounts):
    hint = raw.get("account_name_hint")
    account_id = match_account_hint(hint, accounts)
    suggested = raw.get("suggested_new_category")

    base = {
        "kind": kind,
        "account_id": account_id,
        "account_name_hint": hint or "",
        "suggested_new_category": suggested,
        "accept_category_suggestion": False,
        "needs_review": _needs_review(kind, raw),
    }

    if kind == "expense":
        return {
            **base,
            "title": "Gasto",
            "amount": raw.get("amount"),
            "currency": raw.get("currency", "COP"),
            "category": raw.get("category", "General"),
            "category_emoji": raw.get("category_emoji", ""),
            "description": raw.get("description", ""),
            "payment_method": raw.get("payment_method", ""),
        }

    if kind == "income":
        return {
            **base,
            "title": "Ingreso",
            "amount": raw.get("amount"),
            "currency": raw.get("currency", "COP"),
            "category": raw.get("category", "Otros"),
            "category_emoji": raw.get("category_emoji", "💰"),
            "description": raw.get("description", ""),
            "income_source": raw.get("income_source") or raw.get("source") or "",
        }

    if kind == "investment":
        asset = raw.get("asset", "")
        return {
            **base,
            "title": "Inversión",
            "amount": raw.get("amount"),
            "currency": raw.get("currency", "USD"),
            "asset": asset,
            "asset_type": raw.get("asset_type", "ETF"),
            "action": raw.get("action", "buy"),
            "category": raw.get("category", "Inversión"),
            "category_emoji": raw.get("category_emoji", "📈"),
            "description": raw.get("notes") or f"Compra {asset}",
            "notes": raw.get("notes", ""),
        }

    return {
        **base,
        "title": "Nota",
        "amount": None,
        "currency": None,
        "category": "Reflexión",
        "category_emoji": "📝",
        "description": raw.get("text", ""),
        "text": raw.get("text", ""),
        "tags": raw.get("tags") or [],
    }


def analysis_to_preview(analysis, accounts=None):
    accounts = accounts if accounts is not None else get_accounts()
    expenses_raw = analysis.get("expenses") or []
    incomes_raw = analysis.get("incomes") or []
    investments_raw = analysis.get("investments") or []
    notes_raw = analysis.get("notes") or []

    expenses = []
    for exp in expenses_raw:
        if not exp.get("amount") and not exp.get("description"):
            continue
        expenses.append(_build_preview_item("expense", exp, accounts))

    incomes = []
    for inc in incomes_raw:
        if not inc.get("amount") and not inc.get("description"):
            continue
        incomes.append(_build_preview_item("income", inc, accounts))

    investments = []
    for inv in investments_raw:
        if not inv.get("amount") and not inv.get("asset"):
            continue
        investments.append(_build_preview_item("investment", inv, accounts))

    notes = []
    for note in notes_raw:
        if not note.get("text"):
            continue
        notes.append(_build_preview_item("note", note, accounts))

    items = expenses + incomes + investments + notes
    counts = {
        "expenses": len(expenses),
        "incomes": len(incomes),
        "investments": len(investments),
        "notes": len(notes),
        "total": len(items),
    }

    return {
        "expenses": expenses,
        "incomes": incomes,
        "investments": investments,
        "notes": notes,
        "items": items,
        "counts": counts,
        "reflection": analysis.get("reflection") or "",
        "ai_available": True,
    }


def _fallback_note_preview(text):
    return {
        "expenses": [],
        "investments": [],
        "notes": [
            {
                "kind": "note",
                "title": "Nota",
                "amount": None,
                "currency": None,
                "category": "Sin clasificar",
                "category_emoji": "📝",
                "description": text,
                "text": text,
                "tags": ["sin-clasificar"],
                "account_id": None,
                "account_name_hint": "",
                "suggested_new_category": None,
                "accept_category_suggestion": False,
                "needs_review": False,
            }
        ],
        "items": [],
        "counts": {"expenses": 0, "investments": 0, "notes": 1, "total": 1},
        "reflection": "No pude clasificar el texto. Puedes guardarlo como nota.",
        "ai_available": False,
        "can_save_as_note": True,
        "error": "La IA no devolvió un formato válido. Puedes guardar el texto como nota sin clasificar.",
    }


def check_ollama_connection():
    """Compat: health del adapter Ollama (usado por /api/ollama/health y el gate de OCR local)."""
    return OllamaIntegration().health()


def analyze_text(text):
    accounts = get_accounts()
    prompt = build_finance_prompt(text, accounts)

    try:
        integration = registry.get_active_integration()
        raw = integration.complete_json(prompt)
        analysis = _extract_json(raw)
        preview = analysis_to_preview(analysis, accounts)
        if not preview["items"]:
            preview["reflection"] = preview["reflection"] or "No detecté movimientos claros en el texto."
            preview["can_save_as_note"] = True
        return preview
    except IntegrationError as exc:
        try:
            status = integration.health()
        except Exception:  # noqa: BLE001 - health no debe romper el fallback
            status = {}
        hint = exc.hint or status.get("hint") or "Revisa la configuración de IA en Configuración."
        message = str(exc) or status.get("error", "Conexión fallida")
        fallback = _fallback_note_preview(text)
        fallback["error"] = f"Delfos no pudo contactar el modelo de IA. {message}"
        fallback["hint"] = hint
        fallback["ai_status"] = status
        return fallback
    except (json.JSONDecodeError, ValueError, KeyError) as exc:
        fallback = _fallback_note_preview(text)
        fallback["error"] = f"No pude interpretar la respuesta del modelo: {exc}"
        return fallback
