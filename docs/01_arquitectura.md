# Delfos — Arquitectura del Proyecto

> Este documento define la arquitectura **real** de Delfos.
> Es la fuente de verdad para cualquier implementación.
> Agentes y colaboradores DEBEN leerlo ANTES de escribir código.
>
> Delfos **NO** usa Clean Architecture con Domain/Infrastructure/Presentation, ni IoC, ni
> contratos/use cases formales. La arquitectura es deliberadamente simple: Flask por servicios
> + Astro/Svelte por features. No inventes capas que no existen aquí.

---

## 1. Vista rápida

```
Frontend (Astro + Svelte islands)
        │  fetch JSON (común/lib/api.ts)
        ▼
REST API (Flask, backend/app.py)   ── catch-all sirve frontend/dist
        │
        ▼
Services (backend/services/*)       ── lógica de negocio + persistencia JSON
        │
        ├──► JSON store (backend/data/*.json)
        │
        ▼
Integrations (backend/integrations/*)  ── proveedores de IA intercambiables
        │
        ▼
IA: local (Ollama)  /  nube (Gemini, OpenAI-compatible: OpenRouter, Groq)
```

- El **frontend** solo habla con la API por HTTP (`common/lib/api.ts`).
- **`app.py`** orquesta request/response, valida entrada y delega en servicios.
- Los **services** concentran la lógica de negocio y la persistencia en archivos JSON.
- Las **integrations** abstraen el proveedor de IA detrás de una interfaz común.

---

## 2. Principios arquitectónicos

| Principio | Descripción |
|-----------|-------------|
| Separación por servicios | La lógica de negocio vive en `services/`, no en las vistas de `app.py` |
| Adapter + registry para IA | El dominio conoce `AIIntegration`, nunca el proveedor concreto |
| Local-first | Persistencia en archivos JSON locales; sin base de datos |
| Frontend feature-based | UI organizada por dominio (`features/`) sobre `common/` (atomic design) |
| Vista previa antes de persistir | La IA propone; el usuario confirma; recién ahí se guarda |
| Secretos solo en backend | La API key nunca se serializa al cliente (se enmascara) |
| Lazy / mínimo | El código más sencillo que funciona; sin abstracciones no pedidas (ver `.cursor/rules/ponytail.mdc`) |

---

## 3. Capas y responsabilidades (Backend)

Stack: **Flask 3** + `flask-cors`, Python ≥ 3.10, gestionado con `uv`. Sirve en el puerto 5000.

### 3.1 API / routing — `backend/app.py`

**Responsabilidades:**
- Definir las rutas REST (`/api/*`).
- Orquestar request/response: leer el body, **validar entrada** mínima, llamar al servicio
  correspondiente y serializar la respuesta JSON.
- Catch-all (`/` y `/<path:path>`) que sirve el frontend compilado (`frontend/dist`), con
  prioridad de las rutas `/api/*`.
- Elegir el servidor según el contexto: `app.run` en dev, **waitress** empaquetado (`.exe`).

**PUEDE:** validar entrada, mapear errores a códigos HTTP, componer payloads.
**NO debe:** contener lógica de negocio ni acceso directo al almacenamiento (eso va en services).

Helper clave: `finance_response(extra)` devuelve siempre el payload de finanzas completo
(`finance_store.get_finance_payload()`) más datos puntuales, para que el frontend refresque su
estado en una sola respuesta tras cada mutación.

**Rutas REST (todas las de `app.py`):**

