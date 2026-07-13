"""Export/import investment ledger aligned with Inversiones 2025.xlsx."""

import csv
import io
import re
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
    "compra mercado": "buy",
    "buy": "buy",
    "venta": "sell",
    "venta mercado": "sell",
    "sell": "sell",
    "dividendo": "dividend",
    "dividend": "dividend",
    "ajuste de efectivo": "deposit",
}

VALID_OPERATION_TYPES = frozenset(OPERATION_TYPE_TO_LABEL)

SPANISH_MONTHS = {
    "ene": 1,
    "enero": 1,
    "feb": 2,
    "febrero": 2,
    "mar": 3,
    "marzo": 3,
    "abr": 4,
    "abril": 4,
    "may": 5,
    "mayo": 5,
    "jun": 6,
    "junio": 6,
    "jul": 7,
    "julio": 7,
    "ago": 8,
    "agosto": 8,
    "sep": 9,
    "sept": 9,
    "septiembre": 9,
    "set": 9,
    "oct": 10,
    "octubre": 10,
    "nov": 11,
    "noviembre": 11,
    "dic": 12,
    "diciembre": 12,
}


def normalize_investment(inv: dict) -> dict:
    return finance_store._normalize_investment_ledger(dict(inv))


def excel_serial_to_iso(serial: float | int) -> str:
    base = datetime(1899, 12, 30)
    return (base + timedelta(days=float(serial))).strftime("%Y-%m-%d")


# ponytail: heuristic parser for common Colombian/Spanish broker date strings
# (ISO, dd/mm/yyyy, dd-mm-yyyy, "22 jun 2026", "22 de junio de 2026", month-first,
# 2-digit years, with label prefixes/trailing time). Ceiling: no English month
# names and no day/month disambiguation beyond day-first numeric. Upgrade path:
# swap in `babel`/`dateparser` if locales/ambiguous formats grow.
_ISO_RE = re.compile(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})")
_NUM_DMY_RE = re.compile(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})")
_SPANISH_DMY_RE = re.compile(
    r"(\d{1,2})[\s/-]*(?:de\s+)?([a-záéíóúñ]{3,})\.?[\s/-]*(?:de\s+)?(\d{2,4})"
)
_SPANISH_MDY_RE = re.compile(r"([a-záéíóúñ]{3,})\.?[\s/-]*(\d{1,2})[\s,/-]*(\d{2,4})")

_ACCENTS = str.maketrans("áéíóúü", "aeiouu")


def _norm_year(year: int) -> int:
    return year + 2000 if year < 100 else year


def _month_number(token: str) -> int | None:
    token = token.translate(_ACCENTS)
    return SPANISH_MONTHS.get(token) or SPANISH_MONTHS.get(token[:3])


def _build_date(year: int, month: int, day: int) -> str | None:
    try:
        return datetime(_norm_year(year), month, day).strftime("%Y-%m-%d")
    except ValueError:
        return None


def _parse_date_text(text: str) -> str | None:
    lowered = text.strip().lower()
    if not lowered:
        return None
    iso = _ISO_RE.search(lowered)
    if iso:
        built = _build_date(int(iso.group(1)), int(iso.group(2)), int(iso.group(3)))
        if built:
            return built
    dmy = _SPANISH_DMY_RE.search(lowered)
    if dmy:
        month = _month_number(dmy.group(2))
        if month:
            built = _build_date(int(dmy.group(3)), month, int(dmy.group(1)))
            if built:
                return built
    mdy = _SPANISH_MDY_RE.search(lowered)
    if mdy:
        month = _month_number(mdy.group(1))
        if month:
            built = _build_date(int(mdy.group(3)), month, int(mdy.group(2)))
            if built:
                return built
    num = _NUM_DMY_RE.search(lowered)
    if num:
        built = _build_date(int(num.group(3)), int(num.group(2)), int(num.group(1)))
        if built:
            return built
    try:
        return datetime.fromisoformat(lowered.replace("z", "+00:00")[:19]).strftime("%Y-%m-%d")
    except ValueError:
        return None


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
    parsed = _parse_date_text(text)
    if parsed:
        return parsed
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
    if key in LABEL_TO_OPERATION_TYPE:
        return LABEL_TO_OPERATION_TYPE[key]
    if key in VALID_OPERATION_TYPES:
        return key
    if "venta" in key:
        return "sell"
    if "compra" in key:
        return "buy"
    if "dividendo" in key:
        return "dividend"
    if "depósito" in key or "deposito" in key:
        return "deposit"
    return "buy"


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


def _normalize_signed_amounts(
    operation_type: str,
    total: float | None,
    amount_usd: float | None,
) -> tuple[float | None, float | None]:
    """Brokers like Hapi export negative Total on buys (cash outflow). Store positive magnitudes."""
    if operation_type == "buy":
        if total is not None and total < 0:
            total = abs(total)
        if amount_usd is not None and amount_usd < 0:
            amount_usd = abs(amount_usd)
    elif operation_type == "sell":
        if total is not None and total < 0:
            total = abs(total)
        if amount_usd is not None and amount_usd < 0:
            amount_usd = abs(amount_usd)
    return total, amount_usd


