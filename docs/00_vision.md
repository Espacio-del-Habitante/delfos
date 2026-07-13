# Delfos — Visión del Proyecto (Copiloto Personal de Finanzas)

> Este documento define la visión de Delfos: un copiloto personal de gastos e inversiones
> potenciado con IA, local-first.
>
> Es la fuente de verdad de producto. Agentes y colaboradores DEBEN leerlo ANTES de
> proponer features o cambios de comportamiento.
> Debe leerse junto con `docs/01_arquitectura.md`.

---

## 1. Visión del proyecto

Construir un **copiloto personal de finanzas** que permita registrar, visualizar y entender
rápido los gastos, ingresos e inversiones de una persona, reemplazando la hoja de cálculo
manual por un flujo digital ágil y **potenciado con IA**.

La solución se compone de:

- **Dashboard de finanzas:** vista única de cuentas, gastos, ingresos, inversiones, notas y
  categorías, con resumen del mes y movimientos recientes.
- **Entrada sin fricción:** registro manual por formulario, registro por **voz** (dictado),
  e importación masiva por CSV.
- **Análisis con IA:** convierte texto libre ("45 mil en almuerzo y 18 mil en taxi") en
  movimientos estructurados que el usuario revisa y confirma antes de guardar.
- **Inversiones:** un **ledger** de 10 columnas (alineado con `Inversiones 2025.xlsx`) con
  export CSV/XLSX, import CSV, **OCR por visión** de capturas de broker, y un portafolio con
  posiciones y P&L usando cotizaciones en vivo.
- **IA intercambiable:** proveedor **local** (Ollama) o **nube** (Gemini / compatible
  OpenAI como OpenRouter o Groq), seleccionable desde Configuración. La app funciona sin IA
  para el registro manual.
- **App de escritorio:** un `.exe` portátil de Windows que sirve frontend + API en un solo
  proceso, con datos persistentes locales.

La visión es mantener el control financiero **rápido, privado y propio**: los datos viven en
archivos locales del usuario, y la IA es un acelerador opcional, no un requisito.

---

## 2. Problema que resolvemos

Llevar las finanzas personales en una hoja de cálculo o de memoria es lento y propenso a error:

- Anotar cada gasto a mano (fecha, cuenta, categoría, monto) desincentiva el registro.
- Consolidar gastos, ingresos e inversiones en una sola vista exige fórmulas y mantenimiento.
- Pasar las operaciones de un broker a una tabla es trabajo manual y repetitivo.
- Sacar estadísticas (gasto por categoría, evolución, saldos por cuenta) requiere armar
  gráficos a mano cada vez.
- Las apps de finanzas en la nube implican ceder los datos a un tercero.

Delfos unifica registro, almacenamiento y visualización en una sola herramienta **local-first**:
captura por texto/voz/CSV/OCR, clasificación asistida por IA, y un dashboard que ya muestra
resúmenes y gráficos. El usuario conserva sus datos en archivos JSON propios.

---

## 3. Objetivo general

Implementar una aplicación que permita:

- **Registrar** gastos, ingresos, inversiones y notas de forma rápida: manual, por voz, por
  análisis de texto con IA, por importación CSV o por OCR de capturas.
- **Visualizar** el estado financiero: resumen mensual, saldos por cuenta y moneda,
  movimientos recientes, gasto por categoría y evolución del gasto.
- **Gestionar inversiones** con un ledger detallado (operación, fecha, activo, cantidad,
  montos USD/COP, precio unitario, costo de cierre, P/G, total), export/import y un portafolio
  con valor de mercado y P&L.
- **Elegir el motor de IA** (local u nube) sin cambiar el flujo de uso, manteniendo el secreto
  (API key) solo en el backend.
- **Funcionar offline y en local**, incluyendo un ejecutable de escritorio que no depende de
  Docker ni Node.

---

## 4. Definiciones de negocio clave

### 4.1 Qué es un gasto (expense)

Salida de dinero asociada opcionalmente a una cuenta. Tiene monto, moneda (COP por defecto),
categoría con emoji, descripción, método de pago y fecha. Al guardarse resta del saldo de la
cuenta asociada (si la moneda coincide).

### 4.2 Qué es un ingreso (income)

