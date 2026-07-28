"""Whisper local (faster-whisper) para dictado sin nube.

ponytail: modelo lazy + CPU int8. Techo = primer uso descarga el modelo;
upgrade = GPU/CUDA o modelo tiny si el equipo es lento.
"""

from __future__ import annotations

import logging
import os
import tempfile
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

_LOCK = threading.Lock()
_MODEL = None
_MODEL_NAME: str | None = None
_IMPORT_ERROR: str | None = None

DEFAULT_MODEL = "base"
VALID_MODELS = frozenset({"tiny", "base", "small", "medium", "large-v3"})

_MIME_EXT = {
    "audio/webm": ".webm",
    "audio/wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".mp4",
    "audio/m4a": ".m4a",
    "audio/ogg": ".ogg",
    "audio/flac": ".flac",
}


def whisper_available() -> dict:
    """Estado para la UI: instalado / listo / error de import."""
    try:
        import faster_whisper  # noqa: F401
    except ImportError as exc:
        return {
            "available": False,
            "installed": False,
            "error": str(exc),
            "hint": "Instala el grupo stt: cd backend && uv sync --group stt",
        }
    return {
        "available": True,
        "installed": True,
        "loaded": _MODEL is not None,
        "model": _MODEL_NAME or DEFAULT_MODEL,
    }


def _resolve_model_name(name: str | None) -> str:
    raw = (name or DEFAULT_MODEL).strip().lower() or DEFAULT_MODEL
    return raw if raw in VALID_MODELS else DEFAULT_MODEL


def _load_model(model_name: str):
    global _MODEL, _MODEL_NAME, _IMPORT_ERROR
    with _LOCK:
        if _MODEL is not None and _MODEL_NAME == model_name:
            return _MODEL
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            _IMPORT_ERROR = str(exc)
            raise RuntimeError(
                "Whisper local no instalado. Ejecuta: uv sync --group stt"
            ) from exc

        # CPU int8: funciona en laptops sin GPU; descarga el modelo la primera vez.
        device = os.getenv("DELFOS_WHISPER_DEVICE", "cpu")
        compute = os.getenv("DELFOS_WHISPER_COMPUTE", "int8")
        logger.info("Cargando Whisper local model=%s device=%s compute=%s", model_name, device, compute)
        _MODEL = WhisperModel(model_name, device=device, compute_type=compute)
        _MODEL_NAME = model_name
        return _MODEL


def warmup(model_name: str | None = None) -> dict:
    """Fuerza descarga/carga del modelo (opcional desde Configuracion)."""
    name = _resolve_model_name(model_name)
    try:
        _load_model(name)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), **whisper_available()}
    return {"ok": True, **whisper_available()}


def transcribe_local(audio_bytes: bytes, mime: str = "audio/webm", model_name: str | None = None) -> str:
    name = _resolve_model_name(model_name)
    model = _load_model(name)
    ext = _MIME_EXT.get(mime, ".webm")
    path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(audio_bytes)
            path = Path(tmp.name)
        segments, _info = model.transcribe(
            str(path),
            language="es",
            beam_size=1,
            vad_filter=True,
        )
        parts = [seg.text.strip() for seg in segments if (seg.text or "").strip()]
        return " ".join(parts).strip()
    finally:
        if path is not None:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass
