import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

DATA_PATH = Path(__file__).parent.parent / "data" / "delfos_data.json"

DEFAULT_CATEGORIES = [
    {"id": "cat_comida", "name": "Comida", "emoji": "🍽️", "kind": "expense"},
    {"id": "cat_transporte", "name": "Transporte", "emoji": "🚌", "kind": "expense"},
    {"id": "cat_mercado", "name": "Mercado", "emoji": "🛒", "kind": "expense"},
    {"id": "cat_cafe", "name": "Café", "emoji": "☕", "kind": "expense"},
    {"id": "cat_salud", "name": "Salud", "emoji": "🏥", "kind": "expense"},
    {"id": "cat_educacion", "name": "Educación", "emoji": "📚", "kind": "expense"},
    {"id": "cat_entretenimiento", "name": "Entretenimiento", "emoji": "🎬", "kind": "expense"},
    {"id": "cat_servicios", "name": "Servicios", "emoji": "💡", "kind": "expense"},
    {"id": "cat_inversion", "name": "Inversión", "emoji": "📈", "kind": "investment"},
    {"id": "cat_general", "name": "General", "emoji": "🏷️", "kind": "general"},
    {"id": "cat_nota", "name": "Nota", "emoji": "📝", "kind": "note"},
]

DEFAULT_DATA = {
    "settings": {"currency": "COP"},
    "categories": deepcopy(DEFAULT_CATEGORIES),
    "accounts": [],
    "expenses": [],
    "investments": [],
    "notes": [],
}

INVESTMENT_OPERATION_TYPES = {"deposit", "buy", "sell", "dividend"}

LEDGER_FLOAT_FIELDS = (
    "quantity",
    "amount_usd",
    "amount_cop",
    "unit_price",
    "closing_cost",
    "pnl_usd",
    "total",
)

ACCOUNT_TYPES = {
    "cash": "Efectivo",
    "bank": "Banco",
    "credit_card": "Tarjeta crédito",
    "debit_card": "Tarjeta débito",
    "wallet": "Billetera",
    "broker": "Broker",
    "crypto": "Cripto",
    "savings": "Ahorros",
    "other": "Otro",
}


def _now_iso():
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds")


def _today():
    return datetime.now(timezone.utc).replace(tzinfo=None).strftime("%Y-%m-%d")


def _next_id(prefix, items):
    nums = []
    for item in items:
        raw = item.get("id", "")
        if raw.startswith(f"{prefix}_") and raw[len(prefix) + 1 :].isdigit():
            nums.append(int(raw[len(prefix) + 1 :]))
    n = max(nums, default=0) + 1
    return f"{prefix}_{n:03d}"


def _migrate_categories(data):
    """Move settings.categories to top-level categories with ids."""
    settings = data.setdefault("settings", {})
    legacy = settings.pop("categories", None)
    if legacy and not data.get("categories"):
        migrated = []
        for i, cat in enumerate(legacy):
            name = (cat.get("name") or "").strip()
            if not name:
                continue
            migrated.append(
                {
                    "id": cat.get("id") or f"cat_legacy_{i + 1:03d}",
                    "name": name,
                    "emoji": cat.get("emoji") or "🏷️",
                    "kind": cat.get("kind") or "general",
                }
            )
        data["categories"] = migrated
    if not data.get("categories"):
        data["categories"] = deepcopy(DEFAULT_CATEGORIES)
    return data


def _normalize_investment_ledger(investment):
    """Soft migration: map legacy fields to ledger columns."""
    op = investment.get("operation_type")
    if not op:
        action = (investment.get("action") or "buy").lower()
        investment["operation_type"] = action if action in INVESTMENT_OPERATION_TYPES else "buy"
    elif investment.get("operation_type") not in INVESTMENT_OPERATION_TYPES:
        investment["operation_type"] = "buy"

    if investment.get("total") is None and investment.get("amount") is not None:
        investment["total"] = float(investment["amount"])
    if investment.get("amount") is None and investment.get("total") is not None:
        investment["amount"] = float(investment["total"])

    for key in LEDGER_FLOAT_FIELDS:
        if key in investment and investment[key] is not None and investment[key] != "":
            investment[key] = float(investment[key])
    return investment