| Método | Ruta | Servicio / acción |
|--------|------|-------------------|
| GET | `/api/finance` | `finance_store.get_finance_payload()` |
| GET | `/api/charts` | `finance_store.get_chart_data()` |
| POST | `/api/accounts` | crear cuenta |
| PATCH/DELETE | `/api/accounts/<id>` | editar / borrar cuenta |
| POST | `/api/expenses` | crear gasto |
| PATCH/DELETE | `/api/expenses/<id>` | editar / borrar gasto |
| POST | `/api/incomes` | crear ingreso |
| PATCH/DELETE | `/api/incomes/<id>` | editar / borrar ingreso |
| POST | `/api/investments` | crear inversión |
| PATCH/DELETE | `/api/investments/<id>` | editar / borrar inversión |
| POST | `/api/investment-assets` | registrar activo/ticker |
| GET | `/api/investments/portfolio` | `portfolio_service.get_portfolio_payload()` |
| GET | `/api/investments/export.csv` | `investment_ledger.export_csv()` |
| GET | `/api/investments/export.xlsx` | `investment_ledger.export_xlsx()` |
| POST | `/api/investments/import.csv` | `investment_ledger.import_csv()` (preview / confirm) |
| POST | `/api/investments/ocr` | `vision_service.analyze_investment_image()` |
| POST | `/api/investments/ocr/confirm` | `investment_ledger.confirm_ledger_rows()` |
| POST | `/api/expenses/import.csv` | `bulk_import.import_expenses_csv()` |
| POST | `/api/incomes/import.csv` | `bulk_import.import_incomes_csv()` |
| POST | `/api/notes/import.csv` | `bulk_import.import_notes_csv()` |
| POST | `/api/accounts/import.csv` | `bulk_import.import_accounts_csv()` |
| GET/POST | `/api/categories` | listar / crear categoría |
| PATCH/DELETE | `/api/categories/<id>` | editar / borrar categoría |
| POST | `/api/note` | crear nota (singular) |
| PATCH/DELETE | `/api/notes/<id>` | editar / borrar nota |
| POST | `/api/analyze` | `ai_service.analyze_text()` (vista previa IA) |
| POST | `/api/confirm-analysis` | `finance_store.confirm_analysis()` |
| POST | `/api/settings/reset` | reset con confirmación `"RESTABLECER"` |
| GET | `/api/ollama/health` | health del adapter Ollama |
| GET | `/api/ai/health` | health del proveedor activo |
| GET/POST | `/api/settings/ai` | leer / guardar config de IA |
| POST | `/api/settings/ai/test` | probar conexión con config aún no guardada |

### 3.2 Services — `backend/services/*` (lógica de negocio + persistencia JSON)

| Servicio | Responsabilidad |
|----------|-----------------|
| `finance_store` | **Núcleo de datos.** Carga/guarda el JSON, migraciones suaves, CRUD de cuentas/gastos/ingresos/inversiones/notas/categorías, ajuste de saldos, resúmenes, charts, `get_finance_payload`, `confirm_analysis` |
| `ai_service` | Construye el prompt financiero, llama al proveedor activo (`registry`), parsea el JSON y arma la **vista previa** de análisis; fallback a nota si la IA falla |
| `vision_service` | OCR de capturas de broker: valida la imagen, llama a `vision_json` del proveedor, normaliza/depura filas del ledger |
| `investment_ledger` | Export CSV/XLSX, import CSV, parseo de fechas/números (heurística español/COP), mapeo fila↔inversión, refinado/anti-alucinación de filas OCR |
| `bulk_import` | Import CSV genérico de gastos, ingresos, notas y cuentas (preview + confirm) |
| `portfolio_service` | Agrega posiciones desde el ledger, calcula costo base, P&L realizado y no realizado |
| `quote_service` | Cotizaciones en vivo vía `yfinance` con cache TTL en memoria (15 min) |

**Persistencia:** todo vive en JSON bajo `config.DATA_DIR`.
- `delfos_data.json` — datos de finanzas (settings, categorías, cuentas, gastos, ingresos,
  inversiones, investment_assets, notas).
- `ai_settings.json` — configuración de IA (incluye `api_key`; **gitignored**, nunca al cliente).

`finance_store.load_data()` aplica **migraciones suaves** idempotentes al leer (mover categorías
legadas, normalizar el ledger, sembrar `investment_assets`, etc.) y reescribe si hubo cambios.

### 3.3 Integrations — `backend/integrations/*` (IA intercambiable)

