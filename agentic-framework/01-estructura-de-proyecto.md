# Pilar 1 — Estructura de proyecto

> Cómo organizar un repo para que un agente trabaje bien: dónde vive el contexto, cómo se escriben las reglas y qué va en cada sitio.

---

## 1. El árbol estándar

La estructura tiene dos mitades: la del **producto** (`backend/`, `frontend/`, etc., propia de cada stack) y la del **método agéntico** (`docs/` + `.cursor/`), que es la que se repite proyecto a proyecto.

```
mi-proyecto/
├── docs/                      # FUENTE DE VERDAD del producto
│   ├── 00_vision.md           #   qué construimos y por qué (negocio)
│   └── 01_arquitectura.md     #   cómo está construido (técnico)
├── .cursor/
│   ├── rules/                 # reglas cortas, numeradas, casi siempre activas
│   │   ├── 00-context.mdc     #   obliga a leer docs/ antes de codear
│   │   └── ponytail.mdc       #   principios (lazy senior dev)
│   ├── skills/                # conocimiento especializado, bajo demanda
│   │   ├── naming/SKILL.md
│   │   └── testing/SKILL.md
│   └── agents/                # subagentes del pipeline de entrega
│       ├── planner.md
│       ├── implementer.md
│       ├── tester.md
│       ├── quality-gate.md
│       └── delivery-orchestrator.md
├── backend/                   # el producto (varía por stack)
└── frontend/
```

> El método NO impone cómo organizas `backend/` o `frontend/`: eso lo decides tú y lo documentas en `docs/01_arquitectura.md`. Lo que el método fija es **que esa decisión esté escrita y sea la fuente de verdad**.

**Ejemplos reales del árbol de producto** (cada proyecto lo describe en su `docs/01_arquitectura.md`):

- **eshu** (Charada): mobile con Clean Architecture — `src/` dividido en `domain/`, `infrastructure/`, `presentation/`, con IoC (InversifyJS).
- **delfos**: `backend/` Flask por capas (`app.py` routing → `services/` lógica+persistencia JSON → `integrations/` adapters de IA) y `frontend/` Astro + Svelte islands organizado por features (`features/{dashboard,inversiones,settings}`) + atomic design en `common/`.

Dos stacks muy distintos, el **mismo método** alrededor.

---

## 2. Qué va en `docs/` (la fuente de verdad)

Dos documentos núcleo, en español, escritos una sola vez y mantenidos cuando cambia algo grande. Su propósito es que el agente **no tenga que re-explorar ni re-decidir**.

### `docs/00_vision.md` — visión (negocio)

El "qué" y el "por qué". Secciones típicas (ver plantilla):

- Visión, problema que resuelve, objetivo general.
- Definiciones de negocio (el vocabulario del dominio).
- Usuarios, alcance por etapas (lo ya implementado vs. lo futuro).
- Reglas de negocio, entidades del dominio, restricciones/supuestos.
- Métricas, visión a largo plazo, glosario.

> Ejemplo delfos: "copiloto personal de gastos e inversiones con visualización rápida + estadísticas/reportes, potenciado con IA". Define qué es un *gasto*, un *ingreso*, una *inversión*, un *ledger*, etc., para que el agente use el mismo vocabulario que el negocio.

### `docs/01_arquitectura.md` — arquitectura (técnico)

El "cómo". Es **la** referencia que el agente debe respetar. Empieza siempre con un encabezado que deje claro su rol:

```markdown
> Este documento define la arquitectura obligatoria del proyecto.
> Es la fuente de verdad para cualquier implementación.
> Los agentes DEBEN leer este documento ANTES de escribir código.
```

Secciones típicas: vista rápida (diagrama de una línea), principios, capas y responsabilidades, estructura de carpetas real, flujo de datos, y **reglas/prohibiciones clave** para el agente.

> Ejemplo eshu: `Presentation → Domain ← Infrastructure`, dependencias hacia adentro, Domain puro.
> Ejemplo delfos: `Frontend (Astro+Svelte) ↔ REST API (Flask) → Services → Integrations (IA) + JSON store`, patrón adapter/registry para IA intercambiable, local-first.

---

## 3. Cómo se escriben las REGLAS (`.cursor/rules/`)

Las reglas son el contrato permanente del agente. **Cortas, numeradas y mínimas.**

### Frontmatter

```markdown
---
description: Una línea que dice de qué trata la regla
alwaysApply: true        # o se omite y se usa globs
---
```

### `alwaysApply` vs scoped por `globs`

| Modo | Cuándo usarlo | Coste |
|------|---------------|-------|
| `alwaysApply: true` | Principios y workflow que aplican a **todo** el repo. | Está SIEMPRE en contexto → mantenla mínima. |
| `globs: [...]` | Reglas que solo aplican a ciertos archivos (ej. `"*.ts"`). | Solo entra cuando tocas esos archivos. |

> Si una regla con `alwaysApply` crece, estás pagando tokens en cada mensaje. Mueve el detalle a una skill o a `docs/`.

### Numeración

Numera las reglas por orden de lectura conceptual: `00-context`, `01-workflow`, etc. Las globales y transversales primero.

### Qué va en una REGLA vs. en una SKILL

| Va en una **rule** | Va en una **skill** |
|--------------------|---------------------|
| Lo que el agente debe saber **siempre** | Lo que necesita **a veces** |
| Principios, prohibiciones, workflow | Conocimiento de un dominio concreto (naming, testing, un review) |
| Idioma, rol del agente, gates | Tablas de referencia, patrones, checklists especializadas |
| Corto (idealmente < ~40 líneas) | Pequeño y enfocado (0.5–3 KB) |
| Obliga a leer `docs/` | Detalle que se carga bajo demanda |

### Ejemplos reales

**eshu — `00-core.mdc`** (principios, siempre activa). Define idioma, rol ("el agente IMPLEMENTA arquitectura, NO la diseña"), una tabla de prohibiciones absolutas y la conducta ante un 403. Apunta a `docs/` y a las skills de naming/libraries en vez de repetir su contenido.

**eshu — `01-workflow.mdc`** (workflow, siempre activa). El orden: leer contexto → leer la HU (si no es clara, DETENERSE) → identificar capas → ejecutar el pipeline. Define los gates (F1 tests opcional, F2 build bloqueante) y la Definición de Done.

**delfos — `ponytail.mdc`** (principios, siempre activa). Codifica el modo "lazy senior dev": la escalera de decisión antes de escribir código, bug fix = root cause no síntoma, y "marca las simplificaciones intencionales con un comentario `ponytail:`".

**delfos — `00-context.mdc`** (contexto, siempre activa, mínima). ~10 líneas que obligan a leer `docs/00_vision.md` y `docs/01_arquitectura.md` antes de tocar código y a respetar la arquitectura definida ahí. Es el puente entre `docs/` y el agente.

> Patrón clave: una regla `alwaysApply` no contiene la arquitectura — **obliga a leerla**. El contenido vive en `docs/`, donde es barato mantenerlo.

---

## 4. Checklist de estructura

- [ ] Existe `docs/00_vision.md` y `docs/01_arquitectura.md`.
- [ ] `01_arquitectura.md` empieza declarándose "fuente de verdad, leer antes de codear".
- [ ] Hay una regla `alwaysApply` mínima que obliga a leer `docs/`.
- [ ] Las reglas `alwaysApply` son cortas (sin volcar arquitectura ni catálogos dentro).
- [ ] Lo especializado está en skills, no en reglas.
- [ ] Las reglas evitan rutas duras → portables a otro repo.

Siguiente pilar: [`02-skills.md`](02-skills.md).