def normalize_investment(investment):
    return _normalize_investment_ledger(dict(investment))


def _migrate_investments(data):
    changed = False
    for investment in data.get("investments", []):
        before = json.dumps(investment, sort_keys=True, default=str)
        _normalize_investment_ledger(investment)
        after = json.dumps(investment, sort_keys=True, default=str)
        if before != after:
            changed = True
    return changed


def load_data():
    if not DATA_PATH.exists():
        save_data(deepcopy(DEFAULT_DATA))
    with open(DATA_PATH, encoding="utf-8") as f:
        data = json.load(f)
    needs_save = "categories" in data.get("settings", {}) or not data.get("categories")
    if needs_save:
        _migrate_categories(data)
    if _migrate_investments(data):
        needs_save = True
    if needs_save:
        save_data(data)
    return data


def save_data(data):
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_accounts():
    return load_data()["accounts"]


def find_account(account_id):
    if not account_id:
        return None
    for account in get_accounts():
        if account["id"] == account_id:
            return account
    return None


def match_account_hint(hint, accounts=None):
    if not hint:
        return None
    accounts = accounts if accounts is not None else get_accounts()
    hint_lower = hint.strip().lower()

    for account in accounts:
        if account["name"].lower() == hint_lower:
            return account["id"]

    for account in accounts:
        name_lower = account["name"].lower()
        if hint_lower in name_lower or name_lower in hint_lower:
            return account["id"]

    type_keywords = {
        "tarjeta": ("credit_card", "debit_card"),
        "credito": ("credit_card",),
        "crédito": ("credit_card",),
        "debito": ("debit_card",),
        "débito": ("debit_card",),
        "efectivo": ("cash",),
        "nequi": ("wallet",),
        "daviplata": ("wallet",),
        "broker": ("broker",),
        "bancolombia": ("bank", "credit_card", "debit_card"),
        "banco": ("bank",),
    }
    for keyword, types in type_keywords.items():
        if keyword in hint_lower:
            for account in accounts:
                if account.get("type") in types:
                    return account["id"]
            for account in accounts:
                if keyword in account["name"].lower():
                    return account["id"]

    for account in accounts:
        if account.get("type", "").lower() == hint_lower:
            return account["id"]
    return None


def get_categories(kind=None):
    categories = load_data().get("categories", [])
    if kind:
        return [c for c in categories if c.get("kind") == kind or c.get("kind") == "general"]
    return categories


def find_category(category_id):
    if not category_id:
        return None
    for cat in get_categories():
        if cat.get("id") == category_id:
            return cat
    return None


def find_category_by_name(name, kind=None):
    if not name:
        return None
    name_lower = name.strip().lower()
    for cat in get_categories(kind):
        if cat.get("name", "").lower() == name_lower:
            return cat
    return None


def _next_category_id(categories):
    nums = []
    for cat in categories:
        raw = cat.get("id", "")
        if raw.startswith("cat_") and raw[4:].isdigit():
            nums.append(int(raw[4:]))
        elif raw.startswith("cat_"):
            suffix = raw[4:]
            if suffix.isdigit():
                nums.append(int(suffix))
    n = max(nums, default=0) + 1
    return f"cat_{n:03d}"


def add_category(name, emoji="", kind="general"):
    name = name.strip()
    if not name:
        return None
    data = load_data()
    categories = data.setdefault("categories", [])
    existing = find_category_by_name(name, kind)
    if existing:
        return existing
    entry = {
        "id": _next_category_id(categories),
        "name": name,
        "emoji": emoji or "🏷️",
        "kind": kind or "general",
    }
    categories.append(entry)
    save_data(data)
    return entry


