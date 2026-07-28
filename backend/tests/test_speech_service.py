"""Checks minimos de speech_service (sin red)."""

from services import speech_service


def test_empty_audio():
    result = speech_service.transcribe_audio(b"", "audio/webm")
    assert result.get("ai_available") is False
    assert "Audio" in (result.get("error") or "")


def test_bad_mime():
    result = speech_service.transcribe_audio(b"fake", "text/plain")
    assert result.get("ai_available") is False
    assert "soportado" in (result.get("error") or "").lower()


def test_extract_text_json():
    assert speech_service._extract_text('{"text": "hola mundo"}') == "hola mundo"
    assert speech_service._extract_text("solo texto") == "solo texto"


def test_prefer_local_without_cloud(monkeypatch):
    """Sin prefer_cloud_stt y sin whisper instalado → error claro, no nube obligatoria."""
    from integrations import settings as ai_settings
    from services import speech_service

    monkeypatch.setattr(
        ai_settings,
        "load_config",
        lambda: {"prefer_cloud_stt": False, "local_whisper_model": "base"},
    )

    def boom(*_a, **_k):
        raise RuntimeError("Whisper local no instalado. Ejecuta: uv sync --group stt")

    monkeypatch.setattr("services.local_whisper.transcribe_local", boom)
    monkeypatch.setattr(
        "services.local_whisper.whisper_available",
        lambda: {"available": False, "installed": False, "hint": "uv sync --group stt"},
    )

    # Evitar nube en el fallback: cloud también falla
    class Fake:
        def transcribe_audio(self, *_a, **_k):
            from integrations.base import IntegrationError

            raise IntegrationError("nube off", hint="x")

    monkeypatch.setattr(
        "services.speech_service.registry.get_active_integration",
        lambda: Fake(),
    )

    result = speech_service.transcribe_audio(b"fake-audio-bytes", "audio/webm")
    assert result.get("ai_available") is False
    assert "Whisper" in (result.get("error") or "") or "whisper" in (result.get("hint") or "").lower()
