"""Configuración de APIs de cotizaciones + total de referencia del broker."""

from __future__ import annotations

import json
import os

import config
from integrations.settings import mask_key

SETTINGS_PATH = config.DATA_DIR / "quote_settings.json"

ALLOWED_KEYS = (
    "twelve_data_api_key",
    "alpha_vantage_api_key",
    "broker_reference_total_usd",
)


def _env_defaults() -> dict:
    ref_raw = os.getenv("BROKER_REFERENCE_TOTAL_USD", "")
    broker_ref: float | None = None
    if ref_raw.strip():
        try:
            broker_ref = float(ref_raw)
        except ValueError:
            broker_ref = None
    return {
        "twelve_data_api_key": os.getenv("TWELVE_DATA_API_KEY", "") or "",
        "alpha_vantage_api_key": os.getenv("ALPHA_VANTAGE_API_KEY", "") or "",
        "broker_reference_total_usd": broker_ref,
    }


def _read_file() -> dict:
    try:
        raw = SETTINGS_PATH.read_text(encoding="utf-8")
    except (FileNotFoundError, OSError):
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def load_config() -> dict:
    """Config efectiva (incluye keys en claro). No exponer al cliente."""
    merged = _env_defaults()
    saved = _read_file()
    for key in ALLOWED_KEYS:
        if key in saved and saved[key] is not None:
            merged[key] = saved[key]
    if merged.get("broker_reference_total_usd") is not None:
        try:
            merged["broker_reference_total_usd"] = float(merged["broker_reference_total_usd"])
        except (TypeError, ValueError):
            merged["broker_reference_total_usd"] = None
    return merged


def save_config(patch: dict) -> dict:
    patch = patch or {}
    current_saved = _read_file()
    new_saved = dict(current_saved)

    for key in ALLOWED_KEYS:
        if key not in patch:
            continue
        value = patch[key]
        if key in ("twelve_data_api_key", "alpha_vantage_api_key"):
            if value is None:
                continue
            value = str(value).strip()
            if value == "":
                continue
            new_saved[key] = value
        elif key == "broker_reference_total_usd":
            if value is None or value == "":
                new_saved.pop(key, None)
            else:
                try:
                    new_saved[key] = float(value)
                except (TypeError, ValueError):
                    pass

    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(
        json.dumps(new_saved, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return get_public_config()


def get_public_config() -> dict:
    cfg = load_config()
    broker_ref = cfg.get("broker_reference_total_usd")
    return {
        "has_twelve_data_key": bool(cfg.get("twelve_data_api_key")),
        "masked_twelve_data_key": mask_key(cfg.get("twelve_data_api_key")),
        "has_alpha_vantage_key": bool(cfg.get("alpha_vantage_api_key")),
        "masked_alpha_vantage_key": mask_key(cfg.get("alpha_vantage_api_key")),
        "broker_reference_total_usd": broker_ref,
    }
