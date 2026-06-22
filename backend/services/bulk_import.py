"""Shared CSV bulk import for expenses, notes, and accounts.

CSV formats (UTF-8 with optional BOM for Excel on Windows):

Expenses:
  Fecha,Cuenta,Monto,Moneda,Categoría,Emoji,Descripción,Método de pago

Notes:
  Fecha,Cuenta,Texto,Tags

Accounts (optional):
  Nombre,Tipo,Moneda,Saldo inicial,Emoji
"""

from __future__ import annotations

import csv
import io
from typing import Any

from services import finance_store
from services.investment_ledger import parse_date, parse_number

EXPENSE_CSV_HEADER = [
    "Fecha",
    "Cuenta",
    "Monto",
    "Moneda",
    "Categoría",
    "Emoji",
    "Descripción",
    "Método de pago",
]

NOTE_CSV_HEADER = [
    "Fecha",
    "Cuenta",
    "Texto",
    "Tags",
]

ACCOUNT_CSV_HEADER = [
    "Nombre",
    "Tipo",
    "Moneda",
    "Saldo inicial",
    "Emoji",
]

ACCOUNT_TYPE_ALIASES = {
    "efectivo": "cash",
    "cash": "cash",
    "banco": "bank",
    "bank": "bank",
    "tarjeta crédito": "credit_card",
    "tarjeta credito": "credit_card",
    "credit_card": "credit_card",
    "tarjeta débito": "debit_card",
    "tarjeta debito": "debit_card",
    "debit_card": "debit_card",
    "billetera": "wallet",
    "wallet": "wallet",
    "broker": "broker",
    "cripto": "crypto",
    "crypto": "crypto",
    "ahorros": "savings",
    "savings": "savings",
    "otro": "other",
    "other": "other",
}


def strip_bom(csv_text: str) -> str:
    if csv_text.startswith("\ufeff"):
        return csv_text[1:]
    return csv_text


def read_csv_rows(csv_text: str) -> tuple[list[dict[str, Any]], list[str]]:
    """Parse CSV text into row dicts with stripped keys."""
    csv_text = strip_bom(csv_text)
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        return [], ["CSV vacío o sin encabezados"]
    warnings: list[str] = []
    rows: list[dict[str, Any]] = []
    for i, raw in enumerate(reader, start=2):
        if not any(v and str(v).strip() for v in raw.values()):
            continue
        mapped = {k.strip(): v for k, v in raw.items() if k}
        mapped["_row_index"] = i
        rows.append(mapped)
    return rows, warnings


