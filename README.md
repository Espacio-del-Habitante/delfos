# Delfos

Personal finance copilot — Flask API backend + Astro/Svelte frontend.

## Architecture

- **Backend** (`backend/`): Flask REST API on port 5000, JSON file storage, Ollama AI analysis
- **Frontend** (`frontend/`): Astro + TypeScript + Svelte islands on port 4321
- **Legacy** (`legacy/`): Original Jinja templates and static assets (reference only)

## Docker (recommended for full stack)

**Requirements:** Docker Desktop, [Ollama](https://ollama.com) running on the host with a **vision model** for OCR.

```powershell
# Install a vision model on the host (required for OCR)
ollama pull llava
# lighter alternative: ollama pull moondream

# With Docker Compose, pull inside the Ollama container if you use one:
docker exec -it ollama ollama pull llava

# Optional: copy .env.docker.example to .env and adjust OLLAMA_VISION_MODEL

docker compose up --build
```

- App: **http://localhost:8080** or **http://localhost** (port 80, if free on your PC)
- Investments: **http://localhost/inversiones** or **http://localhost:8080/inversiones**
- API proxied at `/api/*` (no CORS issues — same origin)
- Ollama: `http://host.docker.internal:11434` from the backend container (Windows/macOS Docker Desktop)
- Data persisted in `./backend/data`

### Investment ledger + OCR

The **Inversiones** page (`/inversiones`) supports:

- 10-column ledger (matches `Inversiones 2025.xlsx`)
- CSV / Excel export and CSV import
- Screenshot OCR via Ollama vision (`OLLAMA_VISION_MODEL`, default `llava`)

If OCR returns **503**, install the vision model: `ollama pull llava` (or set `OLLAMA_VISION_MODEL=moondream`).

## Development (Windows / PowerShell)

### Backend

```powershell
cd backend
$env:OLLAMA_URL="http://127.0.0.1:11434"
$env:OLLAMA_MODEL="qwen2.5:3b"
$env:OLLAMA_VISION_MODEL="llava"
# Required for OCR — pull before first use:
# ollama pull llava
uv sync
uv run python app.py
```

API root: http://127.0.0.1:5000 — returns `{"service":"delfos-api"}`

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

App: http://localhost:4321 — set `PUBLIC_API_BASE_URL=http://localhost:5000` in `frontend/.env`

Investments: **http://localhost:4321/inversiones**

Run backend and frontend in parallel for full functionality. With Docker, leave `PUBLIC_API_BASE_URL` empty so fetches use relative `/api` paths.

### Quick start (local dev, PowerShell)

```powershell
# Terminal 1 — API
cd backend
uv sync
uv run python app.py

# Terminal 2 — UI (new window)
cd frontend
npm install
npm run dev
```

Open http://localhost:4321 and http://localhost:4321/inversiones

### Quick start (Docker + Ollama in Docker)

```powershell
# 1. Start Ollama container (Docker Desktop → Play on "ollama")
docker exec -it ollama ollama pull qwen2.5:3b
docker exec -it ollama ollama pull llava

# 2. Delfos
cd d:\development\delfos
docker compose up --build
```

Open http://localhost:8080/inversiones

### Tests

```powershell
cd backend
uv sync
uv run python -m unittest tests.test_api -v
```

### Production build (frontend only)

```powershell
cd frontend
npm run build
```

Output: `frontend/dist/` (served by nginx in Docker).

## API notes

- Manual notes: `POST /api/note` (singular)
- CORS enabled for `http://localhost:4321`
- Investment ledger: `GET /api/investments/export.csv`, `GET /api/investments/export.xlsx`, `POST /api/investments/import.csv`, `POST /api/investments/ocr`, `POST /api/investments/ocr/confirm`
- Charts endpoint exists but has no UI in the Astro frontend
