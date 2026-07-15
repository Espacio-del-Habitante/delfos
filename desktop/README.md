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

## Variables opcionales

- `DELFOS_BACKEND_CMD`: comando para arrancar Flask (default: `uv run python app.py`)
- `DELFOS_BACKEND_TIMEOUT_MS`: timeout de arranque del backend (default: `45000`)
- `DELFOS_RENDERER_URL`: URL de renderer alternativa (ej. `http://localhost:4321` para Astro dev)

## Notas

- Este módulo no cambia la arquitectura existente de Delfos; solo la envuelve.
- El backend sigue siendo la API Flask oficial y mantiene capas `app.py -> services -> integrations`.