def ledger_row_to_investment_input(row: dict[str, Any]) -> dict[str, Any]:
    operation_type = normalize_operation_type(
        row.get("operation_type") or row.get("Tipo de Operación") or row.get("tipo")
    )
    date = parse_date(row.get("date") or row.get("Fecha") or row.get("fecha"))
    asset = str(row.get("asset") or row.get("Activo") or row.get("activo") or "").strip()
    quantity = parse_number(row.get("quantity") or row.get("Cantidad") or row.get("cantidad"))
    amount_usd = parse_number(row.get("amount_usd") or row.get("Monto USD") or row.get("monto_usd"))
    amount_cop = parse_number(row.get("amount_cop") or row.get("Monto COP") or row.get("monto_cop"))
    unit_price = parse_number(
        row.get("unit_price")
        or row.get("Precio Unitario")
        or row.get("precio_unitario")
        or row.get("Precio unitario")
    )
    closing_cost = parse_number(
        row.get("closing_cost") or row.get("Costo de Cierre") or row.get("costo_cierre")
    )
    pnl_usd = parse_number(
        row.get("pnl_usd") or row.get("Ganancia/Pérdida USD") or row.get("ganancia_perdida_usd")
    )
    total = parse_number(row.get("total") or row.get("Total"))

    if operation_type == "buy" and amount_usd is not None and total is None:
        fee = closing_cost or 0.0
        total = amount_usd + fee
    elif operation_type == "sell" and amount_usd is not None and total is None:
        fee = abs(closing_cost or 0.0)
        total = amount_usd - fee

    total, amount_usd = _normalize_signed_amounts(operation_type, total, amount_usd)
    amount = total or amount_usd or 0.0
    if operation_type == "buy" and amount < 0:
        amount = abs(amount)

    from services.quote_symbol import infer_asset_type

    return {
        "operation_type": operation_type,
        "action": operation_type if operation_type in ("buy", "sell") else "buy",
        "date": date,
        "asset": asset,
        "asset_type": infer_asset_type(asset, row.get("asset_type")),
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


def _amounts_close(a: float, b: float, tolerance: float = 0.02) -> bool:
    return abs(a - b) <= tolerance


def refine_ocr_row(row: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Post-process normalized OCR rows: infer missing fields and flag hallucinations."""
    warnings: list[str] = []
    refined = dict(row)
    op = refined.get("operation_type") or "buy"

    if op in ("buy", "deposit") and refined.get("pnl_usd") is not None:
        warnings.append("P/G USD eliminado: no aplica a compras o depósitos")
        refined["pnl_usd"] = None

    quantity = refined.get("quantity")
    amount_usd = refined.get("amount_usd")
    unit_price = refined.get("unit_price")
    closing_cost = refined.get("closing_cost")
    total = refined.get("total")
    amount_cop = refined.get("amount_cop")

    if quantity and amount_usd and unit_price is None and quantity != 0:
        refined["unit_price"] = amount_usd / quantity
        unit_price = refined["unit_price"]

    if op == "buy" and amount_usd is not None:
        fee = closing_cost or 0.0
        expected_total = amount_usd + fee
        if total is None:
            refined["total"] = expected_total
            total = expected_total
        elif closing_cost is not None and not _amounts_close(total, expected_total):
            warnings.append(f"Total corregido de {total} a {expected_total}")
            refined["total"] = expected_total
            total = expected_total

    if total is not None and amount_usd is None and closing_cost is not None:
        refined["amount_usd"] = total - closing_cost
        amount_usd = refined["amount_usd"]

    refined["amount"] = refined.get("total") or refined.get("amount_usd") or 0.0

    if amount_cop is not None and amount_usd is not None and amount_cop > amount_usd * 100:
        warnings.append("Monto COP inusualmente alto respecto a USD (posible alucinación)")

    if quantity and unit_price and amount_usd and amount_usd != 0:
        expected = quantity * unit_price
        if abs(expected - amount_usd) / abs(amount_usd) > 0.15:
            warnings.append(
                f"Cantidad × precio ({expected:.2f}) difiere >15% del monto USD ({amount_usd})"
            )

    return refined, warnings


def _sorted_investments(investments: list[dict] | None = None) -> list[dict]:
    items = investments if investments is not None else finance_store.load_data()["investments"]
    return sorted(items, key=lambda inv: (inv.get("date") or "", inv.get("created_at") or ""))


TEMPLATE_ROWS = [
    {
        "operation_type": "deposit",
        "date": "2024-11-14",
        "amount_usd": 100.0,
        "amount_cop": 400000.0,
        "total": 100.0,
        "amount": 100.0,
    },
    {
        "operation_type": "buy",
        "date": "2024-11-15",
        "asset": "ACWI",
        "quantity": 0.5,
        "amount_usd": 60.0,
        "unit_price": 120.0,
        "closing_cost": 0.15,
        "total": 60.15,
        "amount": 60.15,
    },
    {
        "operation_type": "sell",
        "date": "2025-01-10",
        "asset": "ACWI",
        "quantity": 0.1,
        "amount_usd": 12.5,
        "unit_price": 125.0,
        "closing_cost": 0.1,
        "pnl_usd": 0.5,
        "total": 12.4,
        "amount": 12.4,
    },
    {
        "operation_type": "dividend",
        "date": "2025-03-01",
        "asset": "ACWI",
        "amount_usd": 2.5,
        "total": 2.5,
        "amount": 2.5,
    },
]


def export_template_csv() -> str:
    return export_csv(TEMPLATE_ROWS)


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

    missing_qty = sum(
        1
        for r in rows
        if r.get("operation_type") in ("buy", "sell") and not r.get("quantity")
    )
    if missing_qty:
        warnings.append(
            f"{missing_qty} operaciones de compra/venta sin Cantidad: "
            "el portafolio no puede calcular posiciones abiertas ni valor en activos."
        )

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
