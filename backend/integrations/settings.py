"""Configuracion + secretos de la capa integrator.

Precedencia: archivo guardado por la UI > variables de entorno (.env) > defaults.
El secreto (api_key) vive SOLO en backend/data/ai_settings.json (gitignored) y
nunca se serializa al cliente: la UI recibe `has_api_key` + `masked_key`.
"""

import json
import os

import config

SETTINGS_PATH = config.DATA_DIR / "ai_settings.json"

VALID_PROVIDERS = ("local", "gemini", "compatible")

ALLOWED_KEYS = (
    "provider",
    "cloud_enabled",
    "text_model",
    "vision_model",
    "base_url",
    "api_key",
    "prefer_cloud_stt",
    "local_whisper_model",
)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _env_defaults() -> dict:
    """Defaults derivados de variables de entorno (.env) y de la config de Ollama."""
    provider = (os.getenv("AI_PROVIDER", "local") or "local").strip().lower()
    if provider not in VALID_PROVIDERS:
        provider = "local"
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("AI_API_KEY") or ""
    return {
        "provider": provider,
        "cloud_enabled": _env_bool("AI_CLOUD_ENABLED", False),
        "text_model": os.getenv("AI_TEXT_MODEL", ""),
        "vision_model": os.getenv("AI_VISION_MODEL", ""),
        "base_url": os.getenv("AI_BASE_URL", ""),
        "api_key": api_key,
        "prefer_cloud_stt": _env_bool("DELFOS_PREFER_CLOUD_STT", False),
        "local_whisper_model": os.getenv("DELFOS_WHISPER_MODEL", "base"),
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
    """Config efectiva completa (incluye api_key en claro) para uso interno/registry.

    Nunca exponer este dict al cliente; usar `get_public_config()` para eso.
    """
    merged = _env_defaults()
    saved = _read_file()
    for key in ALLOWED_KEYS:
        if key in saved and saved[key] is not None:
            merged[key] = saved[key]

    if merged.get("provider") not in VALID_PROVIDERS:
        merged["provider"] = "local"
    merged["cloud_enabled"] = bool(merged.get("cloud_enabled"))
    merged["prefer_cloud_stt"] = bool(merged.get("prefer_cloud_stt"))
    model = (merged.get("local_whisper_model") or "base").strip().lower()
    if model not in ("tiny", "base", "small", "medium", "large-v3"):
        model = "base"
    merged["local_whisper_model"] = model
    return merged


def save_config(patch: dict) -> dict:
    """Guarda solo las claves permitidas. Si no envian api_key, conserva la existente."""
    patch = patch or {}
    current_saved = _read_file()
    new_saved = dict(current_saved)

    for key in ALLOWED_KEYS:
        if key not in patch:
            continue
        value = patch[key]
        if key == "api_key":
            # Una key vacia/ausente NO borra la existente; pasar None explicito para limpiar.
            if value is None:
                continue
            value = str(value).strip()
            if value == "":
                continue
            new_saved["api_key"] = value
        elif key == "cloud_enabled":
            new_saved["cloud_enabled"] = bool(value)
        elif key == "prefer_cloud_stt":
            new_saved["prefer_cloud_stt"] = bool(value)
        elif key == "local_whisper_model":
            model = (str(value) or "base").strip().lower()
            new_saved["local_whisper_model"] = (
                model if model in ("tiny", "base", "small", "medium", "large-v3") else "base"
            )
        elif key == "provider":
            provider = (str(value) or "local").strip().lower()
            new_saved["provider"] = provider if provider in VALID_PROVIDERS else "local"
        else:
            new_saved[key] = "" if value is None else str(value)

    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(
        json.dumps(new_saved, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return get_public_config()


def mask_key(key: str | None) -> str:
    if not key:
        return ""
    key = str(key)
    if len(key) <= 4:
        return "*" * len(key)
    return "****" + key[-4:]


def effective_provider(cfg: dict | None = None) -> str:
    """Proveedor real a usar: si la nube esta apagada, siempre 'local' (Ollama)."""
    cfg = cfg or load_config()
    if not cfg.get("cloud_enabled"):
        return "local"
    provider = cfg.get("provider", "local")
    return provider if provider in VALID_PROVIDERS else "local"


def resolved_models(cfg: dict | None = None) -> dict:
    """Modelos efectivos por proveedor (rellena defaults de Ollama cuando aplica)."""
    cfg = cfg or load_config()
    provider = effective_provider(cfg)
    text_model = cfg.get("text_model") or ""
    vision_model = cfg.get("vision_model") or ""
    base_url = cfg.get("base_url") or ""
    if provider == "local":
        text_model = text_model or config.OLLAMA_MODEL
        vision_model = vision_model or config.OLLAMA_VISION_MODEL
        base_url = base_url or config.OLLAMA_URL
    return {
        "provider": provider,
        "text_model": text_model,
        "vision_model": vision_model,
        "base_url": base_url,
    }


def get_public_config() -> dict:
    """Config segura para el cliente: SIN api_key en claro."""
    from services import local_whisper

    cfg = load_config()
    return {
        "provider": cfg.get("provider", "local"),
        "cloud_enabled": bool(cfg.get("cloud_enabled")),
        "text_model": cfg.get("text_model") or "",
        "vision_model": cfg.get("vision_model") or "",
        "base_url": cfg.get("base_url") or "",
        "has_api_key": bool(cfg.get("api_key")),
        "masked_key": mask_key(cfg.get("api_key")),
        "effective_provider": effective_provider(cfg),
        "prefer_cloud_stt": bool(cfg.get("prefer_cloud_stt")),
        "local_whisper_model": cfg.get("local_whisper_model") or "base",
        "local_whisper": local_whisper.whisper_available(),
    }
