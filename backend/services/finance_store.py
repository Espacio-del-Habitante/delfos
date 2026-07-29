import json
import os
import tempfile
import threading
from copy import deepcopy
from datetime import datetime, timezone

import config

DATA_PATH = config.DATA_DIR / "delfos_data.json"

# ponytail: RLock global — techo = serializa todas las lecturas/escrituras del JSON.
# Upgrade: file lock + particionar el store si hay escrituras concurrentes pesadas.
_DATA_LOCK = threading.RLock()

DEFAULT_CATEGORIES = [
    {"id": "cat_comida", "name": "Comida", "emoji": "🍽️", "kind": "expense"},
    {"id": "cat_transporte", "name": "Transporte", "emoji": "🚌", "kind": "expense"},
    {"id": "cat_mercado", "name": "Mercado", "emoji": "🛒", "kind": "expense"},
    {"id": "cat_cafe", "name": "Café", "emoji": "☕", "kind": "expense"},
    {"id": "cat_salud", "name": "Salud", "emoji": "🏥", "kind": "expense"},
    {"id": "cat_educacion", "name": "Educación", "emoji": "📚", "kind": "expense"},
    {"id": "cat_entretenimiento", "name": "Entretenimiento", "emoji": "🎬", "kind": "expense"},
    {"id": "cat_servicios", "name": "Servicios", "emoji": "💡", "kind": "expense"},
    {"id": "cat_salario", "name": "Salario", "emoji": "💼", "kind": "income"},
    {"id": "cat_freelance", "name": "Freelance", "emoji": "💻", "kind": "income"},
    {"id": "cat_otros_ingreso", "name": "Otros", "emoji": "💰", "kind": "income"},
    {"id": "cat_inversion", "name": "Inversión", "emoji": "📈", "kind": "investment"},
    {"id": "cat_general", "name": "General", "emoji": "🏷️", "kind": "general"},
    {"id": "cat_nota", "name": "Nota", "emoji": "📝", "kind": "note"},
]

DEFAULT_FINANCIAL_PROFILE = {
    "monthly_income_fixed": None,
    "monthly_income_variable_avg": None,
    "monthly_fixed_expenses": None,  # total mensual de gastos fijos (COP u moneda base)
    "fixed_expenses": [],  # [{label, amount}] detalle opcional
    "savings_target_percent": None,
    "investment_target_percent": None,
    "cushion_percent": None,  # holgura / colchón del ingreso (no comprometida)
    "emergency_fund_target_months": None,
    "pay_frequency": "monthly",  # monthly | biweekly | weekly
    "income_payday_day": None,  # día del mes 1–28 (evita feb/31); mensual/quincenal
    "income_payday_weekday": None,  # 0=lun … 6=dom; solo weekly
    "income_prompt_dismissed_ym": None,  # token de dismiss del banner payday
    "risk_profile": None,
    "investment_horizon": None,
    "fiscal_country": "CO",
    "priorities": [],
    "onboarding_completed": False,
    "last_reviewed_at": None,
}

# Claves que el chat puede proponer para escribir en el perfil (tras confirmación).
PROFILE_PATCH_KEYS = frozenset(
    {
        "monthly_income_fixed",
        "monthly_income_variable_avg",
        "monthly_fixed_expenses",
        "fixed_expenses",
        "savings_target_percent",
        "investment_target_percent",
        "cushion_percent",
        "emergency_fund_target_months",
        "pay_frequency",
        "income_payday_day",
        "income_payday_weekday",
        "risk_profile",
        "investment_horizon",
        "fiscal_country",
        "priorities",
    }
)

GOAL_STATUSES = frozenset({"active", "paused", "done", "cancelled"})
GOAL_TYPES = frozenset(
    {"emergency_fund", "savings", "investment", "debt", "custom"}
)
ACCOUNT_ROLES = frozenset({"operating", "goal", "general"})
RISK_PROFILES = frozenset({"conservative", "moderate", "aggressive"})
INVESTMENT_HORIZONS = frozenset({"short", "medium", "long"})
PAY_FREQUENCIES = frozenset({"monthly", "biweekly", "weekly"})

DEFAULT_DATA = {
    "settings": {"currency": "COP"},
    "categories": deepcopy(DEFAULT_CATEGORIES),
    "accounts": [],
    "expenses": [],
    "incomes": [],
    "investments": [],
    "investment_assets": [],
    "notes": [],
    "transfers": [],
    "financial_profile": deepcopy(DEFAULT_FINANCIAL_PROFILE),
    "goals": [],
    "chat_threads": [],
    "chat_messages": [],
    "memory_facts": [],
    "memory_summaries": [],
}

MOVEMENT_FILTERS = [
    {"id": "all", "label": "Todos"},
    {"id": "expense", "label": "Gasto"},
    {"id": "income", "label": "Ingreso"},
    {"id": "investment", "label": "Inversión"},
    {"id": "note", "label": "Nota"},
]

INVESTMENT_OPERATION_TYPES = {"deposit", "withdrawal", "buy", "sell", "dividend"}

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

