# Delfos Desktop (Electron)

PoC de escritorio para ejecutar Delfos como una sola app local:

- Electron (ventana desktop)
- Flask (backend local, proceso hijo)
- Frontend compilado (`frontend/dist`) servido por Flask
- Datos locales persistentes en `app.getPath("userData")/data`

## Requisitos

- Node.js >= 22
- Python + `uv` disponible en PATH
- Dependencias backend instaladas (`cd backend && uv sync`)

## Arranque rápido

1. Compila el frontend:

   ```bash
   npm --prefix frontend install
   npm --prefix frontend run build
   ```

2. Instala dependencias desktop:

   ```bash
   npm --prefix desktop install
   ```

3. Inicia la app desktop:

   ```bash
   npm --prefix desktop run dev
   ```

## Empaquetado (fase 2)

Genera instalables con backend embebido (binario PyInstaller + shell Electron):

```bash
npm --prefix desktop run dist:win
```

Para Linux:

```bash
npm --prefix desktop run dist:linux
```

Para macOS (ejecutando desde macOS):

```bash
npm --prefix desktop run dist:mac
```

El pipeline hace:
1. Build de frontend (`frontend/dist`)
2. Build del backend onefile (`backend/dist/delfos-backend`)
3. Empaquetado con `electron-builder` en `desktop/dist/`

## Variables opcionales

- `DELFOS_BACKEND_CMD`: comando para arrancar Flask (default: `uv run python app.py`)
- `DELFOS_BACKEND_TIMEOUT_MS`: timeout de arranque del backend (default: `45000`)
- `DELFOS_RENDERER_URL`: URL de renderer alternativa (ej. `http://localhost:4321` para Astro dev)
- `DELFOS_UV_BIN`: ruta/binario de `uv` para el build del backend (`dist:*`)

## Notas

- Este módulo no cambia la arquitectura existente de Delfos; solo la envuelve.
- El backend sigue siendo la API Flask oficial y mantiene capas `app.py -> services -> integrations`.
- En app empaquetada, Electron arranca `backend/delfos-backend` desde `resources/`.
- El dictado en Electron usa Whisper local por defecto (`faster-whisper`, grupo `stt`).
  El build de escritorio **incluye** el grupo `stt` en el binario PyInstaller.
  El instalador NSIS pregunta si preparar dictado local; si aceptas, al primer
  arranque se descarga el modelo (`POST /api/settings/stt/warmup`).
  En Configuración puedes activar “dictado mejorado” para preferir la nube (Gemini/Groq)
  o pulsar “Preparar Whisper local” manualmente.