Entrada de dinero asociada opcionalmente a una cuenta. Tiene monto, moneda, categoría,
descripción y fuente. Suma al saldo de la cuenta asociada.

### 4.3 Qué es una inversión (investment)

Operación sobre un activo: **compra**, **venta**, **depósito** o **dividendo**
(`operation_type`). Además del monto y la moneda (USD por defecto), guarda los campos del
ledger: activo, cantidad, monto USD, monto COP, precio unitario, costo de cierre,
ganancia/pérdida USD y total. Una **compra** resta del saldo de la cuenta asociada.

### 4.4 Qué es una cuenta (account)

Origen/destino de movimientos (efectivo, banco, tarjeta crédito/débito, billetera, broker,
cripto, ahorros, otro). Tiene nombre, tipo, moneda, saldo inicial, saldo actual y emoji. El
saldo actual se ajusta automáticamente con gastos, ingresos e inversiones de su misma moneda.

### 4.5 Qué es una categoría (category)

Etiqueta reutilizable con emoji y un `kind` (`expense`, `income`, `investment`, `general`,
`note`). Clasifica movimientos y alimenta el gráfico de gasto por categoría. Existen categorías
por defecto; el usuario y la IA pueden crear nuevas.

### 4.6 Qué es una nota (note)

Texto libre con fecha, cuenta opcional y tags. Sirve como recordatorio/reflexión y como
**fallback**: cuando la IA no logra clasificar un texto, este puede guardarse como nota.

### 4.7 Qué es el ledger de inversiones

La tabla central de 10 columnas (alineada con `Inversiones 2025.xlsx`): Tipo de Operación,
Fecha, Activo, Cantidad, Monto USD, Monto COP, Precio Unitario, Costo de Cierre,
Ganancia/Pérdida USD y Total. Es la representación canónica para export/import y OCR.

### 4.8 Qué es el portafolio (portfolio)

Agregación derivada del ledger: por cada activo abierto calcula cantidad, costo base, valor de
mercado (con cotización en vivo vía yfinance) y P&L no realizado; suma además el P&L realizado
de ventas y dividendos. No se almacena: se calcula a partir de las inversiones.

### 4.9 Qué es el análisis con IA (analyze + confirm)

Flujo en dos pasos: el usuario manda texto libre → la IA devuelve una **vista previa** de
movimientos sugeridos (gastos, inversiones, notas) → el usuario revisa, ajusta y **confirma**;
solo entonces se persisten. La IA nunca guarda sin confirmación.

### 4.10 Qué es el OCR de inversiones

Igual patrón previo+confirmación, pero a partir de una **imagen** (captura de broker): un modelo
de visión extrae filas del ledger que el usuario revisa antes de guardar.

---

## 5. Poblaciones objetivo (usuarios)

### 5.1 Persona que lleva sus finanzas personales

**Objetivos:**
- Registrar gastos e ingresos del día a día sin fricción.
- Ver en un vistazo cuánto gastó, en qué y con qué saldo quedó cada cuenta.

**Necesidades:**
- Registro rápido (manual, voz, texto con IA).
- Resúmenes y gráficos sin tener que armarlos.
- Datos propios y privados.

### 5.2 Inversionista individual

**Objetivos:**
- Llevar el detalle de sus operaciones (compra/venta/depósito/dividendo).
- Conocer su posición actual y su P&L.

**Necesidades:**
- Ledger fiel a su hoja de cálculo, con export/import.
- OCR para no transcribir capturas a mano.
- Portafolio con valor de mercado y ganancia/pérdida.

### 5.3 Usuario celoso de su privacidad / offline

**Objetivos:**
- Usar la app sin depender de la nube ni ceder datos.

**Necesidades:**
- Almacenamiento local en archivos JSON.
- IA local opcional (Ollama) o, si decide usar la nube, control explícito y su propia API key.
- Un ejecutable que funcione sin instalar stack de desarrollo.

---

## 6. Alcance funcional por etapas

### 6.1 Etapa 1 — Núcleo de finanzas (implementado)

- Dashboard con resumen mensual, saldos por cuenta/moneda y movimientos recientes.
- CRUD de cuentas, gastos, ingresos, inversiones, notas y categorías.
- Ajuste automático de saldos al registrar movimientos.
- Categorías por defecto y categorías personalizadas.
- Gráficos: gasto por categoría y evolución del gasto (7d/30d/mensual), saldos por cuenta.

