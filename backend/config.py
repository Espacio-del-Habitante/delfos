"""Carga configuración desde .env (Ollama, Flask, etc.)."""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

FROZEN = getattr(sys, "frozen", False)


def _data_dir() -> Path:
    """Carpeta de datos persistente.

    Empaquetado (PyInstaller one-file): se ejecuta desde una carpeta temporal
    que se borra al cerrar, así que los JSON van a %LOCALAPPDATA%\\Delfos\\data.
    En desarrollo: backend/data como siempre.
    """
    override = os.getenv("DELFOS_DATA_DIR")
    if override:
        return Path(override)
    if FROZEN:
        base = os.getenv("LOCALAPPDATA") or str(Path.home())
        return Path(base) / "Delfos" / "data"
    return ROOT / "data"


def _frontend_dir() -> Path:
    """Frontend ya compilado (frontend/dist) que sirve Flask en producción."""
    if FROZEN:
        return Path(sys._MEIPASS) / "frontend_dist"  # type: ignore[attr-defined]
    return ROOT.parent / "frontend" / "dist"


DATA_DIR = _data_dir()
FRONTEND_DIR = _frontend_dir()

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
OLLAMA_VISION_MODEL = os.getenv("OLLAMA_VISION_MODEL", "llava")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "120"))

FLASK_HOST = os.getenv("FLASK_HOST", "127.0.0.1")
FLASK_PORT = int(os.getenv("FLASK_PORT", "5000"))
FLASK_DEBUG = os.getenv("FLASK_DEBUG", "true").lower() in ("1", "true", "yes")