def update_category(category_id, updates):
    data = load_data()
    for cat in data.get("categories", []):
        if cat.get("id") != category_id:
            continue
        if "name" in updates and updates["name"] is not None:
            cat["name"] = updates["name"].strip()
        if "emoji" in updates and updates["emoji"] is not None:
            cat["emoji"] = updates["emoji"]
        if "kind" in updates and updates["kind"] is not None:
            cat["kind"] = updates["kind"]
        save_data(data)
        return cat
    return None


def count_category_usage(category_name):
    if not category_name:
        return 0
    data = load_data()
    name_lower = category_name.strip().lower()
    count = 0
    for key in ("expenses", "investments"):
        count += sum(1 for item in data[key] if (item.get("category") or "").lower() == name_lower)
    return count


def delete_category(category_id):
    data = load_data()
    cat = find_category(category_id)
    if not cat:
        return False
    before = len(data.get("categories", []))
    data["categories"] = [c for c in data.get("categories", []) if c.get("id") != category_id]
    if len(data["categories"]) == before:
        return False
    save_data(data)
    return True


def count_movements_for_account(account_id):
    data = load_data()
    count = 0
    for key in ("expenses", "investments", "notes"):
        count += sum(1 for item in data[key] if item.get("account_id") == account_id)
    return count


def add_account(account_input):
    data = load_data()
    initial = float(account_input.get("initial_balance") or 0)
    account = {
        "id": _next_id("account", data["accounts"]),
        "name": account_input["name"].strip(),
        "type": account_input.get("type", "other"),
        "currency": account_input.get("currency", "COP"),
        "initial_balance": initial,
        "current_balance": initial,
        "emoji": account_input.get("emoji") or "💰",
        "created_at": _now_iso(),
    }
    data["accounts"].append(account)
    save_data(data)
    return account


RESET_DATA = {
    "settings": {"currency": "COP"},
    "categories": deepcopy(DEFAULT_CATEGORIES),
    "accounts": [],
    "expenses": [],
    "investments": [],
    "notes": [],
}


def reset_finance_data():
    save_data(deepcopy(RESET_DATA))
    return deepcopy(RESET_DATA)


def update_account(account_id, updates):
    data = load_data()
    for account in data["accounts"]:
        if account["id"] != account_id:
            continue
        for key in ("name", "type", "currency", "emoji"):
            if key in updates and updates[key] is not None:
                account[key] = updates[key]
        if "initial_balance" in updates and updates["initial_balance"] is not None:
            account["initial_balance"] = float(updates["initial_balance"])
        if "current_balance" in updates and updates["current_balance"] is not None:
            account["current_balance"] = round(float(updates["current_balance"]), 2)
        save_data(data)
        return account
    return None


def delete_account(account_id):
    data = load_data()
    before = len(data["accounts"])
    data["accounts"] = [a for a in data["accounts"] if a["id"] != account_id]
    if len(data["accounts"]) == before:
        return False
    for key in ("expenses", "investments", "notes"):
        for item in data[key]:
            if item.get("account_id") == account_id:
                item["account_id"] = None
    save_data(data)
    return True


def find_expense(expense_id):
    for expense in load_data()["expenses"]:
        if expense["id"] == expense_id:
            return expense
    return None


def find_investment(investment_id):
    for investment in load_data()["investments"]:
        if investment["id"] == investment_id:
            return investment
    return None


def find_note(note_id):
    for note in load_data()["notes"]:
        if note["id"] == note_id:
            return note
    return None


def update_expense(expense_id, updates):
    data = load_data()
    for expense in data["expenses"]:
        if expense["id"] != expense_id:
            continue
        for key in ("date", "account_id", "currency", "category", "category_emoji", "description", "payment_method"):
            if key in updates:
                expense[key] = updates[key]
        if "amount" in updates and updates["amount"] is not None:
            expense["amount"] = float(updates["amount"])
        save_data(data)
        return expense
    return None