| Archivo | Rol |
|---------|-----|
| `base` | `AIIntegration` (interfaz: `complete_json`, `vision_json`, `health`) y `IntegrationError` (error normalizado de red/HTTP/config/modelo) |
| `settings` | Config + secretos. Precedencia: archivo guardado por UI > variables `.env` > defaults. `effective_provider`, `get_public_config` (sin api_key), `mask_key` |
| `registry` | Selecciona el adapter activo según la config y lo **cachea por config-hash**; `get_active_integration`, `build_integration`, `clear_cache`, `available_providers` |
| `ollama` | Adapter local (Ollama REST vía `urllib`): texto, visión y health |
| `gemini` | Adapter Google Gemini (generativelanguage REST) |
| `openai_compatible` | Adapter OpenAI-compatible (chat/completions): OpenRouter, Groq |

**Regla clave:** el dominio (`ai_service`, `vision_service`) solo conoce `AIIntegration` y captura
`IntegrationError`. No sabe qué proveedor corre por debajo. Añadir un proveedor nuevo = crear un
adapter que implemente `AIIntegration` + un caso en `registry._build`.

### 3.4 Configuración — `backend/config.py`

Carga `.env` y expone: `DATA_DIR` (persistente; en `.exe` apunta a `%LOCALAPPDATA%\Delfos\data`),
`FRONTEND_DIR` (frontend compilado a servir), `OLLAMA_*`, `FLASK_*` y `FROZEN` (modo empaquetado).

---

## 4. Capas y responsabilidades (Frontend)

Stack: **Astro 6** + **Svelte 5** (islands) + TypeScript. Dev en el puerto 4321; build a
`frontend/dist/`. Alias de importación: `@` → `src`, `@common` → `src/common`,
`@features` → `src/features`.

| Capa | Ruta | Responsabilidad |
|------|------|-----------------|
| Pages | `src/pages/*.astro` | Rutas Astro: `index.astro` (dashboard), `inversiones.astro`, `configuracion.astro`. Cada una monta una "screen" Svelte como island (`client:load`) dentro de `AppLayout` |
| Features | `src/features/{dashboard,inversiones,settings}` | UI por dominio. Cada feature tiene `screen/` (la pantalla orquestadora) y `components/{molecules,organisms}` propios |
| Common | `src/common/*` | UI y utilidades compartidas: `atoms/`, `molecules/`, `organisms/`, `layouts/`, `lib/`, `stores/`, `styles/` |

**Piezas clave de `common/`:**
- `lib/api.ts` — **único cliente HTTP**. Todas las llamadas a la API pasan por aquí
  (`fetchJson`, `ApiError`, funciones tipadas por endpoint). `PUBLIC_API_BASE_URL` define el
  origen (vacío en Docker/`.exe` para usar rutas relativas `/api`).
- `lib/types.ts` — **contratos TypeScript** que reflejan los payloads del backend
  (`FinancePayload`, `Account`, `InvestmentRecord`, `AnalysisPreview`, `PortfolioInsights`, etc.).
- `stores/finance.ts` — **estado global** (Svelte store): `finance` + `refreshFinanceData()` +
  `applyFinancePayload()`. Como cada mutación de la API devuelve el `FinancePayload` completo, el
  patrón es: llamar a la API → `applyFinancePayload(respuesta)` → la UI reacciona.

**Patrón de página:**

```
index.astro ──monta──► DashboardScreen.svelte (island)
                            │ usa stores/finance + lib/api
                            └─► organisms/molecules de features/dashboard + common/*
```

---

## 5. Estructura de carpetas (real)

### 5.1 Backend