# Aliases en español/colombiano → type canónico (chat → crear cuenta).
ACCOUNT_TYPE_ALIASES = {
    "efectivo": "cash",
    "cash": "cash",
    "banco": "bank",
    "bank": "bank",
    "tarjeta": "debit_card",
    "tarjeta debito": "debit_card",
    "tarjeta débito": "debit_card",
    "debit_card": "debit_card",
    "crédito": "credit_card",
    "credito": "credit_card",
    "tarjeta credito": "credit_card",
    "tarjeta crédito": "credit_card",
    "credit_card": "credit_card",
    "billetera": "wallet",
    "wallet": "wallet",
    "nequi": "wallet",
    "daviplata": "wallet",
    "broker": "broker",
    "cripto": "crypto",
    "crypto": "crypto",
    "ahorros": "savings",
    "savings": "savings",
    "otro": "other",
    "other": "other",
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


def _normalize_asset_symbol(symbol):
    return (symbol or "").strip().upper()


def _migrate_investment_asset_types(data):
    """Normaliza asset_type y corrige cripto mal tipada en imports previos."""
    from services.quote_symbol import infer_asset_type

    changed = False
    for investment in data.get("investments", []):
        asset = investment.get("asset") or ""
        old = investment.get("asset_type")
        new = infer_asset_type(asset, old)
        if old != new:
            investment["asset_type"] = new
            changed = True
    return changed


def _migrate_investment_assets(data):
    """Seed investment_assets from unique symbols in investments."""
    assets = data.setdefault("investment_assets", [])
    known = {_normalize_asset_symbol(a.get("symbol")) for a in assets if a.get("symbol")}
    changed = False
    for investment in data.get("investments", []):
        symbol = _normalize_asset_symbol(investment.get("asset"))
        if not symbol or symbol in known:
            continue
        assets.append({"id": _next_investment_asset_id(assets), "symbol": symbol})
        known.add(symbol)
        changed = True
    assets.sort(key=lambda a: (a.get("symbol") or "").lower())
    return changed


def _next_investment_asset_id(assets):
    nums = []
    for asset in assets:
        raw = asset.get("id", "")
        if raw.startswith("iasset_") and raw[7:].isdigit():
            nums.append(int(raw[7:]))
    n = max(nums, default=0) + 1
    return f"iasset_{n:03d}"


def get_investment_assets():
    return list(load_data().get("investment_assets", []))


def find_investment_asset_by_symbol(symbol):
    key = _normalize_asset_symbol(symbol)
    if not key:
        return None
    for asset in get_investment_assets():
        if _normalize_asset_symbol(asset.get("symbol")) == key:
            return asset
    return None


def _ensure_investment_asset_in_data(data, symbol, label=None):
    key = _normalize_asset_symbol(symbol)
    if not key:
        return None
    assets = data.setdefault("investment_assets", [])
    for asset in assets:
        if _normalize_asset_symbol(asset.get("symbol")) == key:
            return asset
    entry = {
        "id": _next_investment_asset_id(assets),
        "symbol": key,
    }
    if label and str(label).strip():
        entry["label"] = str(label).strip()
    assets.append(entry)
    assets.sort(key=lambda a: (a.get("symbol") or "").lower())
    return entry


def add_investment_asset(symbol, label=None):
    key = _normalize_asset_symbol(symbol)
    if not key:
        return None
    data = load_data()
    existing = find_investment_asset_by_symbol(key)
    if existing:
        return existing
    entry = _ensure_investment_asset_in_data(data, key, label)
    save_data(data)
    return entry


def _load_data_unlocked():
    if not DATA_PATH.exists():
        _save_data_unlocked(deepcopy(DEFAULT_DATA))
    with open(DATA_PATH, encoding="utf-8") as f:
        data = json.load(f)
    needs_save = "categories" in data.get("settings", {}) or not data.get("categories")
    if needs_save:
        _migrate_categories(data)
    if _migrate_investments(data):
        needs_save = True
    if _migrate_investment_assets(data):
        needs_save = True
    if _migrate_investment_asset_types(data):
        needs_save = True
    if "incomes" not in data:
        data["incomes"] = []
        needs_save = True
    if _migrate_assistant(data):
        needs_save = True
    if _migrate_account_links(data):
        needs_save = True
    if needs_save:
        _save_data_unlocked(data)
    return data


def load_data():
    with _DATA_LOCK:
        return _load_data_unlocked()


def _migrate_account_links(data):
    """Cuenta plana + enlace a meta: goal_id, role; transfers[]."""
    changed = False
    if not isinstance(data.get("transfers"), list):
        data["transfers"] = []
        changed = True
    goal_ids = {g.get("id") for g in (data.get("goals") or []) if g.get("id")}
    for account in data.get("accounts") or []:
        if "goal_id" not in account:
            account["goal_id"] = None
            changed = True
        elif account.get("goal_id") and account["goal_id"] not in goal_ids:
            account["goal_id"] = None
            changed = True
        role = account.get("role")
        if role not in ACCOUNT_ROLES:
            account["role"] = "general"
            changed = True
    return changed


def _migrate_assistant(data):
    """Asegura financial_profile + goals + chat/memoria (asistente)."""
    changed = False
    profile = data.get("financial_profile")
    if not isinstance(profile, dict):
        data["financial_profile"] = deepcopy(DEFAULT_FINANCIAL_PROFILE)
        changed = True
    else:
        for key, default in DEFAULT_FINANCIAL_PROFILE.items():
            if key not in profile:
                profile[key] = deepcopy(default) if isinstance(default, list) else default
                changed = True
        if not isinstance(profile.get("fixed_expenses"), list):
            profile["fixed_expenses"] = []
            changed = True
    for key in (
        "goals",
        "chat_threads",
        "chat_messages",
        "memory_facts",
        "memory_summaries",
        "transfers",
    ):
        if not isinstance(data.get(key), list):
            data[key] = []
            changed = True
    return changed


def _save_data_unlocked(data):
    """Escribe atómico: tempfile + os.replace (evita JSON a medias si hay crash)."""
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix=".delfos_", suffix=".tmp", dir=DATA_PATH.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, DATA_PATH)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def save_data(data):
    with _DATA_LOCK:
        _save_data_unlocked(data)


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
    for key in ("expenses", "incomes", "investments"):
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


def count_movements_for_account(account_id, data=None):
    data = data if data is not None else load_data()
    count = 0
    for key in ("expenses", "incomes", "investments", "notes"):
        count += sum(1 for item in data[key] if item.get("account_id") == account_id)
    return count


def sanitize_account_draft(raw):
    """Filtra un account_draft del chat a campos válidos para crear cuenta."""
    if not isinstance(raw, dict):
        return {}
    name = str(raw.get("name") or "").strip()
    if not name:
        return {}
    type_raw = str(raw.get("type") or "other").strip().lower()
    account_type = ACCOUNT_TYPE_ALIASES.get(type_raw) or (
        type_raw if type_raw in ACCOUNT_TYPES else "other"
    )
    currency = str(raw.get("currency") or "COP").strip().upper() or "COP"
    if currency not in ("COP", "USD"):
        currency = "COP"
    initial = raw.get("initial_balance")
    if initial in (None, ""):
        initial_balance = 0.0
    else:
        try:
            initial_balance = float(initial)
        except (TypeError, ValueError) as exc:
            raise ValueError("initial_balance must be a number") from exc
    emoji = str(raw.get("emoji") or "").strip() or "💰"
    return {
        "name": name[:80],
        "type": account_type,
        "currency": currency,
        "initial_balance": initial_balance,
        "emoji": emoji[:4],
    }


def find_account_by_name(name):
    needle = (name or "").strip().lower()
    if not needle:
        return None
    for account in get_accounts():
        if account.get("name", "").strip().lower() == needle:
            return deepcopy(account)
    return None


def _normalize_account_role(raw):
    role = (raw or "general").strip().lower() if isinstance(raw, str) else "general"
    return role if role in ACCOUNT_ROLES else "general"


def _normalize_goal_id(raw, data=None):
    if raw in (None, ""):
        return None
    goal_id = str(raw).strip()
    if not goal_id:
        return None
    goals = (data or load_data()).get("goals") or []
    if not any(g.get("id") == goal_id for g in goals):
        raise ValueError("goal_id no existe")
    return goal_id