def delete_expense(expense_id):
    data = load_data()
    before = len(data["expenses"])
    data["expenses"] = [e for e in data["expenses"] if e["id"] != expense_id]
    if len(data["expenses"]) == before:
        return False
    save_data(data)
    return True


def update_investment(investment_id, updates):
    data = load_data()
    for investment in data["investments"]:
        if investment["id"] != investment_id:
            continue
        for key in (
            "date",
            "account_id",
            "asset",
            "asset_type",
            "currency",
            "action",
            "operation_type",
            "category",
            "category_emoji",
            "notes",
            "source_image",
        ):
            if key in updates:
                investment[key] = updates[key]
        if "amount" in updates and updates["amount"] is not None:
            investment["amount"] = float(updates["amount"])
        for key in LEDGER_FLOAT_FIELDS:
            if key in updates:
                investment[key] = None if updates[key] is None else float(updates[key])
        if "operation_type" in updates and updates["operation_type"]:
            op = updates["operation_type"]
            if op in INVESTMENT_OPERATION_TYPES:
                investment["action"] = op
        _normalize_investment_ledger(investment)
        save_data(data)
        return investment
    return None


def delete_investment(investment_id):
    data = load_data()
    before = len(data["investments"])
    data["investments"] = [i for i in data["investments"] if i["id"] != investment_id]
    if len(data["investments"]) == before:
        return False
    save_data(data)
    return True


def update_note(note_id, updates):
    data = load_data()
    for note in data["notes"]:
        if note["id"] != note_id:
            continue
        for key in ("date", "account_id", "text", "tags"):
            if key in updates:
                note[key] = updates[key]
        save_data(data)
        return note
    return None


def delete_note(note_id):
    data = load_data()
    before = len(data["notes"])
    data["notes"] = [n for n in data["notes"] if n["id"] != note_id]
    if len(data["notes"]) == before:
        return False
    save_data(data)
    return True


def _adjust_account_balance(account_id, amount, currency, subtract=True):
    if not account_id:
        return
    data = load_data()
    for account in data["accounts"]:
        if account["id"] == account_id and account["currency"] == currency:
            delta = float(amount)
            account["current_balance"] = round(
                account["current_balance"] - delta if subtract else account["current_balance"] + delta,
                2,
            )
            save_data(data)
            return


def add_expense(expense_input, source="manual"):
    data = load_data()
    expense = {
        "id": _next_id("expense", data["expenses"]),
        "date": expense_input.get("date") or _today(),
        "account_id": expense_input.get("account_id"),
        "amount": float(expense_input.get("amount") or 0),
        "currency": expense_input.get("currency", "COP"),
        "category": expense_input.get("category", "General"),
        "category_emoji": expense_input.get("category_emoji", ""),
        "description": expense_input.get("description", ""),
        "payment_method": expense_input.get("payment_method", ""),
        "source": source,
        "created_at": _now_iso(),
    }
    data["expenses"].append(expense)
    save_data(data)
    _adjust_account_balance(expense["account_id"], expense["amount"], expense["currency"], subtract=True)
    return expense


def _ledger_float(value):
    if value is None or value == "":
        return None
    return float(value)


