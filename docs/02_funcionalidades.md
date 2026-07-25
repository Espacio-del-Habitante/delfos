# Delfos — Funcionalidades

> Catálogo de lo que Delfos hace hoy (v1).
> Fuente de producto: [`00_vision.md`](00_vision.md). Arquitectura: [`01_arquitectura.md`](01_arquitectura.md).

---

## Resumen

Delfos es un **copiloto personal de finanzas**, local-first: registras gastos, ingresos, inversiones y notas; los ves en un dashboard; y puedes acelerar la captura con voz, CSV, OCR o IA. La IA **nunca guarda sola**: siempre hay vista previa y confirmación.

| Área | Estado |
|------|--------|
| Núcleo de finanzas (CRUD + dashboard + charts) | ✅ |
| Captura asistida (voz, texto IA, CSV) | ✅ |
| Ledger de inversiones + export/import + OCR | ✅ |
| Portafolio y cotizaciones | ✅ |
| IA multi-proveedor (Ollama / Gemini / compatible) | ✅ |
| App escritorio Windows (`.exe`) | ✅ |
| Shell Electron (Linux/Mac PoC) | ✅ PoC |
| Perfil financiero + metas | ✅ |
| KPIs / context pack del asistente | ✅ |
| Chat del asistente con memoria ligera | ✅ |
| Alertas por reglas | 🔜 Futuro |
| Reportes anuales de apoyo | 🔜 Futuro |

---

## 1. Dashboard y finanzas del día a día

- Resumen del mes: gastos, ingresos y saldos.
- Cuentas con tipo, moneda, emoji y saldo (ajuste automático al registrar movimientos).
- Movimientos recientes unificados (gastos, ingresos, inversiones, notas).
- Categorías por defecto + categorías propias (`kind`: expense / income / investment / general / note).
- Gráficos: gasto por categoría, evolución del gasto (7d / 30d / mensual), saldos por cuenta.
- Notas libres con fecha, cuenta opcional y tags (también fallback si la IA no clasifica).

**CRUD:** cuentas, gastos, ingresos, inversiones, notas, categorías.

---

## 2. Captura sin fricción

| Modo | Qué hace |
|------|----------|
| Manual | Formularios en la UI |
| Voz | Dictado → texto para análisis o registro |
| Texto + IA | `"45 mil en almuerzo y 18 mil en taxi"` → vista previa de movimientos → confirmación |
| CSV masivo | Import de gastos, ingresos, notas y cuentas (preview → confirm) |

Reglas clave:

- Monto obligatorio en gasto / ingreso / inversión.
- En español colombiano, `"mil"` × 1000 al interpretar montos.
- Moneda por defecto: **COP** (gastos/ingresos), **USD** (inversiones).
- La IA solo propone; el usuario confirma.

---

## 3. Inversiones

### Ledger (10 columnas)

Alineado con el flujo tipo hoja de cálculo: tipo de operación, fecha, activo, cantidad, monto USD, monto COP, precio unitario, costo de cierre, P/G USD, total.

Operaciones: `buy`, `sell`, `deposit`, `withdrawal`, `dividend`.

- Export **CSV** y **XLSX**
- Import **CSV** (preview → confirm)
- **OCR** de capturas de broker (visión) → filas sugeridas → confirmación
- Anti-alucinación básica (p. ej. P/G en compras, totales recalculados)

### Portafolio

Agregación derivada del ledger (no se persiste):

- Posiciones abiertas, costo base, valor de mercado, P&L no realizado
- P&L realizado (ventas / dividendos)
- Cotizaciones en capas: Twelve Data → Alpha Vantage → yfinance → precio importado (cache TTL)

---

## 4. Inteligencia artificial

| Proveedor | Uso |
|-----------|-----|
| Ollama (local) | Texto + visión; OCR local exige modelo de visión (`llava`, etc.) |
| Google Gemini | Nube; API key propia |
| OpenAI-compatible | OpenRouter / Groq; `base_url` + API key |

- Selección desde **Configuración**; health-check y test de conexión.
- API key solo en backend (al cliente: enmascarada).
- Si la nube está apagada (`cloud_enabled = false`), el proveedor efectivo es siempre **local**.
- Sin IA configurada: registro manual e importaciones siguen funcionando.

---

## 5. Asistente financiero (copiloto)

Extensión sobre el núcleo, mismos datos locales:

1. **Perfil y metas** — onboarding en `/perfil`: ingreso, % ahorro/inversión/colchón, emergencia, riesgo, horizonte y `goals`.
2. **Context pack / KPIs** — ahorro vs meta, meses de emergencia, concentración de portafolio (`GET /api/assistant/context`).
3. **Chat** — conversación en `/asistente` anclada al context pack; memoria ligera (facts/summaries). El chat no es la fuente de verdad de los números.

Pendiente: alertas deterministas y reportes anuales de apoyo (no asesoría fiscal).

---

## 6. Distribución y despliegue

| Opción | Descripción |
|--------|-------------|
| Dev local | Backend Flask `:5000` + frontend Astro `:4321` |
| Docker | nginx + API, mismo origen en `:8080` |
| Windows `.exe` | PyInstaller + waitress; datos en `%LOCALAPPDATA%\Delfos\data` |
| Electron | PoC Linux/Mac; datos en `userData` del SO |

---

## 7. Privacidad y límites (importante)

- Datos en **JSON local**; sin base de datos ni cuenta de usuario.
- Restablecer datos exige confirmar escribiendo `RESTABLECER`.
- Delfos es una herramienta de registro y análisis personal: **no es asesoría financiera ni fiscal**.
- Si usas IA en la nube, el texto/imagen salen hacia ese proveedor con tu API key.
- Cotizaciones externas pueden estar parciales o desfasadas.

---

## 8. Mapa rápido de pantallas

| Ruta | Función |
|------|---------|
| `/` | Dashboard |
| `/inversiones` | Ledger, OCR, import/export, portafolio |
| `/perfil` | Perfil financiero y metas |
| `/asistente` | Chat del copiloto |
| `/configuracion` | IA, cotizaciones, reset |

Detalle de endpoints: [`01_arquitectura.md`](01_arquitectura.md) §3.1.