```
backend/
├── app.py                 # Rutas REST + catch-all que sirve frontend/dist
├── config.py              # .env, DATA_DIR, FRONTEND_DIR, OLLAMA_*, FLASK_*
├── services/
│   ├── finance_store.py       # núcleo de datos + persistencia JSON
│   ├── ai_service.py          # análisis de texto con IA (preview)
│   ├── vision_service.py      # OCR de inversiones (preview)
│   ├── investment_ledger.py   # export/import + parseo + refinado OCR
│   ├── bulk_import.py         # import CSV de gastos/ingresos/notas/cuentas
│   ├── portfolio_service.py   # posiciones y P&L
│   └── quote_service.py       # cotizaciones (yfinance) con cache TTL
├── integrations/
│   ├── base.py                # AIIntegration + IntegrationError
│   ├── settings.py            # config + secretos (api_key)
│   ├── registry.py            # selección + cache del adapter activo
│   ├── ollama.py              # adapter local
│   ├── gemini.py              # adapter nube (Gemini)
│   └── openai_compatible.py   # adapter nube (OpenRouter/Groq)
├── data/                  # JSON store (delfos_data.json, ai_settings.json)
└── tests/                 # unittest (tests.test_api)
```

### 5.2 Frontend

```
frontend/src/
├── pages/
│   ├── index.astro            # Dashboard
│   ├── inversiones.astro      # Inversiones
│   └── configuracion.astro    # Configuración (IA, reset)
├── features/
│   ├── dashboard/
│   │   ├── screen/DashboardScreen.svelte
│   │   └── components/{molecules,organisms}/   # QuickEntry, VoiceEntry, AiPreview,
│   │                                            # SummaryCards, AccountsPanel, MovementsList…
│   ├── inversiones/
│   │   ├── screen/InvestmentsScreen.svelte
│   │   └── components/{molecules,organisms}/   # InvestmentLedger, OcrModal/Upload/Review,
│   │                                            # CsvImportModal, ExportBar, Insights, Charts…
│   └── settings/
│       └── screen/SettingsScreen.svelte
└── common/
    ├── atoms/        # icons/, Modal, DateField…
    ├── molecules/    # Toast, BottomNav, CustomSelect, Dropzone, CategorySelector…
    ├── organisms/    # EditModal, CategoryCreateForm…
    ├── layouts/      # AppLayout.astro
    ├── lib/          # api.ts (cliente HTTP), types.ts, formatters, filters, toast…
    ├── stores/       # finance.ts (estado global)
    └── styles/       # global.css
```

---

## 6. Patrón de integración de IA (adapter + registry)

El corazón de la flexibilidad de IA. Cualquier proveedor implementa el mismo contrato:

```python
# backend/integrations/base.py
class AIIntegration(ABC):
    def complete_json(self, prompt: str) -> str: ...      # texto -> JSON crudo
    def vision_json(self, prompt, image_b64, mime) -> str: ...  # imagen -> JSON crudo
    def health(self) -> dict: ...                          # estado de conexión/modelos
```

Flujo de selección:

```
ai_service / vision_service
        │ registry.get_active_integration()
        ▼
registry  ── lee settings.load_config()  ── cachea por config-hash
        │
        ├─ provider "local"      → OllamaIntegration
        ├─ provider "gemini"     → GeminiIntegration
        └─ provider "compatible" → OpenAICompatibleIntegration
```

- `settings.effective_provider()`: si la nube está apagada (`cloud_enabled = false`), el
  proveedor efectivo es **siempre `local`**, sin importar `provider`.
- Guardar config (`POST /api/settings/ai`) llama a `registry.clear_cache()` para recrear el
  adapter en caliente (sin reiniciar el servidor).
- El secreto `api_key` solo se lee en backend; al cliente se le entrega `has_api_key` + `masked_key`.
- Todo fallo de red/HTTP/config/modelo se normaliza como `IntegrationError`; el dominio lo
  captura para decidir el **fallback** (p. ej. guardar el texto como nota).

**Añadir un proveedor nuevo:** crea `integrations/<nuevo>.py` que extienda `AIIntegration`,
añade su caso en `registry._build()` y un entry en `available_providers()`. Nada más cambia.

---

## 7. Flujo de datos

### 7.1 Lectura (dashboard)

```
1. La screen Svelte llama getFinanceData() (common/lib/api.ts)
2. GET /api/finance → app.py → finance_store.get_finance_payload()
3. finance_store.load_data() (con migraciones suaves) compone summary, accounts,
   movements, categories, listas crudas y charts
4. La respuesta llena el store finance (applyFinancePayload)
5. Los componentes reaccionan al store y renderizan
```