def add_investment(investment_input, source="manual"):
    data = load_data()
    operation_type = investment_input.get("operation_type") or investment_input.get("action") or "buy"
    if operation_type not in INVESTMENT_OPERATION_TYPES:
        operation_type = "buy"

    amount_raw = investment_input.get("amount")
    if amount_raw is None:
        amount_raw = investment_input.get("total")
    amount = float(amount_raw or 0)

    investment = {
        "id": _next_id("investment", data["investments"]),
        "date": investment_input.get("date") or _today(),
        "account_id": investment_input.get("account_id"),
        "asset": investment_input.get("asset", ""),
        "asset_type": investment_input.get("asset_type", "ETF"),
        "amount": amount,
        "currency": investment_input.get("currency", "USD"),
        "action": operation_type,
        "operation_type": operation_type,
        "quantity": _ledger_float(investment_input.get("quantity")),
        "amount_usd": _ledger_float(investment_input.get("amount_usd")),
        "amount_cop": _ledger_float(investment_input.get("amount_cop")),
        "unit_price": _ledger_float(investment_input.get("unit_price")),
        "closing_cost": _ledger_float(investment_input.get("closing_cost")),
        "pnl_usd": _ledger_float(investment_input.get("pnl_usd")),
        "total": _ledger_float(investment_input.get("total")),
        "source_image": investment_input.get("source_image"),
        "category": investment_input.get("category", "Inversión"),
        "category_emoji": investment_input.get("category_emoji", "📈"),
        "notes": investment_input.get("notes") or investment_input.get("description", ""),
        "source": source,
        "created_at": _now_iso(),
    }
    _normalize_investment_ledger(investment)
    data["investments"].append(investment)
    save_data(data)
    if investment["action"] == "buy":
        _adjust_account_balance(
            investment["account_id"], investment["amount"], investment["currency"], subtract=True
        )
    return investment


def bulk_add_investments(rows, source="import"):
    created = []
    for row in rows:
        payload = {k: v for k, v in row.items() if k not in ("row_index", "warnings", "needs_review")}
        created.append(add_investment(payload, source=source))
    return created


def bulk_add_expenses(rows, source="import"):
    created = []
    for row in rows:
        payload = {k: v for k, v in row.items() if k not in ("row_index", "warnings", "needs_review")}
        created.append(add_expense(payload, source=source))
    return created


def bulk_add_notes(rows, source="import"):
    created = []
    for row in rows:
        payload = {k: v for k, v in row.items() if k not in ("row_index", "warnings", "needs_review")}
        created.append(add_note(payload, source=source))
    return created


def bulk_add_accounts(rows):
    created = []
    for row in rows:
        payload = {k: v for k, v in row.items() if k not in ("row_index", "warnings", "needs_review")}
        created.append(add_account(payload))
    return created


def add_note(note_input, source="manual"):
    data = load_data()
    note = {
        "id": _next_id("note", data["notes"]),
        "date": note_input.get("date") or _today(),
        "account_id": note_input.get("account_id"),
        "text": note_input.get("text") or note_input.get("description", ""),
        "tags": note_input.get("tags") or [],
        "source": source,
        "created_at": _now_iso(),
    }
    data["notes"].append(note)
    save_data(data)
    return note


def confirm_analysis(payload):
    """Guarda movimientos desde items[] o {expenses, investments, notes}."""
    items = _normalize_confirm_payload(payload)
    saved = {"expenses": 0, "investments": 0, "notes": 0}
    created = {"expenses": [], "investments": [], "notes": []}
    skip = {
        "kind",
        "title",
        "account_name_hint",
        "suggested_new_category",
        "accept_category_suggestion",
        "needs_review",
    }

    for item in items:
        kind = item.get("kind")
        data = {k: v for k, v in item.items() if k not in skip}

        if item.get("accept_category_suggestion") and item.get("suggested_new_category"):
            data["category"] = item["suggested_new_category"]
            cat_kind = kind if kind in ("expense", "investment") else "general"
            add_category(
                item["suggested_new_category"],
                item.get("category_emoji", ""),
                kind=cat_kind,
            )

        if kind == "expense":
            created["expenses"].append(add_expense(data, source="ai"))
            saved["expenses"] += 1
        elif kind == "investment":
            created["investments"].append(add_investment(data, source="ai"))
            saved["investments"] += 1
        elif kind == "note":
            created["notes"].append(add_note(data, source="ai"))
            saved["notes"] += 1

    return {"saved": saved, "created": created}


def _normalize_confirm_payload(payload):
    if isinstance(payload, list):
        return payload
    if payload.get("items"):
        return payload["items"]

    items = []
    for exp in payload.get("expenses") or []:
        items.append({**exp, "kind": "expense"})
    for inv in payload.get("investments") or []:
        items.append({**inv, "kind": "investment"})
    for note in payload.get("notes") or []:
        items.append({**note, "kind": "note"})
    return items


