"""OCR de capturas de broker via el proveedor de IA activo (visión)."""

import base64
import json
import re
from typing import Any

import config
from integrations import registry
from integrations import settings as ai_settings
from integrations.base import IntegrationError
from services.investment_ledger import (
    normalize_ocr_row_fields,
    refine_ocr_row,
)

MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_MIME = frozenset({"image/png", "image/jpeg", "image/jpg", "image/webp"})

VISION_PROMPT = """
Analiza esta captura de pantalla de una app o broker de inversiones (confirmación de compra/venta/depósito).

Mapea las etiquetas en español del broker a estos campos JSON:
- "Compra …" / "Venta …" en el encabezado → operation_type (Compra, Venta, Depósito, Dividendo)
- Ticker del activo en el encabezado (ej. "Compra ACWI" → asset: "ACWI")
- "Fecha de compra" / "Fecha de venta" / "Fecha" → date
- "Monto" → amount_usd
- "Precio de ejecución" / "Precio ejecución" → unit_price
- "Acciones" / "Cantidad" → quantity
- "Costo de cierre" → closing_cost
- "Total" → total

Reglas estrictas:
- Extrae SOLO valores que se vean claramente en pantalla. NUNCA inventes datos.
- amount_cop debe ser null salvo que veas explícitamente un monto en pesos colombianos (COP).
- pnl_usd (ganancia/pérdida) debe ser null salvo que veas explícitamente P/G o ganancia en una venta o dividendo.
- En operaciones de Compra (buy), pnl_usd SIEMPRE debe ser null.
- date: preferir YYYY-MM-DD; si solo ves texto como "22 jun 2026", devuélvelo tal cual.
- asset: símbolo del ETF/acción; vacío solo para depósitos.

Devuelve SOLO JSON válido con esta forma:
{"rows": [ ... ]}

Ejemplo para una pantalla de compra ACWI:
{"rows": [{
  "operation_type": "Compra",
  "date": "22 jun 2026",
  "asset": "ACWI",
  "quantity": 1.52039,
  "amount_usd": 240,
  "amount_cop": null,
  "unit_price": 157.85,
  "closing_cost": 0.15,
  "pnl_usd": null,
  "total": 240.15
}]}

No incluyas explicaciones fuera del JSON.
Si no hay filas legibles, devuelve {"rows": []}.
""".strip()


def _extract_json(raw: str) -> dict:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON found in model response")
    return json.loads(raw[start : end + 1])


def normalize_ocr_row(row: dict[str, Any]) -> dict[str, Any]:
    normalized = normalize_ocr_row_fields(row)
    refined, _warnings = refine_ocr_row(normalized)
    return refined


def _local_vision_unavailable() -> dict[str, Any] | None:
    """Si el proveedor efectivo es local y falta el modelo de visión, bloquear OCR."""
    if ai_settings.effective_provider() != "local":
        return None
    try:
        status = registry.get_active_integration().health()
    except IntegrationError as exc:
        vision_model = config.OLLAMA_VISION_MODEL
        return {
            "error": str(exc),
            "hint": exc.hint or f"Ejecuta: ollama pull {vision_model}",
            "vision_model": vision_model,
            "vision_model_found": False,
            "rows": [],
            "warnings": [],
            "count": 0,
            "ai_available": False,
        }
    if status.get("vision_model_found"):
        return None
    vision_model = status.get("vision_model") or config.OLLAMA_VISION_MODEL
    return {
        "error": f"Modelo de visión '{vision_model}' no encontrado en Ollama",
        "hint": f"Ejecuta: ollama pull {vision_model}",
        "vision_model": vision_model,
        "vision_model_found": False,
        "rows": [],
        "warnings": [],
        "count": 0,
        "ai_available": False,
    }


def ocr_image(image_bytes: bytes, content_type: str = "image/png") -> dict[str, Any]:
    gate = _local_vision_unavailable()
    if gate:
        return gate
    if content_type not in ALLOWED_MIME:
        return {
            "error": f"Tipo de imagen no soportado: {content_type}",
            "rows": [],
            "warnings": [],
            "count": 0,
            "ai_available": False,
        }
    if len(image_bytes) > MAX_IMAGE_BYTES:
        return {
            "error": "Imagen demasiado grande (máx 5MB)",
            "rows": [],
            "warnings": [],
            "count": 0,
            "ai_available": False,
        }
    if not image_bytes:
        return {
            "error": "Imagen vacía",
            "rows": [],
            "warnings": [],
            "count": 0,
            "ai_available": False,
        }

    image_b64 = base64.b64encode(image_bytes).decode("ascii")
    mime = "image/jpeg" if content_type == "image/jpg" else content_type
    try:
        integration = registry.get_active_integration()
        raw = integration.vision_json(VISION_PROMPT, image_b64, mime)
        parsed = _extract_json(raw)
        raw_rows = parsed.get("rows") or []
        if isinstance(raw_rows, dict):
            raw_rows = [raw_rows]
        warnings: list[str] = []
        rows = []
        for i, row in enumerate(raw_rows, start=1):
            if not isinstance(row, dict):
                warnings.append(f"Fila {i}: formato inválido")
                continue
            normalized = normalize_ocr_row_fields(row)
            refined, row_warnings = refine_ocr_row(normalized)
            warnings.extend(row_warnings)
            if not refined.get("date"):
                warnings.append(f"Fila {i}: fecha no reconocida")
            rows.append(refined)
        return {
            "rows": rows,
            "warnings": warnings,
            "count": len(rows),
            "ai_available": True,
        }
    except IntegrationError as exc:
        return {
            "rows": [],
            "warnings": [],
            "count": 0,
            "ai_available": False,
            "error": f"No se pudo contactar el modelo de visión: {exc}",
            "hint": exc.hint or "Revisa la configuración de IA en Configuración.",
        }
    except (json.JSONDecodeError, ValueError, KeyError) as exc:
        return {
            "rows": [],
            "warnings": [str(exc)],
            "count": 0,
            "ai_available": False,
            "error": f"No se pudo interpretar la respuesta del modelo: {exc}",
        }


analyze_investment_image = ocr_image


def mock_ocr_preview() -> dict[str, Any]:
    """Structure used in tests without calling Ollama."""
    row = normalize_ocr_row(
        {
            "operation_type": "Compra",
            "date": "2024-11-14",
            "asset": "VOO",
            "quantity": 0.5,
            "amount_usd": 100,
            "total": 100.15,
            "closing_cost": 0.15,
        }
    )
    return {"rows": [row], "warnings": [], "count": 1, "ai_available": True, "mock": True}