### 7.2 Escritura (crear/editar/borrar)

```
1. La UI llama p. ej. createExpense(body) (common/lib/api.ts)
2. POST /api/expenses → app.py valida (monto obligatorio) → finance_store.add_expense()
3. finance_store guarda en JSON y ajusta el saldo de la cuenta (si aplica)
4. app.py responde con finance_response(...) = FinancePayload completo
5. La UI hace applyFinancePayload(respuesta); el store y la UI se actualizan
```

### 7.3 Análisis de texto con IA

```
1. UI manda texto: POST /api/analyze
2. ai_service.build_finance_prompt(texto, cuentas)
3. registry.get_active_integration().complete_json(prompt)
4. ai_service parsea JSON y arma la vista previa (expenses/investments/notes, sugerencias)
5. La UI muestra la vista previa; el usuario edita y confirma
6. POST /api/confirm-analysis → finance_store.confirm_analysis() persiste lo confirmado
   (si no hay IA o el JSON falla → fallback: guardar como nota)
```

### 7.4 OCR de imagen (inversiones)

```
1. UI sube una imagen: POST /api/investments/ocr
2. Si el proveedor efectivo es local, se exige el modelo de visión en Ollama (si falta → 503)
3. vision_service valida la imagen y llama vision_json del proveedor activo
4. investment_ledger normaliza/refina filas (anti-alucinación: P/G en compras, totales, etc.)
5. La UI muestra las filas para revisión; el usuario confirma
6. POST /api/investments/ocr/confirm → investment_ledger.confirm_ledger_rows() persiste
```

---

## 8. Reglas clave (resumen para agentes)

| Regla | Descripción |
|-------|-------------|
| Lógica en services | `app.py` valida y orquesta; la lógica y persistencia van en `services/` |
| El frontend solo usa `api.ts` | Ningún componente hace `fetch` directo a la API por su cuenta |
| Mutación → payload completo | Las rutas mutadoras devuelven el `FinancePayload`; la UI hace `applyFinancePayload` |
| IA detrás de `AIIntegration` | El dominio no conoce el proveedor; usa el registry |
| IA propone, el usuario confirma | Nunca persistir resultados de IA sin confirmación |
| Secretos solo en backend | La `api_key` no se serializa al cliente (enmascarada) |
| UI por feature + atomic | Componentes de dominio en `features/`; compartidos en `common/` |
| Persistencia JSON | El JSON es la fuente de verdad; migraciones suaves al leer |
| Mínimo viable | Sin abstracciones no pedidas (ver `.cursor/rules/ponytail.mdc`) |

---

## 9. Prohibiciones absolutas

| Prohibición | Razón |
|-------------|-------|
| Introducir Clean Architecture / IoC / use cases formales | No es la arquitectura de Delfos; añade complejidad innecesaria |
| Poner lógica de negocio o acceso a datos en `app.py` | Debe vivir en `services/` |
| Hacer `fetch` a la API fuera de `common/lib/api.ts` | Rompe el punto único de acceso HTTP |
| Acoplar el dominio a un proveedor de IA concreto | Debe pasar por `AIIntegration` + `registry` |
| Serializar la `api_key` al cliente | Es un secreto; solo `has_api_key` + `masked_key` |
| Persistir resultados de IA sin confirmación del usuario | Viola el patrón preview → confirm |
| Añadir una base de datos sin necesidad | Delfos es local-first sobre JSON |
| Crear dependencias nuevas evitables | Reusar stdlib/lo ya instalado (ver ponytail) |

---

> **Nota para agentes:** Este documento es la fuente de verdad arquitectónica de Delfos.
> Describe lo que **realmente** existe en el código. Cualquier cambio que introduzca capas o
> patrones ajenos (Clean Architecture, IoC, ORM) será rechazado salvo que se pida explícitamente.
> Debe leerse junto con `docs/00_vision.md`.