def _field(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in row and row[key] not in (None, ""):
            return row[key]
    return None


def _resolve_account_id(account_hint: Any) -> str | None:
    if not account_hint or not str(account_hint).strip():
        return None
    return finance_store.match_account_hint(str(account_hint).strip())


def _resolve_category(name: Any, emoji: Any = None) -> tuple[str, str]:
    text = str(name or "").strip() or "General"
    cat = finance_store.find_category_by_name(text, kind="expense")
    if cat:
        return cat["name"], cat.get("emoji") or ""
    return text, str(emoji or "").strip()


def _parse_tags(value: Any) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return [str(t).strip() for t in value if str(t).strip()]
    return [t.strip() for t in str(value).split(",") if t.strip()]


def expense_row_to_input(row: dict[str, Any]) -> dict[str, Any]:
    amount = parse_number(_field(row, "Monto", "monto", "amount"))
    currency = str(_field(row, "Moneda", "moneda", "currency") or "COP").strip().upper()
    category_name, category_emoji = _resolve_category(
        _field(row, "Categoría", "Categoria", "categoria", "category"),
        _field(row, "Emoji", "emoji", "category_emoji"),
    )
    return {
        "date": parse_date(_field(row, "Fecha", "fecha", "date")),
        "account_id": _resolve_account_id(_field(row, "Cuenta", "cuenta", "account", "account_name")),
        "amount": amount,
        "currency": currency,
        "category": category_name,
        "category_emoji": category_emoji,
        "description": str(_field(row, "Descripción", "Descripcion", "descripcion", "description") or "").strip(),
        "payment_method": str(
            _field(row, "Método de pago", "Metodo de pago", "metodo_pago", "payment_method") or ""
        ).strip(),
    }


def note_row_to_input(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "date": parse_date(_field(row, "Fecha", "fecha", "date")),
        "account_id": _resolve_account_id(_field(row, "Cuenta", "cuenta", "account", "account_name")),
        "text": str(_field(row, "Texto", "texto", "text") or "").strip(),
        "tags": _parse_tags(_field(row, "Tags", "tags", "Etiquetas", "etiquetas")),
    }


def account_row_to_input(row: dict[str, Any]) -> dict[str, Any]:
    type_raw = str(_field(row, "Tipo", "tipo", "type") or "other").strip().lower()
    account_type = ACCOUNT_TYPE_ALIASES.get(type_raw, type_raw if type_raw in finance_store.ACCOUNT_TYPES else "other")
    return {
        "name": str(_field(row, "Nombre", "nombre", "name") or "").strip(),
        "type": account_type,
        "currency": str(_field(row, "Moneda", "moneda", "currency") or "COP").strip().upper(),
        "initial_balance": parse_number(_field(row, "Saldo inicial", "saldo_inicial", "initial_balance")) or 0.0,
        "emoji": str(_field(row, "Emoji", "emoji") or "💰").strip() or "💰",
    }


def import_expense_rows(csv_text: str) -> dict[str, Any]:
    raw_rows, warnings = read_csv_rows(csv_text)
    rows: list[dict[str, Any]] = []
    for raw in raw_rows:
        row_index = raw.pop("_row_index", None)
        expense_input = expense_row_to_input(raw)
        if expense_input.get("amount") is None:
            warnings.append(f"Fila {row_index}: monto inválido o vacío")
        elif expense_input["amount"] <= 0:
            warnings.append(f"Fila {row_index}: monto debe ser mayor a cero")
        if not expense_input.get("date"):
            warnings.append(f"Fila {row_index}: fecha inválida o vacía (se usará hoy al confirmar)")
        rows.append(expense_input)
    return {"rows": rows, "preview": rows, "count": len(rows), "warnings": warnings}


def import_note_rows(csv_text: str) -> dict[str, Any]:
    raw_rows, warnings = read_csv_rows(csv_text)
    rows: list[dict[str, Any]] = []
    for raw in raw_rows:
        row_index = raw.pop("_row_index", None)
        note_input = note_row_to_input(raw)
        if not note_input.get("text"):
            warnings.append(f"Fila {row_index}: texto vacío (se omitirá al confirmar)")
        if not note_input.get("date"):
            warnings.append(f"Fila {row_index}: fecha inválida o vacía (se usará hoy al confirmar)")
        rows.append(note_input)
    return {"rows": rows, "preview": rows, "count": len(rows), "warnings": warnings}


def import_account_rows(csv_text: str) -> dict[str, Any]:
    raw_rows, warnings = read_csv_rows(csv_text)
    rows: list[dict[str, Any]] = []
    for raw in raw_rows:
        row_index = raw.pop("_row_index", None)
        account_input = account_row_to_input(raw)
        if not account_input.get("name"):
            warnings.append(f"Fila {row_index}: nombre de cuenta vacío (se omitirá al confirmar)")
        rows.append(account_input)
    return {"rows": rows, "preview": rows, "count": len(rows), "warnings": warnings}


def import_expenses_csv(csv_text: str, *, confirm: bool = False) -> dict[str, Any]:
    preview = import_expense_rows(csv_text)
    if not confirm:
        return preview
    valid_rows = [r for r in preview["rows"] if r.get("amount") and r["amount"] > 0]
    created = finance_store.bulk_add_expenses(valid_rows, source="import")
    return {
        "count": len(created),
        "warnings": preview.get("warnings", []),
        "created": created,
    }


def import_notes_csv(csv_text: str, *, confirm: bool = False) -> dict[str, Any]:
    preview = import_note_rows(csv_text)
    if not confirm:
        return preview
    valid_rows = [r for r in preview["rows"] if r.get("text")]
    created = finance_store.bulk_add_notes(valid_rows, source="import")
    return {
        "count": len(created),
        "warnings": preview.get("warnings", []),
        "created": created,
    }


def import_accounts_csv(csv_text: str, *, confirm: bool = False) -> dict[str, Any]:
    preview = import_account_rows(csv_text)
    if not confirm:
        return preview
    valid_rows = [r for r in preview["rows"] if r.get("name")]
    created = finance_store.bulk_add_accounts(valid_rows)
    return {
        "count": len(created),
        "warnings": preview.get("warnings", []),
        "created": created,
    }
