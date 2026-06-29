"""Adapter Ollama local. Conserva el comportamiento original del dominio."""

import json
import urllib.error
import urllib.request

import config
from integrations.base import AIIntegration, IntegrationError


def _model_found(models, model_name):
    model_base = model_name.split(":")[0]
    return any(
        m.get("name", "") == model_name or m.get("name", "").split(":")[0] == model_base
        for m in models
    )


class OllamaIntegration(AIIntegration):
    name = "local"

    def __init__(self, text_model=None, vision_model=None, base_url=None, timeout=None):
        self.text_model = text_model or config.OLLAMA_MODEL
        self.vision_model = vision_model or config.OLLAMA_VISION_MODEL
        self.base_url = (base_url or config.OLLAMA_URL).rstrip("/")
        self.timeout = timeout or config.OLLAMA_TIMEOUT

    def complete_json(self, prompt: str) -> str:
        payload = json.dumps(
            {
                "model": self.text_model,
                "prompt": prompt,
                "stream": False,
                "format": "json",
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            if exc.code == 404:
                raise IntegrationError(
                    f"Modelo '{self.text_model}' no encontrado. Ejecuta: ollama pull {self.text_model}",
                    hint=f"ollama pull {self.text_model}",
                    status=404,
                ) from exc
            raise IntegrationError(f"Ollama respondio HTTP {exc.code}: {detail}", status=exc.code) from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise IntegrationError(
                f"No se pudo contactar Ollama en {self.base_url}: {exc}",
                hint="Abre la app Ollama o ejecuta 'ollama serve'.",
            ) from exc
        return body.get("response", "")

    def vision_json(self, prompt: str, image_b64: str, mime: str = "image/png") -> str:
        payload = json.dumps(
            {
                "model": self.vision_model,
                "messages": [
                    {
                        "role": "user",
                        "content": prompt,
                        "images": [image_b64],
                    }
                ],
                "stream": False,
                "format": "json",
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            if exc.code == 404:
                raise IntegrationError(
                    f"Modelo '{self.vision_model}' no encontrado. Ejecuta: ollama pull {self.vision_model}",
                    hint=f"ollama pull {self.vision_model}",
                    status=404,
                ) from exc
            raise IntegrationError(f"Ollama respondio HTTP {exc.code}: {detail}", status=exc.code) from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise IntegrationError(
                f"No se pudo contactar Ollama en {self.base_url}: {exc}",
                hint=f"Verifica OLLAMA_URL y OLLAMA_VISION_MODEL ({self.vision_model})",
            ) from exc
        message = body.get("message") or {}
        return message.get("content") or body.get("response") or ""

    def health(self) -> dict:
        try:
            req = urllib.request.Request(f"{self.base_url}/api/tags", method="GET")
            with urllib.request.urlopen(req, timeout=5) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            models = body.get("models", [])
            return {
                "ok": True,
                "provider": self.name,
                "url": self.base_url,
                "model": self.text_model,
                "model_found": _model_found(models, self.text_model),
                "vision_model": self.vision_model,
                "vision_model_found": _model_found(models, self.vision_model),
                "available_models": [m.get("name") for m in models],
            }
        except urllib.error.URLError as exc:
            reason = getattr(exc, "reason", exc)
            return {
                "ok": False,
                "provider": self.name,
                "url": self.base_url,
                "model": self.text_model,
                "vision_model": self.vision_model,
                "vision_model_found": False,
                "error": f"No se pudo conectar a Ollama en {self.base_url}: {reason}",
                "hint": "Abre la app Ollama o ejecuta 'ollama serve'. Luego: ollama pull " + self.text_model,
            }
        except TimeoutError:
            return {
                "ok": False,
                "provider": self.name,
                "url": self.base_url,
                "model": self.text_model,
                "vision_model": self.vision_model,
                "vision_model_found": False,
                "error": f"Timeout al conectar con {self.base_url}",
                "hint": "Verifica que Ollama este corriendo.",
            }
