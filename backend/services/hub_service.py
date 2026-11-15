"""Hub LAN: IPs locales y flag persistido para compartir en red."""

from __future__ import annotations

import json
import socket
from pathlib import Path

import config

SETTINGS_PATH = config.DATA_DIR / "hub_settings.json"
PROTOCOL_VERSION = 1
# hub_wins_queue_fifo: el JSON del PC gana; el móvil empuja cola FIFO y resuelve conflictos a mano.
SYNC_POLICY = "hub_wins_queue_fifo"


def _default() -> dict:
    return {"lan_enabled": False}


def load_settings() -> dict:
    if not SETTINGS_PATH.is_file():
        return _default()
    try:
        data = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _default()
    if not isinstance(data, dict):
        return _default()
    return {"lan_enabled": bool(data.get("lan_enabled", False))}


def save_settings(lan_enabled: bool) -> dict:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {"lan_enabled": bool(lan_enabled)}
    SETTINGS_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


def lan_addresses() -> list[str]:
    """IPv4 no-loopback del host. Mejor esfuerzo; sin netifaces."""
    found: set[str] = set()
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127."):
                found.add(ip)
    except OSError:
        pass
    # Fallback: UDP connect trick (no envía paquetes) para la IP de salida.
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            if not ip.startswith("127."):
                found.add(ip)
    except OSError:
        pass
    return sorted(found)


def hub_payload() -> dict:
    settings = load_settings()
    port = config.FLASK_PORT
    addrs = lan_addresses()
    urls = [f"http://{ip}:{port}" for ip in addrs]
    active = bool(config.LAN_SYNC)
    return {
        "protocol_version": PROTOCOL_VERSION,
        "service": "delfos-hub",
        "sync_policy": SYNC_POLICY,
        "lan_enabled": settings["lan_enabled"],
        "lan_active": active,
        "needs_restart": settings["lan_enabled"] != active,
        "host": config.FLASK_HOST,
        "port": port,
        "addresses": addrs,
        "urls": urls,
        "hint": (
            "Abre una de las URLs en el celular (misma Wi‑Fi) e instala la PWA."
            if active
            else "Activa compartir en red y reinicia Delfos para que el móvil pueda conectarse."
        ),
    }


def _self_check() -> None:
    """ponytail: falla si el payload del hub pierde campos críticos."""
    p = hub_payload()
    assert p["service"] == "delfos-hub"
    assert p["protocol_version"] == PROTOCOL_VERSION
    assert p["sync_policy"] == SYNC_POLICY
    assert "lan_enabled" in p and "lan_active" in p
    assert isinstance(p["urls"], list)
    print("hub_service self-check OK", {"addresses": p["addresses"], "lan_active": p["lan_active"], "sync_policy": p["sync_policy"]})


if __name__ == "__main__":
    _self_check()