def add_account(account_input):
    data = load_data()
    name = (account_input.get("name") or "").strip()
    if not name:
        raise ValueError("name is required")
    if find_account_by_name(name):
        raise ValueError(f'Ya existe una cuenta llamada "{name}"')
    type_raw = str(account_input.get("type") or "other").strip().lower()
    account_type = ACCOUNT_TYPE_ALIASES.get(type_raw) or (
        type_raw if type_raw in ACCOUNT_TYPES else "other"
    )
    initial = float(account_input.get("initial_balance") or 0)
    goal_id = _normalize_goal_id(account_input.get("goal_id"), data)
    role = _normalize_account_role(account_input.get("role"))
    if goal_id and role == "general":
        role = "goal"
    account = {
        "id": _next_id("account", data["accounts"]),
        "name": name,
        "type": account_type,
        "currency": account_input.get("currency", "COP"),
        "initial_balance": initial,
        "current_balance": initial,
        "emoji": account_input.get("emoji") or "💰",
        "goal_id": goal_id,
        "role": role,
        "created_at": _now_iso(),
    }
    data["accounts"].append(account)
    save_data(data)
    return account


def search_movements(query, kind=None, period="month", limit=12):
    """Búsqueda local simple por texto en gastos/ingresos/inversiones/notas."""
    q = (query or "").strip().lower()
    if not q:
        raise ValueError("query vacía")
    if kind and kind not in ("expense", "income", "investment", "note"):
        kind = None
    if period not in ("month", "year", "all"):
        period = "month"
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if period == "month":
        prefix = now.strftime("%Y-%m")
    elif period == "year":
        prefix = now.strftime("%Y")
    else:
        prefix = ""

    limit = max(1, min(int(limit or 12), 40))
    data = load_data()
    hits = []
    totals = {}

    def _match(*parts):
        return q in " ".join(str(p or "") for p in parts).lower()

    def _add_total(currency, amount):
        cur = currency or "COP"
        totals[cur] = totals.get(cur, 0.0) + float(amount or 0)

    if kind in (None, "expense"):
        for row in data.get("expenses") or []:
            if prefix and not str(row.get("date") or "").startswith(prefix):
                continue
            if not _match(row.get("description"), row.get("category"), row.get("payment_method")):
                continue
            hits.append(
                {
                    "kind": "expense",
                    "id": row.get("id"),
                    "date": row.get("date"),
                    "label": row.get("description") or row.get("category") or "Gasto",
                    "amount": row.get("amount"),
                    "currency": row.get("currency") or "COP",
                    "category": row.get("category"),
                }
            )
            _add_total(row.get("currency"), row.get("amount"))

    if kind in (None, "income"):
        for row in data.get("incomes") or []:
            if prefix and not str(row.get("date") or "").startswith(prefix):
                continue
            if not _match(
                row.get("description"), row.get("category"), row.get("income_source")
            ):
                continue
            hits.append(
                {
                    "kind": "income",
                    "id": row.get("id"),
                    "date": row.get("date"),
                    "label": row.get("description") or row.get("category") or "Ingreso",
                    "amount": row.get("amount"),
                    "currency": row.get("currency") or "COP",
                    "category": row.get("category"),
                }
            )
            _add_total(row.get("currency"), row.get("amount"))

    if kind in (None, "investment"):
        for row in data.get("investments") or []:
            if prefix and not str(row.get("date") or "").startswith(prefix):
                continue
            if not _match(row.get("asset"), row.get("notes"), row.get("category"), row.get("description")):
                continue
            hits.append(
                {
                    "kind": "investment",
                    "id": row.get("id"),
                    "date": row.get("date"),
                    "label": row.get("asset") or row.get("notes") or "Inversión",
                    "amount": row.get("amount"),
                    "currency": row.get("currency") or "USD",
                    "category": row.get("category"),
                }
            )
            _add_total(row.get("currency"), row.get("amount"))

    if kind in (None, "note"):
        for row in data.get("notes") or []:
            if prefix and not str(row.get("date") or row.get("created_at") or "").startswith(prefix):
                continue
            tags = " ".join(row.get("tags") or [])
            if not _match(row.get("text"), tags):
                continue
            hits.append(
                {
                    "kind": "note",
                    "id": row.get("id"),
                    "date": row.get("date") or (row.get("created_at") or "")[:10],
                    "label": (row.get("text") or "Nota")[:80],
                    "amount": None,
                    "currency": None,
                    "category": None,
                }
            )

    hits.sort(key=lambda h: h.get("date") or "", reverse=True)
    trimmed = hits[:limit]
    return {
        "query": q,
        "kind": kind,
        "period": period,
        "count": len(hits),
        "shown": len(trimmed),
        "totals": {k: round(v, 2) for k, v in totals.items()},
        "hits": deepcopy(trimmed),
    }


