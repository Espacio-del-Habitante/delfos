"""Seleccion del integrator activo segun la config (settings).

`get_active_integration()` instancia el adapter correcto y lo cachea por
config-hash, asi cambiar la config en caliente recrea el adapter sin reiniciar.
Anadir una integracion nueva = crear un adapter + un caso aqui.
"""

import json

from integrations import settings
from integrations.gemini import GeminiIntegration
from integrations.ollama import OllamaIntegration
from integrations.openai_compatible import OpenAICompatibleIntegration

_cache: dict[str, object] = {}


def _config_hash(cfg: dict) -> str:
    return json.dumps(cfg, sort_keys=True, ensure_ascii=False)


def _build(cfg: dict):
    provider = settings.effective_provider(cfg)
    text_model = cfg.get("text_model") or ""
    vision_model = cfg.get("vision_model") or ""
    base_url = cfg.get("base_url") or ""
    api_key = cfg.get("api_key") or ""

    if provider == "gemini":
        return GeminiIntegration(text_model=text_model, vision_model=vision_model, api_key=api_key)
    if provider == "compatible":
        return OpenAICompatibleIntegration(
            text_model=text_model,
            vision_model=vision_model,
            base_url=base_url,
            api_key=api_key,
        )
    return OllamaIntegration(text_model=text_model, vision_model=vision_model, base_url=base_url)


def get_active_integration():
    """Devuelve la integracion activa segun la config guardada/env."""
    cfg = settings.load_config()
    key = _config_hash(cfg)
    cached = _cache.get(key)
    if cached is None:
        cached = _build(cfg)
        _cache[key] = cached
    return cached


def build_integration(cfg: dict):
    """Construye un integrator a partir de un dict de config arbitrario (sin cache).

    Util para `POST /api/settings/ai/test` con una config aun no guardada.
    """
    merged = settings.load_config()
    for key, value in (cfg or {}).items():
        if value is None:
            continue
        # Strings vacios no pisan la config guardada (p.ej. no reescribe la api_key).
        if isinstance(value, str) and value.strip() == "":
            continue
        merged[key] = value
    return _build(merged)


def clear_cache() -> None:
    _cache.clear()


def available_providers() -> list[dict]:
    """Catalogo para la UI: proveedores + modelos sugeridos por defecto."""
    return [
        {
            "id": "local",
            "label": "Local (Ollama)",
            "needs_api_key": False,
            "needs_base_url": False,
            "suggested_text_model": "",
            "suggested_vision_model": "",
        },
        {
            "id": "gemini",
            "label": "Google Gemini",
            "needs_api_key": True,
            "needs_base_url": False,
            "suggested_text_model": "gemini-2.0-flash",
            "suggested_vision_model": "gemini-2.0-flash",
        },
        {
            "id": "compatible",
            "label": "Compatible (OpenRouter, Groq)",
            "needs_api_key": True,
            "needs_base_url": True,
            "suggested_text_model": "meta-llama/llama-3.3-70b-instruct:free",
            "suggested_vision_model": "google/gemma-4-31b-it:free",
        },
    ]
