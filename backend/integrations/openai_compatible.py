"""Adapter compatible OpenAI (chat/completions). Sirve para OpenRouter y Groq.

POST {base_url}/chat/completions con `Authorization: Bearer {key}`.
Vision via `image_url` con data URI (data:{mime};base64,{...}).
"""

import json
import urllib.error
import urllib.request

from integrations.base import AIIntegration, IntegrationError

DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
TIMEOUT = 120


class OpenAICompatibleIntegration(AIIntegration):
    name = "compatible"

    def __init__(self, text_model=None, vision_model=None, base_url=None, api_key=None, timeout=TIMEOUT):
        self.text_model = text_model or ""
        self.vision_model = vision_model or text_model or ""
        self.base_url = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self.api_key = api_key or ""
        self.timeout = timeout

    def _post(self, model: str, messages: list, json_mode: bool = False) -> str:
        if not self.api_key:
            raise IntegrationError(
                "Falta la API key del proveedor compatible.",
                hint="Pega tu key (OpenRouter/Groq) en Configuracion.",
            )
        if not model:
            raise IntegrationError("Falta el nombre del modelo.", hint="Indica el modelo en Configuracion.")
        url = f"{self.base_url}/chat/completions"
        body = {"model": model, "messages": messages, "stream": False}
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        payload = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            hint = "Revisa la API key, el base URL y el modelo." if exc.code in (400, 401, 403, 404) else None
            raise IntegrationError(f"Proveedor respondio HTTP {exc.code}: {detail}", hint=hint, status=exc.code) from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise IntegrationError(f"No se pudo contactar el proveedor en {self.base_url}: {exc}") from exc
        return self._extract_text(body)

    @staticmethod
    def _extract_text(body: dict) -> str:
        choices = body.get("choices") or []
        if not choices:
            raise IntegrationError("El proveedor no devolvio choices en la respuesta.")
        return (choices[0].get("message") or {}).get("content") or ""

    def complete_json(self, prompt: str) -> str:
        return self._post(self.text_model, [{"role": "user", "content": prompt}], json_mode=True)

    def vision_json(self, prompt: str, image_b64: str, mime: str = "image/png") -> str:
        data_uri = f"data:{mime};base64,{image_b64}"
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_uri}},
                ],
            }
        ]
        return self._post(self.vision_model, messages, json_mode=False)

    def _whisper_model(self) -> str:
        host = self.base_url.lower()
        if "groq" in host:
            return "whisper-large-v3"
        return "whisper-1"

    def _ext_for_mime(self, mime: str) -> str:
        mapping = {
            "audio/webm": "webm",
            "audio/wav": "wav",
            "audio/mpeg": "mp3",
            "audio/mp4": "mp4",
            "audio/m4a": "m4a",
            "audio/ogg": "ogg",
            "audio/flac": "flac",
        }
        return mapping.get(mime, "webm")

    def transcribe_audio(self, audio_bytes: bytes, mime: str = "audio/webm") -> str:
        if not self.api_key:
            raise IntegrationError(
                "Falta la API key del proveedor compatible.",
                hint="Pega tu key (OpenRouter/Groq) en Configuracion.",
            )
        host = self.base_url.lower()
        if "openrouter" in host:
            raise IntegrationError(
                "OpenRouter pide saldo minimo (~USD 0.50) para transcribir audio.",
                hint="Para dictar en Electron: en Configuracion cambia a Gemini (recomendado) o Groq, o recarga saldo en OpenRouter.",
            )
        model = self._whisper_model()
        boundary = "----delfosSpeechBoundary7a3f"
        filename = f"audio.{self._ext_for_mime(mime)}"
        lines = [
            f"--{boundary}",
            f'Content-Disposition: form-data; name="model"',
            "",
            model,
            f"--{boundary}",
            f'Content-Disposition: form-data; name="file"; filename="{filename}"',
            f"Content-Type: {mime}",
            "",
        ]
        head = "\r\n".join(lines).encode("utf-8") + b"\r\n"
        tail = f"\r\n--{boundary}--\r\n".encode("utf-8")
        body = head + audio_bytes + tail
        url = f"{self.base_url}/audio/transcriptions"
        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Authorization": f"Bearer {self.api_key}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            if exc.code == 402 or "balance" in detail.lower():
                raise IntegrationError(
                    "El proveedor de audio no tiene saldo suficiente.",
                    hint="Recarga saldo o cambia a Gemini/Groq en Configuracion.",
                    status=exc.code,
                ) from exc
            hint = (
                "Whisper suele funcionar mejor con Groq. "
                "Si usas otro proveedor compatible, prueba Gemini para el dictado."
            )
            raise IntegrationError(
                f"Transcripcion HTTP {exc.code}: {detail}",
                hint=hint,
                status=exc.code,
            ) from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise IntegrationError(f"No se pudo contactar el proveedor en {self.base_url}: {exc}") from exc
        text = (payload.get("text") if isinstance(payload, dict) else None) or ""
        if not text:
            raise IntegrationError("El proveedor no devolvio texto de la transcripcion.")
        return json.dumps({"text": text}, ensure_ascii=False)

    def health(self) -> dict:
        base = {
            "ok": False,
            "provider": self.name,
            "url": self.base_url,
            "model": self.text_model,
            "vision_model": self.vision_model,
            "vision_model_found": False,
        }
        if not self.api_key:
            return {**base, "error": "Falta la API key.", "hint": "Pega tu key en Configuracion."}
        try:
            self.complete_json('Responde solo: {"ok": true}')
        except IntegrationError as exc:
            return {**base, "error": str(exc), "hint": exc.hint}
        return {
            "ok": True,
            "provider": self.name,
            "url": self.base_url,
            "model": self.text_model,
            "model_found": True,
            "vision_model": self.vision_model,
            "vision_model_found": True,
        }
