<div align="center">

<img src="docs/assets/delfos-logo.png" alt="Delfos logo" width="240" />

# Delfos

### Copiloto personal de finanzas — local-first, potenciado con IA

Registra gastos, ingresos e inversiones por **texto, voz, CSV o foto**.  
Visualiza todo en un dashboard. La IA propone; **tú confirmas**.  
Tus datos viven en archivos locales. Sin cuenta. Sin base de datos en la nube.

[![License: MIT](https://img.shields.io/badge/License-MIT-0F766E.svg)](LICENSE)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3-000000?logo=flask&logoColor=white)
![Astro](https://img.shields.io/badge/Astro-6-BC52EE?logo=astro&logoColor=white)
![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)
![Local-first](https://img.shields.io/badge/Local--first-%E2%9C%94-2ea44f)
![Release](https://img.shields.io/badge/release-v1.1.0-C4A35A)

**Español** · [English](README.en.md) · [Funcionalidades](docs/02_funcionalidades.md) · [Arquitectura](docs/01_arquitectura.md)

</div>

---

## ¿Qué es Delfos?

Delfos (del oráculo de Delfos) es un **copiloto financiero personal** para quien quiere control rápido y privado de su dinero:

| Sin Delfos | Con Delfos |
|------------|------------|
| Anotar cada gasto a mano en una hoja | Texto libre, voz, CSV u OCR de broker |
| Armar gráficos cada mes | Dashboard y charts listos |
| Transcribir operaciones del broker | Ledger + OCR con revisión |
| Apps en la nube con tus datos | JSON local; IA opcional (local o tu API key) |

No es un banco, no es un robo-advisor y **no es asesoría financiera ni fiscal**. Es una herramienta tuya para registrar, ver y entender.

---

## Qué incluye (v1)

- **Dashboard** — cuentas, saldos, resumen del mes, movimientos y gráficos
- **Captura sin fricción** — manual, voz, análisis de texto con IA, import CSV
- **Inversiones** — ledger de 10 columnas, export CSV/XLSX, import CSV, OCR de capturas, portafolio con P&L y cotizaciones
- **IA intercambiable** — Ollama (local), Gemini o OpenAI-compatible (OpenRouter / Groq)
- **Asistente** — perfil financiero, metas, KPIs y chat anclado a tus datos
- **Escritorio** — `.exe` portátil en Windows; shell Electron (PoC) en Linux/Mac

Catálogo completo: [`docs/02_funcionalidades.md`](docs/02_funcionalidades.md).

> El registro manual y la importación **funcionan sin IA**. La IA es acelerador, no requisito.

---

## Arquitectura (vista rápida)

```
Frontend (Astro + Svelte islands)
        │  fetch JSON (common/lib/api.ts)
        ▼
REST API (Flask)  ── sirve frontend/dist en prod / .exe
        │
        ├── Services  → lógica + JSON local
        └── Integrations → Ollama / Gemini / OpenAI-compatible
```

Diagramas C4, flujos de IA y reglas: [`docs/01_arquitectura.md`](docs/01_arquitectura.md).

---

## Cómo empezar

### Requisitos

- Python ≥ 3.10 y [`uv`](https://github.com/astral-sh/uv)
- Node.js 20+ (frontend)
- Opcional: [Ollama](https://ollama.com) para IA/OCR local

### Opción A — Desarrollo local

**Terminal 1 — API**

```powershell
cd backend
copy data\delfos_data.example.json data\delfos_data.json   # primera vez
$env:OLLAMA_URL="http://127.0.0.1:11434"
$env:OLLAMA_MODEL="llama3.2"
$env:OLLAMA_VISION_MODEL="llava"   # ollama pull llava (OCR local)
uv sync
uv run python app.py
```

API en http://127.0.0.1:5000

**Terminal 2 — UI**

```powershell
cd frontend
npm install
# PUBLIC_API_BASE_URL=http://localhost:5000 en frontend/.env
npm run dev
```

App en http://localhost:4321

### Opción B — Docker

```powershell
ollama pull llava
docker compose up --build
```

App en **http://localhost:8080** · datos en `./backend/data`

### Opción C — Windows `.exe`

```powershell
powershell -ExecutionPolicy Bypass -File .\build_exe.ps1
```

Resultado: `backend\dist\Delfos.exe`. Datos en `%LOCALAPPDATA%\Delfos\data`.

### Opción D — Electron (Linux/Mac PoC)

Ver [`desktop/README.md`](desktop/README.md).

---

## Configurar la IA

Desde **Configuración** (o `POST /api/settings/ai`):

| Proveedor | `provider` | Notas |
|-----------|------------|-------|
| Ollama | `local` | OCR local exige modelo de visión |
| Google Gemini | `gemini` | Tu API key |
| OpenAI-compatible | `compatible` | OpenRouter / Groq + `base_url` |

La API key **nunca** se envía al frontend (solo enmascarada). Health: `GET /api/ai/health`.

---

## API (resumen)

Base: `/api`. Las mutaciones devuelven el `FinancePayload` completo.

| Método | Ruta | Acción |
|--------|------|--------|
| `GET` | `/api/finance` | Estado completo |
| `GET` | `/api/charts` | Datos de gráficos |
| CRUD | `/api/{accounts,expenses,incomes,investments,notes,categories}` | Finanzas |
| `POST` | `/api/analyze` · `/api/confirm-analysis` | Texto → preview → confirm |
| `POST` | `/api/investments/ocr` · `/ocr/confirm` | OCR inversiones |
| `GET` | `/api/investments/portfolio` | Posiciones y P&L |
| `GET·POST` | `/api/settings/ai` | Config IA |
| `GET·PATCH` | `/api/assistant/*` | Perfil, metas, chat, context |

Lista completa: [`docs/01_arquitectura.md`](docs/01_arquitectura.md).

---

## Privacidad y seguridad

- Persistencia en JSON local (`delfos_data.json`). Los secretos (`ai_settings.json`, `quote_settings.json`) están en `.gitignore`.
- El repo incluye solo [`backend/data/delfos_data.example.json`](backend/data/delfos_data.example.json) (seed vacío). **No subas tu JSON real.**
- Si usas IA en la nube, aceptas enviar texto/imágenes a ese proveedor.
- Restablecer datos exige escribir `RESTABLECER`.

---

## Tests

```powershell
cd backend
uv sync
uv run python -m unittest tests.test_api -v
```

---

## Documentación

| Doc | Contenido |
|-----|-----------|
| [`docs/00_vision.md`](docs/00_vision.md) | Visión de producto, usuarios, reglas de negocio |
| [`docs/01_arquitectura.md`](docs/01_arquitectura.md) | Capas, carpetas, flujos, patrón de IA |
| [`docs/02_funcionalidades.md`](docs/02_funcionalidades.md) | Catálogo de features v1 |
| [`AGENTS.md`](AGENTS.md) | Guía para agentes / colaboradores |

---

## Licencia y aviso

MIT — ver [`LICENSE`](LICENSE).

Delfos se ofrece “tal cual”. Úsalo para organizar tus finanzas personales; no sustituye consejo profesional de inversión, contabilidad o impuestos.

---

<div align="center">

**Tus finanzas, tus datos, tu copiloto.**

</div>
