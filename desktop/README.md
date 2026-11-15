# Delfos Desktop (Electron) — hub del monorepo

Empaqueta **frontend + backend** en una app de escritorio. Ese proceso es el **hub**
(fuente central de datos) con el que sincroniza la **PWA** del mismo `frontend/`.

- Electron → ventana nativa
- Flask (hijo) → API + sirve `frontend/dist`
- Datos en `app.getPath("userData")/data`
- Con LAN activa → Flask en `0.0.0.0:5000` para el celular

Detalle del modelo PWA ↔ hub: `docs/02_mobile_lan_sync.md`.

## Requisitos

- Node.js ≥ 22
- Python + `uv` en PATH
- `cd backend && uv sync`

## Arranque rápido

```bash
npm --prefix frontend install && npm --prefix frontend run build
npm --prefix desktop install
npm --prefix desktop run dev
```

Con hub LAN desde el primer arranque:

```bash
DELFOS_LAN_SYNC=1 npm --prefix desktop run dev
```

## Empaquetado

```bash
npm --prefix desktop run dist:linux   # AppImage
npm --prefix desktop run dist:mac     # DMG (desde macOS)
```

Pipeline: build frontend → PyInstaller onefile del backend → `electron-builder`.

## Variables

| Variable | Uso |
|----------|-----|
| `DELFOS_LAN_SYNC` | `1` = hub LAN (PWA del celular) |
| `DELFOS_HUB_PORT` | Puerto estable con LAN (default `5000`) |
| `DELFOS_BACKEND_CMD` | Comando Flask en dev (default `uv run python app.py`) |
| `DELFOS_BACKEND_TIMEOUT_MS` | Timeout de arranque (default `45000`) |
| `DELFOS_RENDERER_URL` | Renderer alternativo (p.ej. Astro `:4321`) |
| `DELFOS_UV_BIN` | Ruta a `uv` para el build del backend |
| `DELFOS_OPEN_BROWSER` | Electron lo pone en `false` |

## Notas

- No cambia las capas Flask (`app.py` → `services` → `integrations`).
- En empaquetado, Electron lanza `resources/backend/delfos-backend`.
- La PWA no vive en `desktop/`: es el mismo `frontend/` instalado desde la URL LAN del hub.
