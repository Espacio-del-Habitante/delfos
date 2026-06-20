# Delfos

Personal finance copilot — Flask API backend + Astro/Svelte frontend.

## Architecture

- **Backend** (`backend/`): Flask REST API on port 5000, JSON file storage, Ollama AI analysis
- **Frontend** (`frontend/`): Astro + TypeScript + Svelte islands on port 4321
- **Legacy** (`legacy/`): Original Jinja templates and static assets (reference only)

## Development (Windows / PowerShell)

### Backend

```powershell
cd backend
$env:OLLAMA_URL="http://127.0.0.1:11434"
$env:OLLAMA_MODEL="qwen2.5:3b"
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

Run backend and frontend in parallel for full functionality.

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

Output: `frontend/dist/` (not served by Flask in this iteration).

## API notes

- Manual notes: `POST /api/note` (singular)
- CORS enabled for `http://localhost:4321`
- Charts endpoint exists but has no UI in the Astro frontend
