# Delfos — Desktop Electron (hub) + PWA móvil (mismo monorepo)

> Rama experimental `cursor/mobile-pwa-lan-sync-*`.
> Extiende `01_arquitectura.md` sin reinventar capas: el hub sigue siendo Flask + JSON.
> Fuente de verdad de datos: JSON del PC (proceso arrancado por Electron o `.exe`).

---

## Modelo del monorepo

```
delfos/
├── backend/     # Flask API + JSON (hub / fuente de verdad)
├── frontend/    # Astro + Svelte  →  UI compartida (ventana Electron + PWA)
├── desktop/     # Electron: empaqueta FE+BE y es el hub en el PC
└── docs/
```

| Superficie | Rol | Dónde |
|------------|-----|--------|
| **Electron (`desktop/`)** | App de escritorio: arranca backend embebido + ventana nativa. **Hub central.** | PC |
| **PWA (`frontend/` + manifest/SW)** | Misma UI instalable en el celular; captura offline y sync LAN | Móvil |
| **Flask** | API + sirve `frontend/dist`; JSON local = verdad | Proceso hijo del hub |

Electron **no** sustituye al backend: lo empaqueta y lo expone. La PWA **no** es otro producto: es el mismo frontend apuntando al hub del PC.

```
┌──────────────────────────────────┐         Wi‑Fi LAN         ┌──────────────────────┐
│  PC — Electron (hub)             │◄──── sync a demanda ─────│  Móvil — PWA         │
│  ├─ ventana: UI (frontend/dist)  │                          │  cola offline        │
│  └─ hijo: Flask 0.0.0.0:5000     │──── /api + UI ──────────►│  mismo frontend      │
│       JSON en userData/data      │                          │                      │
└──────────────────────────────────┘                          └──────────────────────┘
```

---

## Por qué PWA (y no Expo) junto a Electron

| Opción | Coste | Encaje |
|--------|-------|--------|
| **PWA** del frontend actual | Bajo: un solo UI con Electron | Captura móvil + install en home screen |
| Expo / RN | Alto: segunda UI | No hace falta mientras el hub sea LAN al PC |
| Capacitor | Medio | Fase 2 si hace falta APIs nativas |

---

## Flujo

1. En el PC abres **Delfos Desktop** (`npm --prefix desktop run dev` o el build).
2. En Configuración activas **Compartir en red local** y reinicias el hub (Electron relee el flag al arrancar).
3. Electron con LAN: Flask en `0.0.0.0:5000` (puerto estable `DELFOS_HUB_PORT`).
4. El celular abre `http://<IP-LAN>:5000`, instala la PWA (mismo `frontend`).
5. Offline: mutaciones → cola en el móvil. Online + **Sincronizar** → se empujan al `/api/*` del hub.

Sin nube. Sin sync automático en background en esta fase.

---

## Piezas

| Pieza | Dónde |
|-------|--------|
| Shell Electron + spawn Flask | `desktop/main.js` |
| Empaquetado FE+BE | `desktop/package.json` (`dist:*`) + `scripts/build-backend.mjs` |
| Info hub + IPs | `GET /api/hub` · `backend/services/hub_service.py` |
| Flag LAN persistido | `GET/POST /api/settings/hub` · `hub_settings.json` en `DELFOS_DATA_DIR` |
| Bind / CORS LAN | `config.LAN_SYNC` · `backend/app.py` |
| Cola + sync cliente | `frontend/src/common/lib/hub.ts` + `api.ts` |
| PWA | `frontend/public/manifest.webmanifest` + `sw.js` |

---

## Cómo probar

```bash
# 1) Frontend build (Electron y PWA comparten dist)
npm --prefix frontend install && npm --prefix frontend run build

# 2) Desktop hub
npm --prefix desktop install
# Opcional: forzar LAN desde el primer arranque
DELFOS_LAN_SYNC=1 npm --prefix desktop run dev

# 3) En Configuración (ventana Electron): activar “Compartir en red local”,
#    reiniciar desktop si hace falta, copiar la URL LAN.

# 4) Celular (misma Wi‑Fi): abrir http://<IP>:5000 → Instalar PWA → Sincronizar
```

Variables útiles:

- `DELFOS_LAN_SYNC=1` — hub escuchando en LAN
- `DELFOS_HUB_PORT=5000` — puerto estable para la PWA
- `DELFOS_OPEN_BROWSER=false` — lo pone Electron (no abre Chrome encima de la ventana)
- `DELFOS_RENDERER_URL` — p.ej. Astro dev `http://localhost:4321`

---

## Fuera de alcance (fase 2)

- Discovery mDNS / QR automático
- Merge bidireccional (el hub gana; el móvil empuja cola)
- Expo / Capacitor
- Sync por internet / túnel