### 6.2 Etapa 2 — Captura asistida e inversiones (implementado / en evolución)

**Captura:**
- Entrada manual por formularios y entrada por **voz**.
- **Análisis de texto con IA** (`/api/analyze` + `/api/confirm-analysis`) con vista previa y
  confirmación, sugerencia de cuenta y de nueva categoría.
- **Importación masiva CSV** de gastos, ingresos, notas y cuentas (con vista previa).

**Inversiones:**
- Ledger de 10 columnas con export **CSV/XLSX** e import **CSV**.
- **OCR** de capturas de broker por modelo de visión (`/api/investments/ocr` + `/ocr/confirm`).
- Portafolio con posiciones, costo base, valor de mercado (motor en capas: Twelve Data → Alpha Vantage → yfinance → precio importado) y P&L realizado/no realizado.

**IA multi-proveedor:**
- Proveedor **local** (Ollama) o **nube** (Gemini / compatible OpenAI: OpenRouter, Groq).
- Configuración desde la UI; API key solo en backend; health-check y test de conexión.

**Distribución:**
- **App de escritorio** `.exe` portátil (waitress), datos en `%LOCALAPPDATA%\Delfos\data`.

### 6.3 Etapa 3 — Reportes y más IA (futuro)

- Más reportes y estadísticas (rangos, comparativos, presupuestos).
- Mayor potenciación con IA (insights, resúmenes, categorización más fina).
- UI para el endpoint de charts más allá de lo actual.

---

## 7. Reglas de negocio y validaciones

- Un gasto/ingreso/inversión sin monto válido se rechaza (monto obligatorio).
- Una nota requiere texto no vacío.
- Registrar un gasto resta del saldo de la cuenta asociada; un ingreso suma; una **compra** de
  inversión resta. El ajuste solo aplica si la moneda del movimiento coincide con la de la cuenta.
- Borrar una cuenta no borra sus movimientos: los desvincula (`account_id = null`).
- La IA **nunca persiste** directamente: produce una vista previa que el usuario confirma.
- El OCR y el análisis de texto marcan filas que **necesitan revisión** (p. ej. monto o activo
  faltante) y advierten posibles alucinaciones (totales recalculados, P/G en compras, etc.).
- En compras y depósitos, la ganancia/pérdida (`pnl_usd`) siempre es `null`.
- La moneda por defecto es COP para gastos/ingresos y USD para inversiones.
- En español colombiano, "mil" multiplica por 1000 al interpretar montos.
- El restablecimiento de datos exige confirmación explícita (`"RESTABLECER"`).
- El secreto de IA (API key) vive solo en el backend; al cliente se le entrega enmascarado.

---

## 8. Arquitectura conceptual del proyecto

- **Frontend:** Astro (páginas) que montan "screens" Svelte como islands; UI por feature
  (dashboard, inversiones, settings) sobre componentes compartidos (atomic design); cliente
  HTTP y estado global centralizados.
- **Backend:** API REST en Flask que orquesta request/response y delega en una capa de
  **servicios** (lógica de negocio + persistencia en JSON) y en una capa de **integraciones**
  (proveedores de IA intercambiables vía adapter + registry).
- **Almacenamiento:** archivos JSON locales (local-first), sin base de datos.
- **IA:** opcional e intercambiable; el dominio solo conoce una interfaz común, no el proveedor.

> El detalle completo (capas, carpetas, flujos de datos, patrón de integración de IA, reglas y
> prohibiciones para agentes) está en `docs/01_arquitectura.md`.

---

## 9. Entidades principales del dominio

**Finanzas:**
- Account (cuenta)
- Expense (gasto)
- Income (ingreso)
- Investment (inversión / fila del ledger)
- InvestmentAsset (activo/ticker conocido)
- Note (nota)
- Category (categoría con `kind`)

**Derivados (no persistidos):**
- Summary (resumen mensual y de saldos)
- Movement (vista unificada de movimientos recientes)
- ChartData (gasto por categoría, evolución, saldos)
- PortfolioInsights (posiciones, P&L, cotizaciones)
- AnalysisPreview / OcrPreview (vistas previas de IA antes de confirmar)

