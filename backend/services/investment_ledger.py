"""Export/import investment ledger aligned with Inversiones 2025.xlsx."""

import csv
import io
from datetime import datetime, timedelta
from typing import Any

from openpyxl import Workbook

from services import finance_store

CSV_HEADER = [
    "Tipo de Operación",
    "Fecha",
    "Activo",
    "Cantidad",
    "Monto USD",
    "Monto COP",
    "Precio Unitario",
    "Costo de Cierre",
    "Ganancia/Pérdida USD",
    "Total",
]

SHEET_NAME = "Inversiones - Tabla Central"

OPERATION_TYPE_TO_LABEL = {
    "deposit": "Depósito",
    "buy": "Compra",
    "sell": "Venta",
    "dividend": "Dividendo",
}

LABEL_TO_OPERATION_TYPE = {
    "depósito": "deposit",
    "deposito": "deposit",
    "deposit": "deposit",
    "compra": "buy",
    "buy": "buy",
    "venta": "sell",
    "sell": "sell",
    "dividendo": "dividend",
    "dividend": "dividend",
}

VALID_OPERATION_TYPES = frozenset(OPERATION_TYPE_TO_LABEL)


def normalize_investment(inv: dict) -> dict:
    return finance_store._normalize_investment_ledger(dict(inv))


def excel_serial_to_iso(serial: float | int) -> str:
    base = datetime(1899, 12, 30)
    return (base + timedelta(days=float(serial))).strftime("%Y-%m-%d")


def parse_date(value: Any) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, (int, float)):
        return excel_serial_to_iso(value)
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text[:10], fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")[:19]).strftime("%Y-%m-%d")
    except ValueError:
        pass
    try:
        return excel_serial_to_iso(float(text))
    except ValueError:
        return None


def parse_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace("$", "").replace(" ", "")
    if not text:
        return None
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def normalize_operation_type(value: Any) -> str:
    if not value:
        return "buy"
    key = str(value).strip().lower()
    return LABEL_TO_OPERATION_TYPE.get(key, key if key in VALID_OPERATION_TYPES else "buy")


def operation_type_label(operation_type: str | None) -> str:
    return OPERATION_TYPE_TO_LABEL.get(operation_type or "buy", operation_type or "Compra")


def _ledger_row_from_investment(inv: dict) -> list[Any]:
    normalized = normalize_investment(inv)
    return [
        operation_type_label(normalized.get("operation_type")),
        normalized.get("date") or "",
        normalized.get("asset") or "",
        normalized.get("quantity"),
        normalized.get("amount_usd"),
        normalized.get("amount_cop"),
        normalized.get("unit_price"),
        normalized.get("closing_cost"),
        normalized.get("pnl_usd"),
        normalized.get("total"),
    ]


def ledger_row_to_investment_input(row: dict[str, Any]) -> dict[str, Any]:
    operation_type = normalize_operation_type(
        row.get("operation_type") or row.get("Tipo de Operación") or row.get("tipo")
    )
    date = parse_date(row.get("date") or row.get("Fecha") or row.get("fecha"))
    asset = str(row.get("asset") or row.get("Activo") or row.get("activo") or "").strip()
    quantity = parse_number(row.get("quantity") or row.get("Cantidad") or row.get("cantidad"))
    amount_usd = parse_number(row.get("amount_usd") or row.get("Monto USD") or row.get("monto_usd"))
    amount_cop = parse_number(row.get("amount_cop") or row.get("Monto COP") or row.get("monto_cop"))
    unit_price = parse_number(row.get("unit_price") or row.get("Precio Unitario") or row.get("precio_unitario"))
    closing_cost = parse_number(
        row.get("closing_cost") or row.get("Costo de Cierre") or row.get("costo_cierre")
    )
    pnl_usd = parse_number(
        row.get("pnl_usd") or row.get("Ganancia/Pérdida USD") or row.get("ganancia_perdida_usd")
    )
    total = parse_number(row.get("total") or row.get("Total"))

    amount = total or amount_usd or 0.0
    return {
        "operation_type": operation_type,
        "action": operation_type if operation_type in ("buy", "sell") else "buy",
        "date": date,
        "asset": asset,
        "quantity": quantity,
        "amount_usd": amount_usd,
        "amount_cop": amount_cop,
        "unit_price": unit_price,
        "closing_cost": closing_cost,
        "pnl_usd": pnl_usd,
        "total": total,
        "amount": amount,
        "currency": "USD",
    }


def normalize_ocr_row_fields(row: dict[str, Any]) -> dict[str, Any]:
    normalized = ledger_row_to_investment_input(row)
    normalized["operation_type_label"] = operation_type_label(normalized.get("operation_type"))
    return normalized


def _sorted_investments(investments: list[dict] | None = None) -> list[dict]:
    items = investments if investments is not None else finance_store.load_data()["investments"]
    return sorted(items, key=lambda inv: (inv.get("date") or "", inv.get("created_at") or ""))


def export_csv(investments: list[dict] | None = None) -> str:
    buffer = io.StringIO()
    buffer.write("\ufeff")
    writer = csv.writer(buffer)
    writer.writerow(CSV_HEADER)
    for inv in _sorted_investments(investments):
        writer.writerow(_ledger_row_from_investment(inv))
    return buffer.getvalue()


def export_xlsx(investments: list[dict] | None = None) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = SHEET_NAME
    ws.append(CSV_HEADER)
    for inv in _sorted_investments(investments):
        ws.append(_ledger_row_from_investment(inv))
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def import_rows(csv_text: str) -> dict[str, Any]:
    if csv_text.startswith("\ufeff"):
        csv_text = csv_text[1:]
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        return {"rows": [], "count": 0, "warnings": ["CSV vacío o sin encabezados"]}

    warnings: list[str] = []
    rows: list[dict[str, Any]] = []
    for i, raw in enumerate(reader, start=2):
        if not any(v and str(v).strip() for v in raw.values()):
            continue
        mapped = {k.strip(): v for k, v in raw.items() if k}
        investment_input = ledger_row_to_investment_input(mapped)
        if not investment_input.get("date"):
            warnings.append(f"Fila {i}: fecha inválida o vacía")
        rows.append(investment_input)

    return {"rows": rows, "count": len(rows), "warnings": warnings, "preview": rows}


def import_csv(csv_text: str, *, confirm: bool = False) -> dict[str, Any]:
    preview = import_rows(csv_text)
    if not confirm:
        return preview
    created = finance_store.bulk_add_investments(preview["rows"], source="import")
    return {
        "count": len(created),
        "warnings": preview.get("warnings", []),
        "created": created,
    }


def confirm_ledger_rows(rows: list[dict[str, Any]], *, source: str = "ocr") -> list[dict]:
    inputs = [ledger_row_to_investment_input(row) for row in rows]
    return finance_store.bulk_add_investments(inputs, source=source)
