"""Adapter Google Gemini (generativelanguage REST via urllib).

Texto y vision con una sola API key. Las imagenes se envian como `inline_data`
(base64 + mime). Traduce cualquier fallo HTTP/red a IntegrationError.
"""

import json
import urllib.error
import urllib.request

from integrations.base import AIIntegration, IntegrationError

API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_MODEL = "gemini-2.0-flash"
TIMEOUT = 120


class GeminiIntegration(AIIntegration):
    name = "gemini"

    def __init__(self, text_model=None, vision_model=None, api_key=None, timeout=TIMEOUT):
        self.text_model = text_model or DEFAULT_MODEL
        self.vision_model = vision_model or DEFAULT_MODEL
        self.api_key = api_key or ""
        self.timeout = timeout

    def _post(self, model: str, parts: list) -> str:
        if not self.api_key:
            raise IntegrationError(
                "Falta la API key de Gemini.",
                hint="Pega tu key de Google AI Studio en Configuracion.",
            )
        url = f"{API_ROOT}/{model}:generateContent?key={self.api_key}"
        payload = json.dumps(
            {
                "contents": [{"role": "user", "parts": parts}],
                "generationConfig": {"response_mime_type": "application/json"},
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            hint = "Revisa la API key y el nombre del modelo." if exc.code in (400, 401, 403) else None
            raise IntegrationError(f"Gemini respondio HTTP {exc.code}: {detail}", hint=hint, status=exc.code) from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise IntegrationError(f"No se pudo contactar Gemini: {exc}") from exc
        return self._extract_text(body)

    @staticmethod
    def _extract_text(body: dict) -> str:
        candidates = body.get("candidates") or []
        if not candidates:
            raise IntegrationError("Gemini no devolvio candidatos en la respuesta.")
        parts = (candidates[0].get("content") or {}).get("parts") or []
        return "".join(p.get("text", "") for p in parts)

    def complete_json(self, prompt: str) -> str:
        return self._post(self.text_model, [{"text": prompt}])

    def vision_json(self, prompt: str, image_b64: str, mime: str = "image/png") -> str:
        parts = [
            {"text": prompt},
            {"inline_data": {"mime_type": mime, "data": image_b64}},
        ]
        return self._post(self.vision_model, parts)

    def transcribe_audio(self, audio_bytes: bytes, mime: str = "audio/webm") -> str:
        import base64

        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
        prompt = (
            "Transcribe este audio al espanol exactamente como se escucha. "
            'Devuelve SOLO JSON valido: {"text": "..."} sin explicaciones.'
        )
        parts = [
            {"text": prompt},
            {"inline_data": {"mime_type": mime, "data": audio_b64}},
        ]
        return self._post(self.text_model, parts)

    def health(self) -> dict:
        base = {
            "ok": False,
            "provider": self.name,
            "model": self.text_model,
            "vision_model": self.vision_model,
            "vision_model_found": False,
        }
        if not self.api_key:
            return {**base, "error": "Falta la API key de Gemini.", "hint": "Pega tu key en Configuracion."}
        try:
            self.complete_json('Responde solo: {"ok": true}')
        except IntegrationError as exc:
            return {**base, "error": str(exc), "hint": exc.hint}
        return {
            "ok": True,
            "provider": self.name,
            "model": self.text_model,
            "model_found": True,
            "vision_model": self.vision_model,
            "vision_model_found": True,
        }