**IA / configuración:**
- AiSettings (proveedor, modelos, base_url, cloud_enabled, api_key)
- AIIntegration (contrato común de proveedor)

---

## 10. Métricas de éxito

- Tiempo para registrar un movimiento (objetivo: segundos).
- Proporción de movimientos capturados por IA/voz/CSV/OCR vs manual puro.
- Precisión percibida del análisis de IA (cuántas filas se confirman sin editar).
- Frecuencia de uso del dashboard y de los gráficos.
- Adopción del ledger e import/export de inversiones.
- Funcionamiento sin IA cuando el usuario no configura ningún proveedor.

---

## 11. Restricciones y supuestos

### Restricciones

- **Almacenamiento local en JSON** (sin base de datos); el archivo de datos es la fuente de verdad.
- La **IA es opcional**: el registro manual y la importación funcionan sin proveedor.
- El **OCR local** requiere un modelo de visión en Ollama (`OLLAMA_VISION_MODEL`, p. ej. `llava`);
  sin él, el OCR local responde 503 con instrucción de instalación.
- El **portafolio** depende de cotizaciones externas (yfinance); puede haber datos parciales o
  desactualizados (cache TTL en memoria).
- El **`.exe`** es específico de Windows; Mac/Linux requieren compilar en cada SO.
- Montos y monedas se manejan tal como se registran; no hay conversión automática de divisas.

### Supuestos

- El usuario es el dueño de sus datos y acepta gestionarlos localmente.
- Si usa IA en la nube, aporta su propia API key y acepta enviar sus textos/imágenes a ese proveedor.
- Las capturas de broker que sube al OCR son legibles y en español (etiquetas tipo "Compra",
  "Monto", "Precio de ejecución").

---

## 12. Decisiones pendientes

- Alcance y forma de los nuevos reportes/estadísticas (rangos, presupuestos, comparativos).
- Qué insights de IA aportan más valor sin volverse intrusivos.
- Si y cómo exponer en UI el endpoint de charts adicional.
- Estrategia de migración del esquema JSON a medida que crecen los campos.
- Soporte multi-SO del ejecutable de escritorio.

---

## 13. Visión a largo plazo

Consolidar Delfos como un **copiloto financiero personal** confiable y privado:

- Registro casi sin esfuerzo (texto, voz, foto) con clasificación inteligente.
- Reportes y estadísticas ricas que respondan "¿en qué se me va el dinero?" y "¿cómo van mis
  inversiones?" sin trabajo manual.
- IA opcional, intercambiable y bajo control del usuario (local o nube).
- Datos siempre propios y portables.

---

## 14. Glosario de términos

| Término | Definición |
|---------|------------|
| Copiloto | Asistente que acelera registro y análisis financiero; no decide por el usuario |
| Local-first | Los datos viven en archivos locales (JSON), no en un servidor remoto |
| Gasto | Salida de dinero; resta del saldo de la cuenta asociada |
| Ingreso | Entrada de dinero; suma al saldo de la cuenta asociada |
| Inversión | Operación sobre un activo (compra/venta/depósito/dividendo) en el ledger |
| Cuenta | Origen/destino de movimientos con saldo y moneda |
| Categoría | Etiqueta con emoji y `kind` para clasificar movimientos |
| Nota | Texto libre con tags; también fallback cuando la IA no clasifica |
| Ledger | Tabla central de 10 columnas de inversiones (export/import/OCR) |
| Portafolio | Agregación derivada del ledger con posiciones y P&L (no se persiste) |
| Movimiento | Vista unificada de gastos/ingresos/inversiones/notas recientes |
| Análisis (IA) | Texto libre → vista previa de movimientos → confirmación del usuario |
| OCR | Imagen de broker → filas del ledger sugeridas → confirmación del usuario |
| Proveedor de IA | Motor que ejecuta la IA: local (Ollama) o nube (Gemini / compatible) |
| Adapter | Implementación concreta de un proveedor bajo el contrato común `AIIntegration` |
| Vista previa | Resultado propuesto por la IA antes de persistir; siempre requiere confirmación |
| P&L | Ganancia/pérdida; realizada (ventas/dividendos) y no realizada (posición abierta) |

---

> Este documento es la base de visión de Delfos.
> Debe leerse junto con `docs/01_arquitectura.md`.
