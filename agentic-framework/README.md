# Framework agéntico de victorhurtado

> Guía práctica y reutilizable del método de trabajo con agentes de IA.
> Es **agnóstica al proyecto**: describe el método, no la implementación de un repo concreto.
> Los ejemplos vienen de proyectos reales (`eshu`, `delfos`).

---

## Qué es esto

Un **framework de trabajo agéntico**: un conjunto de convenciones para que un agente de IA (Cursor, Codex, etc.) trabaje sobre un repositorio **con contexto, autonomía y evidencias**, en lugar de re-explorar el código en cada sesión y entregar afirmaciones sin verificar.

No es una librería ni un runtime. Es un **método** que vive como archivos de texto dentro de `.cursor/` y `docs/`, y que se copia de un proyecto a otro.

La idea central: **el mejor código es el que no se escribe** (lazy/ponytail) y **el mejor contexto es el que no se vuelve a descubrir** (fuente de verdad escrita una vez).

---

## Las 4 piezas que colaboran

El método se apoya en cuatro capas que se leen en cascada. Cada una alimenta a la siguiente:

```
docs/              →   .cursor/rules/   →   .cursor/skills/   →   .cursor/agents/
(fuente de verdad)     (siempre activas)    (bajo demanda)        (pipeline de entrega)
```

| Pieza | Qué es | Cuándo se carga | Tamaño/coste |
|-------|--------|-----------------|--------------|
| **`docs/`** | Visión + arquitectura del proyecto. La **fuente de verdad** que el agente NO debe inventar ni re-descubrir. | Cuando una regla obliga a leerlo (antes de codear). | Medio; se lee una vez por sesión. |
| **`.cursor/rules/`** | Reglas cortas y numeradas. Principios, prohibiciones, workflow. | `alwaysApply: true` → siempre en contexto. | Mínimo (por eso son cortas). |
| **`.cursor/skills/`** | Conocimiento especializado de un solo propósito (naming, testing, un review concreto). | Su *descripción* siempre; su *cuerpo* solo al invocarse. | Pequeño (0.5–3 KB cada una). |
| **`.cursor/agents/`** | Subagentes con un rol (planner, implementer, tester, quality-gate, delivery). | Al ejecutar el pipeline. | Medio. |

> Regla práctica: lo que el agente **siempre** debe saber va en una `rule` corta; lo que necesita **a veces** va en una `skill`; el **contexto del producto** va en `docs/`; el **proceso de entrega** va en `agents/`.

---

## El ciclo de vida agéntico

Cada tarea recorre el mismo pipeline. Los gates son los puntos de control no negociables.

```
1. Leer contexto      docs/00_vision.md + docs/01_arquitectura.md (obligado por una rule)
        ↓
2. Planner            refina la tarea/HU si hace falta y produce un plan (NO escribe código)
        ↓
3. Implementación     escribe el mínimo código que funciona, respetando la arquitectura
        ↓
4. Tester             tests para lo importante (no cobertura por cobertura)
        ↓
5. Gates              F1 (tests, opcional) · F2 (build, BLOQUEANTE)
        ↓
6. Delivery           commit/push + (PR si se pide) con EVIDENCIAS reales y DoD completa
```

- Si en cualquier punto **falta información bloqueante** → DETENERSE y preguntar.
- No se afirma una ejecución que no se hizo. Las evidencias (output real de build/test, URL del PR) son parte de la entrega.

Detalle completo en [`03-agentes-y-flujo.md`](03-agentes-y-flujo.md).

---

## Principios

1. **Lazy / ponytail — el mejor código es el que no se escribe.**
   Antes de escribir, sube la escalera: ¿hace falta? (YAGNI) ¿ya existe en el repo? ¿lo cubre la stdlib o la plataforma? ¿una dependencia ya instalada? ¿cabe en una línea? Solo entonces, escribe el mínimo que funciona. Borrar > añadir. Aburrido > ingenioso.

2. **Contexto como fuente de verdad.**
   La visión y la arquitectura se escriben una vez en `docs/` y se leen al empezar. El agente **no re-explora** el repo cada sesión ni reinventa decisiones ya tomadas. Esto ahorra tokens y evita deriva arquitectónica.

3. **Skills pequeñas y enfocadas.**
   Una skill = un propósito. 0.5–3 KB. El catálogo de descripciones se carga siempre, así que muchas skills gigantes y genéricas (anti-patrón tipo `ui-ux-pro-max`) disparan el consumo de tokens sin aportar foco. Ver [`02-skills.md`](02-skills.md).

4. **Autonomía con gates.**
   El agente avanza solo de principio a fin, sin pedir permiso en cada paso. Pero hay frenos: el build (F2) **debe** pasar antes de entregar, y ante una decisión bloqueante o un 403 de conectividad, se detiene y pregunta.

5. **Portabilidad.**
   Reglas sin rutas duras, decisiones de proyecto centralizadas, plantillas con placeholders. La carpeta `.cursor/` (y este framework) se copia a otro repo y se parametriza en minutos. Ver [`templates/`](templates/).

---

## Los 3 pilares

| Pilar | Documento | Responde a |
|-------|-----------|------------|
| **Estructura** | [`01-estructura-de-proyecto.md`](01-estructura-de-proyecto.md) | ¿Cómo organizo el repo, `docs/` y las reglas? |
| **Skills** | [`02-skills.md`](02-skills.md) | ¿Cómo escribo skills baratas y útiles? |
| **Agentes** | [`03-agentes-y-flujo.md`](03-agentes-y-flujo.md) | ¿Cómo trabajo con el pipeline de subagentes? |

Y [`templates/`](templates/) tiene las plantillas para arrancar un proyecto nuevo sin partir de cero.

---

## Cómo adoptarlo en un proyecto nuevo

1. Copia `agentic-framework/templates/` y crea tu `docs/00_vision.md` y `docs/01_arquitectura.md` a partir de las plantillas.
2. Crea una regla mínima `.cursor/rules/00-context.mdc` (`alwaysApply`) que obligue a leer esos dos docs antes de codear.
3. Añade solo las skills que de verdad uses (empieza por `naming` y `testing`).
4. Copia los agentes del pipeline y ajusta los comandos de build/test a tu stack.
5. Valida el flujo con una tarea de prueba pequeña.
