# Delfos — Experimento: PWA móvil + sync LAN (rama)

> Documento de la rama experimental `cursor/mobile-pwa-lan-sync-*`.
> No redefine la arquitectura de `01_arquitectura.md`: la extiende con un hub LAN opcional.
> La fuente de verdad de datos sigue siendo el JSON del PC.

---

## Decisión (por qué no Expo)

| Opción | Coste | Encaje |
|--------|-------|--------|
| **PWA** del frontend Astro/Svelte actual | Bajo: reusa UI + API | Ideal para captura + instalar en el celular |
| Expo / React Native | Alto: reescribir UI | No aporta mientras el hub sea el PC en LAN |
| Capacitor (wrapper nativo) | Medio | Posible fase 2 si hace falta cámara/notificaciones nativas |

**Elegimos PWA.** El `.exe` / Flask del PC es el **hub** (fuente central). El móvil instala la misma app desde la URL LAN del PC, encola capturas offline y sincroniza cuando el usuario lo pide y están en la misma red.

Electron (rama previa) es solo empaquetado desktop; no sustituye al hub. El hub es Flask sirviendo API + `frontend/dist`.

---

## Modelo

```
┌─────────────────────┐         Wi‑Fi LAN          ┌──────────────────────┐
│  PC (hub)           │◄──── sync bajo demanda ────│  Móvil (PWA)         │
│  Flask 0.0.0.0:5000 │                            │  cola offline local  │
│  JSON = fuente de   │──── sirve UI /api ────────►│  UI = mismo frontend │
│  verdad             │                            │                      │
└─────────────────────┘                            └──────────────────────┘
```

1. En el PC se activa **Compartir en red local** (`DELFOS_LAN_SYNC=1` o ajuste en Configuración + reinicio).
2. El celular abre `http://<IP-LAN>:5000`, instala la PWA.
3. Sin red / sin hub: las mutaciones van a una **cola** en `localStorage`.
4. El usuario pulsa **Sincronizar**: se reenvían las mutaciones pendientes a `/api/*` del hub y se refresca el `FinancePayload`.

No hay nube. No hay sync automático en background en esta fase.

---

## Piezas

| Pieza | Dónde |
|-------|--------|
| Info del hub + IPs LAN | `GET /api/hub` · `backend/services/hub_service.py` |
| Activar LAN (persistido) | `GET/POST /api/settings/hub` · reinicio para aplicar bind |
| CORS abierto solo con LAN | `backend/app.py` |
| Bind `0.0.0.0` | `config.LAN_SYNC` / `hub_settings.json` |
| Cola + sync cliente | `frontend/src/common/lib/hub.ts` + `api.ts` |
| UI | sección en Configuración |
| PWA | `manifest.webmanifest` + `sw.js` (shell offline) |

---

## Cómo probar

```bash
# PC
DELFOS_LAN_SYNC=1 uv run --directory backend python app.py
# o: POST /api/settings/hub {"lan_enabled": true} y reiniciar

# Celular (misma Wi‑Fi): abrir http://<IP que muestra Configuración>:5000
# Instalar PWA → registrar algo offline → volver a la red → Sincronizar
```

---

## Fuera de alcance (fase 2)

- Discovery mDNS / QR automático
- Conflicto merge bidireccional (el hub gana; el móvil solo empuja cola)
- Expo / Capacitor
- Sync por internet / túnel