RESET_DATA = {
    "settings": {"currency": "COP"},
    "categories": deepcopy(DEFAULT_CATEGORIES),
    "accounts": [],
    "expenses": [],
    "incomes": [],
    "investments": [],
    "investment_assets": [],
    "notes": [],
    "transfers": [],
    "financial_profile": deepcopy(DEFAULT_FINANCIAL_PROFILE),
    "goals": [],
    "chat_threads": [],
    "chat_messages": [],
    "memory_facts": [],
    "memory_summaries": [],
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
        if "goal_id" in updates:
            account["goal_id"] = _normalize_goal_id(updates.get("goal_id"), data)
        if "role" in updates and updates["role"] is not None:
            account["role"] = _normalize_account_role(updates["role"])
        if account.get("goal_id") and account.get("role") == "general":
            account["role"] = "goal"
        save_data(data)
        return account
    return None


def delete_account(account_id):
    data = load_data()
    before = len(data["accounts"])
    data["accounts"] = [a for a in data["accounts"] if a["id"] != account_id]
    if len(data["accounts"]) == before:
        return False
    for key in ("expenses", "incomes", "investments", "notes"):
        for item in data[key]:
            if item.get("account_id") == account_id:
                item["account_id"] = None
    save_data(data)
    return True


def add_transfer(transfer_input, *, data=None, persist=True):
    """Transfer interno entre cuentas (ajusta saldos; no crea gasto/ingreso)."""
    if data is None:
        data = load_data()
    from_id = transfer_input.get("from_account_id")
    to_id = transfer_input.get("to_account_id")
    if not from_id or not to_id:
        raise ValueError("from_account_id y to_account_id son obligatorios")
    if from_id == to_id:
        raise ValueError("origen y destino deben ser distintos")
    amount = float(transfer_input.get("amount") or 0)
    if amount <= 0:
        raise ValueError("amount debe ser > 0")
    currency = transfer_input.get("currency") or "COP"
    accounts_by_id = {a["id"]: a for a in data["accounts"]}
    src = accounts_by_id.get(from_id)
    dst = accounts_by_id.get(to_id)
    if not src or not dst:
        raise ValueError("cuenta de origen o destino no encontrada")
    if src.get("currency") != currency or dst.get("currency") != currency:
        raise ValueError("la moneda del transfer debe coincidir con ambas cuentas")
    goal_id = transfer_input.get("goal_id")
    if goal_id in ("", None):
        goal_id = None
    elif not any(g.get("id") == goal_id for g in (data.get("goals") or [])):
        goal_id = None
    transfer = {
        "id": _next_id("transfer", data.setdefault("transfers", [])),
        "from_account_id": from_id,
        "to_account_id": to_id,
        "amount": round(amount, 2),
        "currency": currency,
        "date": transfer_input.get("date") or _today(),
        "goal_id": goal_id,
        "label": (transfer_input.get("label") or "").strip() or "Transferencia",
        "source": transfer_input.get("source") or "manual",
        "created_at": _now_iso(),
    }
    data["transfers"].append(transfer)
    _apply_balance_delta(data, from_id, amount, currency, subtract=True)
    _apply_balance_delta(data, to_id, amount, currency, subtract=False)
    if persist:
        save_data(data)
    return deepcopy(transfer)


def find_expense(expense_id):
    for expense in load_data()["expenses"]:
        if expense["id"] == expense_id:
            return expense
    return None


def find_income(income_id):
    for income in load_data()["incomes"]:
        if income["id"] == income_id:
            return income
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
    with _DATA_LOCK:
        data = _load_data_unlocked()
        for expense in data["expenses"]:
            if expense["id"] != expense_id:
                continue
            _revert_cash_effect(data, _cash_effect("expense", expense))
            for key in ("date", "account_id", "currency", "category", "category_emoji", "description", "payment_method"):
                if key in updates:
                    expense[key] = updates[key]
            if "amount" in updates and updates["amount"] is not None:
                expense["amount"] = float(updates["amount"])
            _apply_cash_effect(data, _cash_effect("expense", expense))
            _save_data_unlocked(data)
            return expense
        return None


def delete_expense(expense_id):
    with _DATA_LOCK:
        data = _load_data_unlocked()
        for expense in data["expenses"]:
            if expense["id"] != expense_id:
                continue
            _revert_cash_effect(data, _cash_effect("expense", expense))
            data["expenses"] = [e for e in data["expenses"] if e["id"] != expense_id]
            _save_data_unlocked(data)
            return True
        return False


def update_income(income_id, updates):
    with _DATA_LOCK:
        data = _load_data_unlocked()
        for income in data["incomes"]:
            if income["id"] != income_id:
                continue
            _revert_cash_effect(data, _cash_effect("income", income))
            for key in ("date", "account_id", "currency", "category", "category_emoji", "description", "income_source"):
                if key in updates:
                    income[key] = updates[key]
            if "amount" in updates and updates["amount"] is not None:
                income["amount"] = float(updates["amount"])
            _apply_cash_effect(data, _cash_effect("income", income))
            _save_data_unlocked(data)
            return income
        return None


def delete_income(income_id):
    with _DATA_LOCK:
        data = _load_data_unlocked()
        for income in data["incomes"]:
            if income["id"] != income_id:
                continue
            _revert_cash_effect(data, _cash_effect("income", income))
            data["incomes"] = [i for i in data["incomes"] if i["id"] != income_id]
            _save_data_unlocked(data)
            return True
        return False


def update_investment(investment_id, updates):
    with _DATA_LOCK:
        data = _load_data_unlocked()
        for investment in data["investments"]:
            if investment["id"] != investment_id:
                continue
            _revert_cash_effect(data, _cash_effect("investment", investment))
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
            if "asset" in updates or "asset_type" in updates:
                from services.quote_symbol import infer_asset_type

                investment["asset_type"] = infer_asset_type(
                    investment.get("asset") or "",
                    investment.get("asset_type"),
                )
            _normalize_investment_ledger(investment)
            _apply_cash_effect(data, _cash_effect("investment", investment))
            _save_data_unlocked(data)
            return investment
        return None


def delete_investment(investment_id):
    with _DATA_LOCK:
        data = _load_data_unlocked()
        for investment in data["investments"]:
            if investment["id"] != investment_id:
                continue
            _revert_cash_effect(data, _cash_effect("investment", investment))
            data["investments"] = [i for i in data["investments"] if i["id"] != investment_id]
            _save_data_unlocked(data)
            return True
        return False


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


def _apply_balance_delta(data, account_id, amount, currency, *, subtract):
    """Ajusta saldo in-place sobre `data` (sin load/save)."""
    if not account_id:
        return
    try:
        delta = float(amount)
    except (TypeError, ValueError):
        return
    for account in data["accounts"]:
        if account["id"] == account_id and account.get("currency") == currency:
            balance = float(account.get("current_balance") or 0)
            account["current_balance"] = round(balance - delta if subtract else balance + delta, 2)
            return


def _cash_effect(kind, record):
    """Efecto de caja: (account_id, amount, currency, subtract) o None.

    Misma regla que al crear: gasto resta, ingreso suma, compra de inversión resta.
    """
    account_id = record.get("account_id")
    if not account_id:
        return None
    try:
        amount = float(record.get("amount"))
    except (TypeError, ValueError):
        return None
    if kind == "expense":
        return (account_id, amount, record.get("currency") or "COP", True)
    if kind == "income":
        return (account_id, amount, record.get("currency") or "COP", False)
    if kind == "investment":
        action = record.get("action") or record.get("operation_type") or "buy"
        if action == "buy":
            return (account_id, amount, record.get("currency") or "USD", True)
        return None
    return None


def _apply_cash_effect(data, effect):
    if not effect:
        return
    account_id, amount, currency, subtract = effect
    _apply_balance_delta(data, account_id, amount, currency, subtract=subtract)


def _revert_cash_effect(data, effect):
    if not effect:
        return
    account_id, amount, currency, subtract = effect
    _apply_balance_delta(data, account_id, amount, currency, subtract=not subtract)


def add_expense(expense_input, source="manual"):
    with _DATA_LOCK:
        data = _load_data_unlocked()
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
        _apply_cash_effect(data, _cash_effect("expense", expense))
        _save_data_unlocked(data)
        return expense


def add_income(income_input, source="manual"):
    with _DATA_LOCK:
        data = _load_data_unlocked()
        income = {
            "id": _next_id("income", data["incomes"]),
            "date": income_input.get("date") or _today(),
            "account_id": income_input.get("account_id"),
            "amount": float(income_input.get("amount") or 0),
            "currency": income_input.get("currency", "COP"),
            "category": income_input.get("category", "General"),
            "category_emoji": income_input.get("category_emoji", ""),
            "description": income_input.get("description", ""),
            "income_source": income_input.get("income_source", ""),
            "source": source,
            "created_at": _now_iso(),
        }
        data["incomes"].append(income)
        _apply_cash_effect(data, _cash_effect("income", income))
        _save_data_unlocked(data)
        return income


def _ledger_float(value):
    if value is None or value == "":
        return None
    return float(value)


def add_investment(investment_input, source="manual"):
    from services.quote_symbol import infer_asset_type

    with _DATA_LOCK:
        data = _load_data_unlocked()
        operation_type = investment_input.get("operation_type") or investment_input.get("action") or "buy"
        if operation_type not in INVESTMENT_OPERATION_TYPES:
            operation_type = "buy"

        amount_raw = investment_input.get("amount")
        if amount_raw is None:
            amount_raw = investment_input.get("total")
        amount = float(amount_raw or 0)
        asset = investment_input.get("asset", "")

        investment = {
            "id": _next_id("investment", data["investments"]),
            "date": investment_input.get("date") or _today(),
            "account_id": investment_input.get("account_id"),
            "asset": asset,
            "asset_type": infer_asset_type(asset, investment_input.get("asset_type")),
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
        asset_sym = (investment.get("asset") or "").strip()
        if asset_sym:
            _ensure_investment_asset_in_data(data, asset_sym)
        data["investments"].append(investment)
        _apply_cash_effect(data, _cash_effect("investment", investment))
        _save_data_unlocked(data)
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


def bulk_add_incomes(rows, source="import"):
    created = []
    for row in rows:
        payload = {k: v for k, v in row.items() if k not in ("row_index", "warnings", "needs_review")}
        created.append(add_income(payload, source=source))
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
    """Guarda movimientos desde items[] o {expenses, incomes, investments, notes}."""
    items = _normalize_confirm_payload(payload)
    saved = {"expenses": 0, "incomes": 0, "investments": 0, "notes": 0}
    created = {"expenses": [], "incomes": [], "investments": [], "notes": []}
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
            cat_kind = kind if kind in ("expense", "income", "investment") else "general"
            add_category(
                item["suggested_new_category"],
                item.get("category_emoji", ""),
                kind=cat_kind,
            )

        if kind == "expense":
            created["expenses"].append(add_expense(data, source="ai"))
            saved["expenses"] += 1
        elif kind == "income":
            created["incomes"].append(add_income(data, source="ai"))
            saved["incomes"] += 1
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
    for inc in payload.get("incomes") or []:
        items.append({**inc, "kind": "income"})
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


def build_summary(data=None):
    data = data if data is not None else load_data()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    month_prefix = now.strftime("%Y-%m")

    monthly_expenses = {}
    for exp in data["expenses"]:
        if exp["date"].startswith(month_prefix):
            cur = exp.get("currency", "COP")
            monthly_expenses[cur] = monthly_expenses.get(cur, 0) + exp["amount"]

    monthly_incomes = {}
    for inc in data["incomes"]:
        if inc["date"].startswith(month_prefix):
            cur = inc.get("currency", "COP")
            monthly_incomes[cur] = monthly_incomes.get(cur, 0) + inc["amount"]

    investments_total = {}
    for inv in data["investments"]:
        cur = inv.get("currency", "USD")
        investments_total[cur] = investments_total.get(cur, 0) + inv["amount"]

    balances_by_currency = {}
    for account in data["accounts"]:
        cur = account.get("currency", "COP")
        balances_by_currency[cur] = balances_by_currency.get(cur, 0) + account.get("current_balance", 0)

    total_movements = len(data["expenses"]) + len(data["incomes"]) + len(data["investments"]) + len(data["notes"])
    last_note_row = max(data["notes"], key=lambda n: n["created_at"], default=None)
    last_note = last_note_row["text"] if last_note_row else "Sin notas todavía"

    def fmt_map(m):
        return {k: format_amount(v, k) for k, v in m.items()} if m else {}

    return {
        "monthly_expenses": fmt_map(monthly_expenses) or {"COP": format_amount(0, "COP")},
        "monthly_incomes": fmt_map(monthly_incomes) or {"COP": format_amount(0, "COP")},
        "investments_total": fmt_map(investments_total) or {"USD": format_amount(0, "USD")},
        "balances_by_currency": fmt_map(balances_by_currency) or {},
        "total_movements": total_movements,
        "total_accounts": len(data["accounts"]),
        "last_note": last_note,
        "status": "Actualizado hoy" if total_movements else "Delfos está listo para empezar",
        "has_data": total_movements > 0 or len(data["accounts"]) > 0,
    }


def get_accounts_view(data=None):
    data = data if data is not None else load_data()
    goals_by_id = {g["id"]: g for g in (data.get("goals") or []) if g.get("id")}
    views = []
    for account in data["accounts"]:
        balance = account.get("current_balance", 0)
        goal_id = account.get("goal_id")
        goal = goals_by_id.get(goal_id) if goal_id else None
        views.append(
            {
                **account,
                "goal_id": goal_id or None,
                "role": account.get("role") or "general",
                "goal_title": (goal.get("title") if goal else None),
                "type_label": ACCOUNT_TYPES.get(account.get("type"), account.get("type", "")),
                "movement_count": count_movements_for_account(account["id"], data),
                "balance_display": format_amount(balance, account.get("currency", "COP")),
                "is_negative": balance < 0,
            }
        )
    return views


def _enrich_goal(goal, accounts, base_currency="COP"):
    """Vista de meta: current_amount = suma de cuentas enlazadas (moneda base)."""
    goal_id = goal.get("id")
    linked = [a for a in accounts if a.get("goal_id") == goal_id]
    current = 0.0
    for acc in linked:
        if (acc.get("currency") or "COP") != base_currency:
            continue
        current += float(acc.get("current_balance") or 0)
    return {
        **deepcopy(goal),
        "current_amount": round(current, 2),
        "linked_account_ids": [a["id"] for a in linked],
        "linked_account_names": [a.get("name") or a["id"] for a in linked],
    }


def _record_day(row):
    """YYYY-MM-DD de negocio; fallback a created_at / hoy."""
    raw = str(row.get("date") or row.get("created_at") or _today())
    return raw[:10] if len(raw) >= 10 else _today()


def _build_movement_items(data):
    accounts_by_id = {a["id"]: a for a in data["accounts"]}
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
                "account_name": (accounts_by_id.get(exp.get("account_id")) or {}).get("name"),
                # ISO para filtros Desde/Hasta (antes "%d %b" rompía la comparación)
                "date": _record_day(exp),
                "created_at": exp["created_at"],
            }
        )

    for inc in data["incomes"]:
        items.append(
            {
                "id": inc["id"],
                "type": "income",
                "type_label": "Ingreso",
                "icon": "income",
                "description": inc.get("description") or inc.get("category", ""),
                "amount": format_amount(inc["amount"], inc.get("currency", "COP")),
                "category": inc.get("category"),
                "category_emoji": inc.get("category_emoji", ""),
                "account_id": inc.get("account_id"),
                "account_name": (accounts_by_id.get(inc.get("account_id")) or {}).get("name"),
                "date": _record_day(inc),
                "created_at": inc["created_at"],
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
                "account_name": (accounts_by_id.get(inv.get("account_id")) or {}).get("name"),
                "date": _record_day(inv),
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
                "account_name": (accounts_by_id.get(note.get("account_id")) or {}).get("name"),
                "date": _record_day(note),
                "created_at": note["created_at"],
            }
        )

    items.sort(key=lambda x: (x["date"], x["created_at"]), reverse=True)
    return items


