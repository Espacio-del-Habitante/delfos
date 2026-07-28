"""Interfaz comun de la capa integrator.

Cualquier proveedor de IA (Ollama local, Gemini, OpenAI-compatible) implementa
`AIIntegration`. El dominio solo conoce esta interfaz, nunca el proveedor concreto.
"""

from abc import ABC, abstractmethod


class IntegrationError(Exception):
    """Error normalizado de cualquier integracion (red, HTTP, config, modelo).

    El dominio captura SOLO esta excepcion para decidir si activa el fallback,
    sin importar el proveedor que falle por debajo.
    """

    def __init__(self, message: str, *, hint: str | None = None, status: int | None = None):
        super().__init__(message)
        self.hint = hint
        self.status = status


class AIIntegration(ABC):
    """Contrato unico para integraciones de IA.

    - `complete_json`: texto -> JSON crudo (string) para analyze_text.
    - `vision_json`: imagen + prompt -> JSON crudo (string) para OCR.
    - `transcribe_audio`: audio -> texto (STT; default no soportado).
    - `health`: estado de conexion/modelos para la UI y los endpoints.
    """

    name: str = "base"

    @abstractmethod
    def complete_json(self, prompt: str) -> str:
        """Envia un prompt de texto y devuelve la respuesta cruda (se espera JSON)."""

    @abstractmethod
    def vision_json(self, prompt: str, image_b64: str, mime: str = "image/png") -> str:
        """Envia un prompt + imagen (base64) y devuelve la respuesta cruda (JSON)."""

    def transcribe_audio(self, audio_bytes: bytes, mime: str = "audio/webm") -> str:
        """Transcribe audio a texto. Override en proveedores con STT."""
        raise IntegrationError(
            f"El proveedor '{self.name}' no soporta transcripcion de audio.",
            hint="Configura Gemini u OpenAI-compatible (Groq/OpenRouter) en Configuracion.",
        )

    @abstractmethod
    def health(self) -> dict:
        """Devuelve un dict con al menos {'ok': bool, ...} describiendo la conexion."""
