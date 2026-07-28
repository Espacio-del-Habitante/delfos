"""Transcripcion de audio (STT) para dictado en Electron.

Orden:
1. Si `prefer_cloud_stt` → intenta proveedor IA activo (Gemini/Whisper nube).
2. Si falla o no esta activado → Whisper local (faster-whisper).
"""

from __future__ import annotations

import json
import re

from integrations import registry
from integrations import settings as ai_settings
from integrations.base import IntegrationError
from services import local_whisper

MAX_AUDIO_BYTES = 10 * 1024 * 1024
ALLOWED_MIME = frozenset(
    {
        "audio/webm",
        "audio/wav",
        "audio/wave",
        "audio/x-wav",
        "audio/mpeg",
        "audio/mp3",
        "audio/mp4",
        "audio/m4a",
        "audio/ogg",
        "audio/flac",
    }
)


def _normalize_mime(content_type: str | None) -> str:
    raw = (content_type or "audio/webm").split(";")[0].strip().lower()
    if raw == "audio/mp3":
        return "audio/mpeg"
    if raw in ("audio/wave", "audio/x-wav"):
        return "audio/wav"
    return raw


def _extract_text(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return ""
    if text.startswith("{"):
        try:
            data = json.loads(text)
            if isinstance(data, dict) and data.get("text") is not None:
                return str(data["text"]).strip()
        except json.JSONDecodeError:
            pass
        match = re.search(r'"text"\s*:\s*"(.*?)"', text, re.DOTALL)
        if match:
            return match.group(1).replace('\\"', '"').strip()
    return text


def _try_cloud(audio_bytes: bytes, mime: str) -> tuple[str | None, str | None, str | None]:
    """Return (text, error, hint). text set on success."""
    try:
        raw = registry.get_active_integration().transcribe_audio(audio_bytes, mime)
    except IntegrationError as exc:
        return None, str(exc), exc.hint
    except Exception as exc:  # noqa: BLE001
        return None, f"No se pudo transcribir en la nube: {exc}", None
    text = _extract_text(raw)
    if not text:
        return None, "La nube no detecto texto en el audio.", None
    return text, None, None


def _try_local(audio_bytes: bytes, mime: str, model_name: str | None) -> tuple[str | None, str | None, str | None]:
    try:
        text = local_whisper.transcribe_local(audio_bytes, mime, model_name)
    except Exception as exc:  # noqa: BLE001
        status = local_whisper.whisper_available()
        hint = status.get("hint")
        return None, str(exc), hint if isinstance(hint, str) else None
    if not text:
        return None, "Whisper local no detecto texto en el audio.", None
    return text, None, None


def transcribe_audio(audio_bytes: bytes, content_type: str | None = None) -> dict:
    if not audio_bytes:
        return {"error": "Audio vacio", "ai_available": False}
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        return {
            "error": f"Audio demasiado grande (max {MAX_AUDIO_BYTES // (1024 * 1024)} MB).",
            "ai_available": False,
        }

    mime = _normalize_mime(content_type)
    if mime not in ALLOWED_MIME:
        return {
            "error": f"Tipo de audio no soportado: {mime}",
            "hint": "Usa webm, wav, mp3 u ogg.",
            "ai_available": False,
        }

    cfg = ai_settings.load_config()
    prefer_cloud = bool(cfg.get("prefer_cloud_stt"))
    local_model = cfg.get("local_whisper_model") or local_whisper.DEFAULT_MODEL
    cloud_error = None
    cloud_hint = None

    if prefer_cloud:
        text, cloud_error, cloud_hint = _try_cloud(audio_bytes, mime)
        if text:
            return {"text": text, "engine": "cloud", "ai_available": True}

    text, local_error, local_hint = _try_local(audio_bytes, mime, local_model)
    if text:
        payload = {"text": text, "engine": "local", "ai_available": True}
        if prefer_cloud and cloud_error:
            payload["cloud_fallback"] = cloud_error
        return payload

    # Si local fallo y no habiamos intentado nube, ultimo recurso nube.
    if not prefer_cloud:
        text, cloud_error, cloud_hint = _try_cloud(audio_bytes, mime)
        if text:
            return {
                "text": text,
                "engine": "cloud",
                "ai_available": True,
                "local_fallback": local_error,
            }

    parts = [p for p in (local_error, cloud_error) if p]
    return {
        "error": " · ".join(parts) if parts else "No se pudo transcribir.",
        "hint": local_hint or cloud_hint,
        "ai_available": False,
        "local": local_whisper.whisper_available(),
    }