def get_movements(limit=12, data=None):
    """Preview corto para /api/finance (dashboard). Lista filtrable → list_movements."""
    data = data if data is not None else load_data()
    return _build_movement_items(data)[:limit]


def list_movements(
    *,
    date_from=None,
    date_to=None,
    kind=None,
    q=None,
    page=1,
    page_size=25,
    data=None,
):
    """Ledger completo con filtros de servidor y paginación."""
    data = data if data is not None else load_data()
    items = _build_movement_items(data)

    date_from = (str(date_from).strip()[:10] if date_from else "") or ""
    date_to = (str(date_to).strip()[:10] if date_to else "") or ""
    kind = (str(kind).strip().lower() if kind else "") or ""
    q = (str(q).strip().lower() if q else "") or ""

    if kind and kind != "all":
        items = [m for m in items if m.get("type") == kind]
    if date_from:
        items = [m for m in items if (m.get("date") or "") >= date_from]
    if date_to:
        items = [m for m in items if (m.get("date") or "") <= date_to]
    if q:
        items = [
            m
            for m in items
            if q
            in " ".join(
                [
                    str(m.get("description") or ""),
                    str(m.get("category") or ""),
                    str(m.get("account_name") or ""),
                    str(m.get("type_label") or ""),
                ]
            ).lower()
        ]

    try:
        page_size = int(page_size)
    except (TypeError, ValueError):
        page_size = 25
    page_size = max(1, min(page_size, 100))
    try:
        page = int(page)
    except (TypeError, ValueError):
        page = 1
    page = max(1, page)

    total = len(items)
    start = (page - 1) * page_size
    if start >= total and total > 0:
        page = max(1, (total + page_size - 1) // page_size)
        start = (page - 1) * page_size
    page_items = items[start : start + page_size]
    return {
        "items": page_items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def _parse_expense_date(exp):
    return _record_day(exp)


def get_chart_data(data=None):
    data = data if data is not None else load_data()
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


def get_movement_filters():
    return list(MOVEMENT_FILTERS)


def get_finance_payload():
    data = load_data()
    return {
        "summary": build_summary(data),
        "accounts": get_accounts_view(data),
        "movements": get_movements(data=data),
        "movement_filters": get_movement_filters(),
        "categories": data.get("categories", []),
        "expenses": data["expenses"],
        "incomes": data["incomes"],
        "investments": data["investments"],
        "investment_assets": data.get("investment_assets", []),
        "notes": data["notes"],
        "transfers": deepcopy(data.get("transfers") or []),
        "charts": get_chart_data(data),
        "financial_profile": deepcopy(data["financial_profile"]),
        "goals": get_goals(data),
        "assistant_kpis": _assistant_kpis_safe(),
    }


def _assistant_kpis_safe():
    """KPIs Fase 2; nunca tumba /api/finance si falla un cálculo."""
    try:
        from services import assistant_service

        return assistant_service.build_kpis()
    except Exception:
        return None


def _optional_float(value):
    if value is None or value == "":
        return None
    return float(value)


def _optional_percent(value):
    if value is None or value == "":
        return None
    n = float(value)
    if n < 0 or n > 100:
        raise ValueError("El porcentaje debe estar entre 0 y 100")
    return n


def _optional_payday_day(value):
    if value is None or value == "":
        return None
    n = int(float(value))
    if n < 1 or n > 28:
        raise ValueError("income_payday_day debe ser un día entre 1 y 28")
    return n


def _optional_pay_frequency(value):
    if value is None or value == "":
        return "monthly"
    s = str(value).strip().lower()
    if s not in PAY_FREQUENCIES:
        raise ValueError("pay_frequency debe ser monthly, biweekly o weekly")
    return s


def _optional_payday_weekday(value):
    """0=lunes … 6=domingo, o null."""
    if value is None or value == "":
        return None
    n = int(float(value))
    if n < 0 or n > 6:
        raise ValueError("income_payday_weekday debe ser un entero entre 0 y 6")
    return n


def _optional_ym(value):
    """Token de dismiss: YYYY-MM | YYYY-MM-H1/H2 | YYYY-MM-DD, o null."""
    if value is None or value == "":
        return None
    s = str(value).strip()
    # YYYY-MM-H1 / YYYY-MM-H2 (quincena)
    if len(s) == 10 and s[7] == "-" and s[8] == "H" and s[9] in ("1", "2"):
        ym = s[:7]
        if len(ym) == 7 and ym[4] == "-" and ym[:4].isdigit() and ym[5:].isdigit():
            month = int(ym[5:])
            if 1 <= month <= 12:
                return s
        raise ValueError("income_prompt_dismissed_ym inválido")
    # YYYY-MM-DD (semana)
    if len(s) == 10 and s[4] == "-" and s[7] == "-":
        y, m, d = s[:4], s[5:7], s[8:10]
        if y.isdigit() and m.isdigit() and d.isdigit():
            month, day = int(m), int(d)
            if 1 <= month <= 12 and 1 <= day <= 31:
                return s
        raise ValueError("income_prompt_dismissed_ym inválido")
    # YYYY-MM (mes)
    if len(s) != 7 or s[4] != "-" or not (s[:4].isdigit() and s[5:].isdigit()):
        raise ValueError("income_prompt_dismissed_ym debe ser YYYY-MM")
    month = int(s[5:])
    if month < 1 or month > 12:
        raise ValueError("income_prompt_dismissed_ym debe ser YYYY-MM")
    return s


def get_financial_profile():
    return deepcopy(load_data()["financial_profile"])


def _normalize_fixed_expenses(raw):
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError("fixed_expenses debe ser una lista")
    out = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        label = (item.get("label") or item.get("name") or "").strip()
        amount = _optional_float(item.get("amount"))
        if not label or amount is None:
            continue
        out.append({"label": label[:80], "amount": amount})
    return out[:40]


def sanitize_profile_patch(raw):
    """Filtra un profile_patch del LLM a claves permitidas + valores tipados."""
    if not isinstance(raw, dict):
        return {}
    patch = {}
    for key in PROFILE_PATCH_KEYS:
        if key not in raw:
            continue
        patch[key] = raw[key]
    # Validar vía update en copia seca: aplicar lógica sin guardar
    if not patch:
        return {}
    # Normalizar en un dict resultado
    result = {}
    if "monthly_income_fixed" in patch:
        result["monthly_income_fixed"] = _optional_float(patch["monthly_income_fixed"])
    if "monthly_income_variable_avg" in patch:
        result["monthly_income_variable_avg"] = _optional_float(
            patch["monthly_income_variable_avg"]
        )
    if "monthly_fixed_expenses" in patch:
        result["monthly_fixed_expenses"] = _optional_float(patch["monthly_fixed_expenses"])
    if "fixed_expenses" in patch:
        # Lista = fuente de verdad: el total siempre es la suma (o None si vacía).
        result["fixed_expenses"] = _normalize_fixed_expenses(patch["fixed_expenses"])
        result["monthly_fixed_expenses"] = (
            round(sum(float(x["amount"]) for x in result["fixed_expenses"]), 2)
            if result["fixed_expenses"]
            else None
        )
    if "savings_target_percent" in patch:
        result["savings_target_percent"] = _optional_percent(patch["savings_target_percent"])
    if "investment_target_percent" in patch:
        result["investment_target_percent"] = _optional_percent(
            patch["investment_target_percent"]
        )
    if "cushion_percent" in patch:
        result["cushion_percent"] = _optional_percent(patch["cushion_percent"])
    if "emergency_fund_target_months" in patch:
        result["emergency_fund_target_months"] = _optional_float(
            patch["emergency_fund_target_months"]
        )
    if "pay_frequency" in patch:
        result["pay_frequency"] = _optional_pay_frequency(patch["pay_frequency"])
    if "income_payday_day" in patch:
        result["income_payday_day"] = _optional_payday_day(patch["income_payday_day"])
    if "income_payday_weekday" in patch:
        result["income_payday_weekday"] = _optional_payday_weekday(
            patch["income_payday_weekday"]
        )
    if "risk_profile" in patch:
        raw_r = patch["risk_profile"]
        if raw_r in (None, ""):
            result["risk_profile"] = None
        elif raw_r in RISK_PROFILES:
            result["risk_profile"] = raw_r
        else:
            raise ValueError("risk_profile inválido")
    if "investment_horizon" in patch:
        raw_h = patch["investment_horizon"]
        if raw_h in (None, ""):
            result["investment_horizon"] = None
        elif raw_h in INVESTMENT_HORIZONS:
            result["investment_horizon"] = raw_h
        else:
            raise ValueError("investment_horizon inválido")
    if "fiscal_country" in patch:
        country = (patch["fiscal_country"] or "").strip().upper() or None
        result["fiscal_country"] = country
    if "priorities" in patch:
        raw_p = patch["priorities"]
        if raw_p is None:
            pass  # null del LLM = no tocar
        elif isinstance(raw_p, list):
            result["priorities"] = [str(p).strip() for p in raw_p if str(p).strip()]
        elif isinstance(raw_p, str):
            result["priorities"] = [p.strip() for p in raw_p.split(",") if p.strip()]
        else:
            raise ValueError("priorities debe ser lista o texto")
    # Chat: null del modelo = "sin cambio", no borrar el perfil.
    return {k: v for k, v in result.items() if v is not None}


def update_financial_profile(updates):
    """Patch parcial del perfil. Ignora claves desconocidas."""
    data = load_data()
    profile = data["financial_profile"]
    if "monthly_income_fixed" in updates:
        profile["monthly_income_fixed"] = _optional_float(updates["monthly_income_fixed"])
    if "monthly_income_variable_avg" in updates:
        profile["monthly_income_variable_avg"] = _optional_float(
            updates["monthly_income_variable_avg"]
        )
    if "monthly_fixed_expenses" in updates:
        profile["monthly_fixed_expenses"] = _optional_float(updates["monthly_fixed_expenses"])
    if "fixed_expenses" in updates:
        # Lista = fuente de verdad: el total siempre es la suma (o None si vacía).
        profile["fixed_expenses"] = _normalize_fixed_expenses(updates["fixed_expenses"])
        profile["monthly_fixed_expenses"] = (
            round(sum(float(x.get("amount") or 0) for x in profile["fixed_expenses"]), 2)
            if profile["fixed_expenses"]
            else None
        )
    if "savings_target_percent" in updates:
        profile["savings_target_percent"] = _optional_percent(updates["savings_target_percent"])
    if "investment_target_percent" in updates:
        profile["investment_target_percent"] = _optional_percent(
            updates["investment_target_percent"]
        )
    if "cushion_percent" in updates:
        profile["cushion_percent"] = _optional_percent(updates["cushion_percent"])
    if "emergency_fund_target_months" in updates:
        profile["emergency_fund_target_months"] = _optional_float(
            updates["emergency_fund_target_months"]
        )
    if "pay_frequency" in updates:
        profile["pay_frequency"] = _optional_pay_frequency(updates["pay_frequency"])
    if "income_payday_day" in updates:
        profile["income_payday_day"] = _optional_payday_day(updates["income_payday_day"])
    if "income_payday_weekday" in updates:
        profile["income_payday_weekday"] = _optional_payday_weekday(
            updates["income_payday_weekday"]
        )
    if "income_prompt_dismissed_ym" in updates:
        profile["income_prompt_dismissed_ym"] = _optional_ym(
            updates["income_prompt_dismissed_ym"]
        )
    if "risk_profile" in updates:
        raw = updates["risk_profile"]
        if raw in (None, ""):
            profile["risk_profile"] = None
        elif raw in RISK_PROFILES:
            profile["risk_profile"] = raw
        else:
            raise ValueError("risk_profile inválido")
    if "investment_horizon" in updates:
        raw = updates["investment_horizon"]
        if raw in (None, ""):
            profile["investment_horizon"] = None
        elif raw in INVESTMENT_HORIZONS:
            profile["investment_horizon"] = raw
        else:
            raise ValueError("investment_horizon inválido")
    if "fiscal_country" in updates:
        country = (updates["fiscal_country"] or "").strip().upper() or None
        profile["fiscal_country"] = country
    if "priorities" in updates:
        raw = updates["priorities"]
        if raw is None:
            profile["priorities"] = []
        elif isinstance(raw, list):
            profile["priorities"] = [str(p).strip() for p in raw if str(p).strip()]
        elif isinstance(raw, str):
            profile["priorities"] = [p.strip() for p in raw.split(",") if p.strip()]
        else:
            raise ValueError("priorities debe ser lista o texto")
    if "onboarding_completed" in updates:
        profile["onboarding_completed"] = bool(updates["onboarding_completed"])
    profile["last_reviewed_at"] = _now_iso()
    save_data(data)
    return deepcopy(profile)


def get_goals(data=None):
    data = data if data is not None else load_data()
    goals = data.get("goals") or []
    accounts = data.get("accounts") or []
    base_currency = (data.get("settings") or {}).get("currency") or "COP"
    enriched = [_enrich_goal(g, accounts, base_currency) for g in goals]
    return sorted(enriched, key=lambda g: (g.get("priority", 99), g.get("created_at") or ""))


def add_goal(goal_input):
    title = (goal_input.get("title") or "").strip()
    if not title:
        raise ValueError("El título es obligatorio")
    gtype = (goal_input.get("type") or "custom").strip()
    if gtype not in GOAL_TYPES:
        raise ValueError("type de meta inválido")
    status = (goal_input.get("status") or "active").strip()
    if status not in GOAL_STATUSES:
        raise ValueError("status de meta inválido")
    data = load_data()
    now = _now_iso()
    goal = {
        "id": _next_id("goal", data["goals"]),
        "type": gtype,
        "title": title,
        "target_amount": _optional_float(goal_input.get("target_amount")),
        "target_date": (goal_input.get("target_date") or "").strip() or None,
        "monthly_target": _optional_float(goal_input.get("monthly_target")),
        "status": status,
        "priority": int(goal_input.get("priority") or 1),
        "notes": (goal_input.get("notes") or "").strip() or None,
        "created_at": now,
        "updated_at": now,
    }
    data["goals"].append(goal)
    save_data(data)
    return _enrich_goal(goal, data["accounts"], (data.get("settings") or {}).get("currency") or "COP")


def update_goal(goal_id, updates):
    data = load_data()
    for goal in data["goals"]:
        if goal["id"] != goal_id:
            continue
        if "title" in updates and updates["title"] is not None:
            title = str(updates["title"]).strip()
            if not title:
                raise ValueError("El título es obligatorio")
            goal["title"] = title
        if "type" in updates and updates["type"] is not None:
            gtype = str(updates["type"]).strip()
            if gtype not in GOAL_TYPES:
                raise ValueError("type de meta inválido")
            goal["type"] = gtype
        if "status" in updates and updates["status"] is not None:
            status = str(updates["status"]).strip()
            if status not in GOAL_STATUSES:
                raise ValueError("status de meta inválido")
            goal["status"] = status
        if "target_amount" in updates:
            goal["target_amount"] = _optional_float(updates["target_amount"])
        if "target_date" in updates:
            raw = updates["target_date"]
            goal["target_date"] = (str(raw).strip() if raw else "") or None
        if "monthly_target" in updates:
            goal["monthly_target"] = _optional_float(updates["monthly_target"])
        if "priority" in updates and updates["priority"] is not None:
            goal["priority"] = int(updates["priority"])
        if "notes" in updates:
            raw = updates["notes"]
            goal["notes"] = (str(raw).strip() if raw else "") or None
        goal["updated_at"] = _now_iso()
        save_data(data)
        return _enrich_goal(goal, data["accounts"], (data.get("settings") or {}).get("currency") or "COP")
    return None


def delete_goal(goal_id):
    data = load_data()
    before = len(data["goals"])
    data["goals"] = [g for g in data["goals"] if g["id"] != goal_id]
    if len(data["goals"]) == before:
        return False
    for account in data.get("accounts") or []:
        if account.get("goal_id") == goal_id:
            account["goal_id"] = None
    save_data(data)
    return True


def list_chat_threads():
    threads = load_data().get("chat_threads") or []
    return sorted(deepcopy(threads), key=lambda t: t.get("updated_at") or "", reverse=True)


def get_or_create_main_thread():
    """Un thread principal por usuario local (fluidez: no obliga a elegir hilos)."""
    data = load_data()
    threads = data.setdefault("chat_threads", [])
    for t in threads:
        if t.get("kind") == "main":
            return deepcopy(t)
    now = _now_iso()
    thread = {
        "id": _next_id("thread", threads),
        "title": "Conversación",
        "kind": "main",
        "created_at": now,
        "updated_at": now,
    }
    threads.append(thread)
    save_data(data)
    return deepcopy(thread)


def list_chat_messages(thread_id, limit=40, include_compacted=False):
    msgs = [
        m
        for m in (load_data().get("chat_messages") or [])
        if m.get("thread_id") == thread_id
    ]
    if not include_compacted:
        msgs = [m for m in msgs if not (m.get("meta") or {}).get("compacted")]
    msgs.sort(key=lambda m: m.get("created_at") or "")
    if limit and len(msgs) > limit:
        msgs = msgs[-limit:]
    return deepcopy(msgs)


def mark_chat_messages_compacted(thread_id, message_ids):
    """Marca mensajes viejos como compactados (salen del contexto y del UI)."""
    ids = {str(x) for x in (message_ids or []) if x}
    if not ids:
        return 0
    data = load_data()
    n = 0
    for m in data.get("chat_messages") or []:
        if m.get("thread_id") != thread_id or m.get("id") not in ids:
            continue
        meta = m.setdefault("meta", {})
        if meta.get("compacted"):
            continue
        meta["compacted"] = True
        n += 1
    if n:
        save_data(data)
    return n


def append_chat_message(thread_id, role, content, meta=None):
    content = (content or "").strip()
    if not content:
        raise ValueError("Mensaje vacío")
    if role not in ("user", "assistant", "system"):
        raise ValueError("role inválido")
    data = load_data()
    threads = data.get("chat_threads") or []
    thread = next((t for t in threads if t["id"] == thread_id), None)
    if not thread:
        raise ValueError("Thread no encontrado")
    now = _now_iso()
    msg = {
        "id": _next_id("msg", data.setdefault("chat_messages", [])),
        "thread_id": thread_id,
        "role": role,
        "content": content,
        "meta": meta or {},
        "created_at": now,
    }
    data["chat_messages"].append(msg)
    thread["updated_at"] = now
    save_data(data)
    return deepcopy(msg)


def list_memory_facts(limit=12):
    facts = [f for f in (load_data().get("memory_facts") or []) if f.get("active", True)]
    facts.sort(key=lambda f: f.get("created_at") or "", reverse=True)
    return deepcopy(facts[:limit])


def get_memory_summary():
    rows = load_data().get("memory_summaries") or []
    if not rows:
        return None
    rows = sorted(rows, key=lambda r: r.get("updated_at") or "", reverse=True)
    return deepcopy(rows[0].get("summary"))


def upsert_memory_facts(updates):
    """Aplica memory_updates del LLM: lista de {fact, category?}."""
    if not updates:
        return
    data = load_data()
    facts = data.setdefault("memory_facts", [])
    now = _now_iso()
    for raw in updates:
        if not isinstance(raw, dict):
            continue
        text = (raw.get("fact") or raw.get("text") or "").strip()
        if not text:
            continue
        facts.append(
            {
                "id": _next_id("fact", facts),
                "fact": text[:400],
                "category": (raw.get("category") or "general").strip() or "general",
                "source": "chat",
                "active": True,
                "created_at": now,
            }
        )
    # ponytail: techo 80 hechos activos; archiva viejos
    actives = [f for f in facts if f.get("active", True)]
    if len(actives) > 80:
        actives.sort(key=lambda f: f.get("created_at") or "")
        for old in actives[:-80]:
            old["active"] = False
    save_data(data)


def touch_memory_summary(summary_text, max_len=1200):
    text = (summary_text or "").strip()
    if not text:
        return
    max_len = max(200, int(max_len or 1200))
    clipped = text[:max_len]
    data = load_data()
    rows = data.setdefault("memory_summaries", [])
    now = _now_iso()
    if rows:
        rows[0]["summary"] = clipped
        rows[0]["updated_at"] = now
    else:
        rows.append(
            {
                "id": "summary_001",
                "scope": "global",
                "summary": clipped,
                "updated_at": now,
            }
        )
    save_data(data)
