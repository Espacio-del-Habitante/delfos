"""Backup / restore del estado local (finanzas + settings públicos, sin secretos)."""

from __future__ import annotations

from datetime import datetime, timezone

from integrations import settings as ai_settings
from services import finance_store, quote_settings

BACKUP_VERSION = 1

_AI_SECRET_KEYS = frozenset({"api_key"})
_QUOTE_SECRET_KEYS = frozenset({"twelve_data_api_key", "alpha_vantage_api_key"})


def _strip_keys(data: dict, secrets: frozenset[str]) -> dict:
    return {k: v for k, v in data.items() if k not in secrets}


def build_backup() -> dict:
    """Snapshot JSON v1: delfos_data + ai/quote settings sin API keys."""
    return {
        "version": BACKUP_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "delfos_data": finance_store.load_data(),
        "ai_settings": _strip_keys(ai_settings.load_config(), _AI_SECRET_KEYS),
        "quote_settings": _strip_keys(quote_settings.load_config(), _QUOTE_SECRET_KEYS),
    }


def restore_backup(payload: dict) -> None:
    """Restaura un backup v1. Conserva secretos en disco si el backup no trae keys."""
    if not isinstance(payload, dict):
        raise ValueError("Invalid backup payload")
    if payload.get("version") != BACKUP_VERSION:
        raise ValueError(f"Unsupported backup version (expected {BACKUP_VERSION})")

    delfos_data = payload.get("delfos_data")
    if not isinstance(delfos_data, dict):
        raise ValueError("Backup missing delfos_data")

    ai_patch = payload.get("ai_settings")
    if ai_patch is not None and not isinstance(ai_patch, dict):
        raise ValueError("Invalid ai_settings in backup")

    quote_patch = payload.get("quote_settings")
    if quote_patch is not None and not isinstance(quote_patch, dict):
        raise ValueError("Invalid quote_settings in backup")

    finance_store.save_data(delfos_data)

    # save_config ya conserva keys existentes si el patch no trae valor útil.
    if isinstance(ai_patch, dict):
        ai_settings.save_config(_strip_keys(ai_patch, _AI_SECRET_KEYS))
    if isinstance(quote_patch, dict):
        quote_settings.save_config(_strip_keys(quote_patch, _QUOTE_SECRET_KEYS))