def format_amount(amount, currency):
    if amount is None:
        return None
    if currency == "USD":
        return f"${amount:,.0f} {currency}"
    return f"${amount:,.0f} {currency}".replace(",", ".")


def build_summary():
    data = load_data()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    month_prefix = now.strftime("%Y-%m")

    monthly_expenses = {}
    for exp in data["expenses"]:
        if exp["date"].startswith(month_prefix):
            cur = exp.get("currency", "COP")
            monthly_expenses[cur] = monthly_expenses.get(cur, 0) + exp["amount"]

    investments_total = {}
    for inv in data["investments"]:
        cur = inv.get("currency", "USD")
        investments_total[cur] = investments_total.get(cur, 0) + inv["amount"]

    balances_by_currency = {}
    for account in data["accounts"]:
        cur = account.get("currency", "COP")
        balances_by_currency[cur] = balances_by_currency.get(cur, 0) + account.get("current_balance", 0)

    total_movements = len(data["expenses"]) + len(data["investments"]) + len(data["notes"])
    last_note_row = max(data["notes"], key=lambda n: n["created_at"], default=None)
    last_note = last_note_row["text"] if last_note_row else "Sin notas todavía"

    def fmt_map(m):
        return {k: format_amount(v, k) for k, v in m.items()} if m else {}

    return {
        "monthly_expenses": fmt_map(monthly_expenses) or {"COP": format_amount(0, "COP")},
        "investments_total": fmt_map(investments_total) or {"USD": format_amount(0, "USD")},
        "balances_by_currency": fmt_map(balances_by_currency) or {},
        "total_movements": total_movements,
        "total_accounts": len(data["accounts"]),
        "last_note": last_note,
        "status": "Actualizado hoy" if total_movements else "Delfos está listo para empezar",
        "has_data": total_movements > 0 or len(data["accounts"]) > 0,
    }


def get_accounts_view():
    views = []
    for account in get_accounts():
        balance = account.get("current_balance", 0)
        views.append(
            {
                **account,
                "type_label": ACCOUNT_TYPES.get(account.get("type"), account.get("type", "")),
                "movement_count": count_movements_for_account(account["id"]),
                "balance_display": format_amount(balance, account.get("currency", "COP")),
                "is_negative": balance < 0,
            }
        )
    return views


def get_movements(limit=12):
    data = load_data()
    items = []

    for exp in data["expenses"]:
        items.append(
            {
                "id": exp["id"],
                "type": "expense",
                "type_label": "Gasto",
                "icon": "expense",
                "description": exp.get("description") or exp.get("category", ""),
                "amount": format_amount(exp["amount"], exp.get("currency", "COP")),
                "category": exp.get("category"),
                "category_emoji": exp.get("category_emoji", ""),
                "account_id": exp.get("account_id"),
                "account_name": (find_account(exp.get("account_id")) or {}).get("name"),
                "date": datetime.fromisoformat(exp["created_at"]).strftime("%d %b"),
                "created_at": exp["created_at"],
            }
        )

    for inv in data["investments"]:
        items.append(
            {
                "id": inv["id"],
                "type": "investment",
                "type_label": "Inversión",
                "icon": "investment",
                "description": inv.get("notes") or f"{inv.get('action', 'buy').title()} {inv.get('asset', '')}",
                "amount": format_amount(inv["amount"], inv.get("currency", "USD")),
                "category": inv.get("asset") or inv.get("category"),
                "category_emoji": inv.get("category_emoji", "📈"),
                "account_id": inv.get("account_id"),
                "account_name": (find_account(inv.get("account_id")) or {}).get("name"),
                "date": datetime.fromisoformat(inv["created_at"]).strftime("%d %b"),
                "created_at": inv["created_at"],
            }
        )

    for note in data["notes"]:
        items.append(
            {
                "id": note["id"],
                "type": "note",
                "type_label": "Nota",
                "icon": "note",
                "description": note.get("text", ""),
                "amount": None,
                "category": ", ".join(note.get("tags") or []) or "Nota",
                "category_emoji": "📝",
                "account_id": note.get("account_id"),
                "account_name": (find_account(note.get("account_id")) or {}).get("name"),
                "date": datetime.fromisoformat(note["created_at"]).strftime("%d %b"),
                "created_at": note["created_at"],
            }
        )

    items.sort(key=lambda x: x["created_at"], reverse=True)
    return items[:limit]


