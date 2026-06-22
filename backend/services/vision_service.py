"""Ollama vision OCR for investment ledger screenshots."""

import base64
import json
import re
import urllib.error
import urllib.request
from typing import Any

import config
from services.investment_ledger import ledger_row_to_investment_input, normalize_ocr_row_fields

MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_MIME = frozenset({"image/png", "image/jpeg", "image/jpg", "image/webp"})

VISION_PROMPT = """
Analiza esta captura de pantalla de una app o broker de inversiones.
Extrae cada fila de operación visible como un array JSON con objetos que tengan exactamente estos campos:
- operation_type: uno de Depósito, Compra, Venta, Dividendo (texto en español)
- date: fecha en formato YYYY-MM-DD si es posible
- asset: símbolo o nombre del activo (vacío para depósitos)
- quantity: cantidad numérica o null
- amount_usd: monto en USD o null
- amount_cop: monto en COP o null
- unit_price: precio unitario o null
- closing_cost: costo de cierre o null
- pnl_usd: ganancia o pérdida en USD o null
- total: total de la operación o null

Devuelve SOLO JSON válido con esta forma:
{"rows": [ ... ]}
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
    return normalize_ocr_row_fields(row)


def _call_ollama_vision(image_b64: str) -> str:
    payload = json.dumps(
        {
            "model": config.OLLAMA_VISION_MODEL,
            "messages": [
                {
                    "role": "user",
                    "content": VISION_PROMPT,
                    "images": [image_b64],
                }
            ],
            "stream": False,
            "format": "json",
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{config.OLLAMA_URL}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=config.OLLAMA_TIMEOUT) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        if exc.code == 404:
            raise ConnectionError(
                f"Modelo '{config.OLLAMA_VISION_MODEL}' no encontrado. "
                f"Ejecuta: ollama pull {config.OLLAMA_VISION_MODEL}"
            ) from exc
        raise ConnectionError(f"Ollama respondió HTTP {exc.code}: {detail}") from exc
    message = body.get("message") or {}
    return message.get("content") or body.get("response") or ""


def ocr_image(image_bytes: bytes, content_type: str = "image/png") -> dict[str, Any]:
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
    try:
        raw = _call_ollama_vision(image_b64)
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
            normalized = normalize_ocr_row(row)
            if not normalized.get("date"):
                warnings.append(f"Fila {i}: fecha no reconocida")
            rows.append(normalized)
        return {
            "rows": rows,
            "warnings": warnings,
            "count": len(rows),
            "ai_available": True,
        }
    except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
        return {
            "rows": [],
            "warnings": [],
            "count": 0,
            "ai_available": False,
            "error": f"No se pudo contactar Ollama: {exc}",
            "hint": f"Verifica OLLAMA_URL y OLLAMA_VISION_MODEL ({config.OLLAMA_VISION_MODEL})",
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