def _parse_expense_date(exp):
    raw = exp.get("date") or exp.get("created_at") or _today()
    if len(raw) >= 10:
        return raw[:10]
    return _today()


def get_chart_data():
    data = load_data()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    month_prefix = now.strftime("%Y-%m")
    today = now.date()

    category_meta = {c["name"]: c.get("emoji", "🏷️") for c in data.get("categories", [])}
    category_totals = {}

    for exp in data["expenses"]:
        if not _parse_expense_date(exp).startswith(month_prefix):
            continue
        cat = (exp.get("category") or "General").strip()
        entry = category_totals.setdefault(
            cat,
            {"category": cat, "emoji": exp.get("category_emoji") or category_meta.get(cat, "🏷️"), "amount": 0.0, "currency": exp.get("currency", "COP")},
        )
        entry["amount"] += float(exp.get("amount") or 0)
        if exp.get("category_emoji"):
            entry["emoji"] = exp["category_emoji"]

    expenses_by_category = sorted(category_totals.values(), key=lambda x: x["amount"], reverse=True)

    daily_totals = {}
    for exp in data["expenses"]:
        exp_date = datetime.strptime(_parse_expense_date(exp), "%Y-%m-%d").date()
        days_ago = (today - exp_date).days
        if 0 <= days_ago <= 30:
            key = exp_date.isoformat()
            daily_totals[key] = daily_totals.get(key, 0.0) + float(exp.get("amount") or 0)

    sorted_days = sorted(daily_totals.keys())
    if len(sorted_days) >= 7:
        window_days = sorted_days[-30:] if len(sorted_days) >= 14 else sorted_days[-7:]
        period = "30d" if len(sorted_days) >= 14 else "7d"
    else:
        window_days = sorted_days
        period = "7d" if window_days else "none"

    spending_evolution = [
        {"date": day, "amount": round(daily_totals[day], 2), "label": datetime.strptime(day, "%Y-%m-%d").strftime("%d %b")}
        for day in window_days
    ]

    if not spending_evolution:
        monthly = {}
        for exp in data["expenses"]:
            month_key = _parse_expense_date(exp)[:7]
            monthly[month_key] = monthly.get(month_key, 0.0) + float(exp.get("amount") or 0)
        spending_evolution = [
            {
                "date": f"{m}-01",
                "amount": round(monthly[m], 2),
                "label": datetime.strptime(f"{m}-01", "%Y-%m-%d").strftime("%b %Y"),
            }
            for m in sorted(monthly.keys())[-6:]
        ]
        period = "monthly" if spending_evolution else "none"

    account_balances = [
        {
            "id": account["id"],
            "name": account["name"],
            "emoji": account.get("emoji", "💰"),
            "balance": round(float(account.get("current_balance", 0)), 2),
            "currency": account.get("currency", "COP"),
            "is_negative": float(account.get("current_balance", 0)) < 0,
        }
        for account in data["accounts"]
    ]

    return {
        "expenses_by_category": expenses_by_category,
        "spending_evolution": spending_evolution,
        "spending_period": period,
        "account_balances": account_balances,
    }


def get_finance_payload():
    data = load_data()
    return {
        "summary": build_summary(),
        "accounts": get_accounts_view(),
        "movements": get_movements(),
        "categories": data.get("categories", []),
        "expenses": data["expenses"],
        "investments": data["investments"],
        "notes": data["notes"],
        "charts": get_chart_data(),
    }
