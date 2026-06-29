# Pilar 2 — Skills

> Cómo escribir skills baratas y útiles: pequeñas, de un solo propósito, y conscientes del coste en tokens.

---

## 1. Filosofía

Una **skill** es conocimiento especializado que el agente carga cuando lo necesita. La regla de oro:

> **Una skill = un propósito. 0.5–3 KB.**

Si una skill hace dos cosas, son dos skills. Si necesita scripts, CSVs y carpetas, probablemente dejó de ser una skill y se volvió un proyecto (ver anti-patrón abajo).

Las skills son la respuesta a "el agente necesita saber X **a veces**". Lo que necesita **siempre** va en una regla; el contexto del producto va en `docs/`.

---

## 2. Anatomía del frontmatter

```markdown
---
name: naming
description: Convenciones de nomenclatura para archivos, variables, endpoints, BD y tests
globs:
  - "*.ts"
  - "*.tsx"
disable-model-invocation: true   # opcional
---

# Skill: Naming

(cuerpo de la skill: tablas, patrones, ejemplos…)
```

| Campo | Para qué sirve |
|-------|----------------|
| `name` | Identificador corto de la skill. |
| `description` | **El campo más importante.** Es lo que el modelo lee SIEMPRE para decidir si invoca la skill. Debe describir con precisión cuándo aplica. |
| `globs` | Archivos para los que la skill es relevante. Ayuda a la auto-invocación contextual. |
| `disable-model-invocation` | Si es `true`, la skill **no** se auto-invoca: solo se carga cuando el usuario la pide explícitamente. |

---

## 3. Auto-invocar vs. bajo demanda

### Auto-invocación (`description` + `globs`)

La skill se activa sola cuando el contexto encaja. Útil para conocimiento que el agente debería aplicar sin que se lo pidan.

> Ejemplo: `naming` con `globs: ["*.ts", "*.tsx"]` → cuando el agente toca TypeScript, conoce las convenciones sin que nadie las invoque.

### Bajo demanda (`disable-model-invocation: true`)

La skill solo se carga si el usuario la nombra. Útil para skills que **no** quieres que se disparen solas, porque:

- son caras (cuerpo grande),
- son de un dominio muy concreto que no aplica a la mayoría de tareas,
- o son un *review* especializado que solo tiene sentido invocar a propósito.

> Ejemplos reales en delfos: `emil-design-eng` y `review-animations` llevan `disable-model-invocation: true`. Son skills de craft de UI/animación: valiosas cuando las pides, pero no deben auto-dispararse en cada cambio de código (encarecerían sesiones que no tienen nada que ver con animaciones).

---

## 4. El coste en tokens (lo que debes entender)

Este es el punto que decide si tu setup de skills es barato o ruinoso:

| Qué | Cuándo se carga en contexto |
|-----|-----------------------------|
| **El catálogo de `description`s** de TODAS las skills | **Siempre**, en cada sesión. |
| **El cuerpo** de una skill | **Solo** cuando esa skill se invoca. |

Consecuencias prácticas:

1. **Las descripciones se pagan siempre.** Diez skills con descripciones largas suman tokens en cada mensaje, las invoques o no. Mantén las descripciones precisas pero concisas.
2. **El cuerpo se paga solo al usarse.** Por eso una skill enfocada es barata: aunque su cuerpo sea de 3 KB, no entra hasta que hace falta.
3. **`disable-model-invocation: true` evita que un cuerpo caro se cargue por error** en tareas no relacionadas.

> Conclusión: muchas skills pequeñas y bien descritas > pocas skills enormes. La granularidad es lo que mantiene el coste bajo control.

---

## 5. Anti-patrón: skills gigantes y genéricas

El error más caro es la **skill monolítica todo-en-uno**.

> Caso real (delfos): una skill tipo `ui-ux-pro-max` que pesaba **~600 KB** — incluía CSVs, scripts de Python y hasta `__pycache__`. Genérica ("todo sobre UI/UX"), sin foco, y un sumidero de tokens. Se borró por completo. El conocimiento de UI que sí se quería conservar ya vivía en skills enfocadas (`emil-design-eng`, `review-animations`) en modo bajo demanda.

Síntomas de que una skill es un anti-patrón:

- Pesa cientos de KB o trae binarios/datos/scripts.
- Su `description` es vaga ("ayuda con X de forma general").
- Hace muchas cosas no relacionadas entre sí.
- Se auto-invoca en tareas que no tienen nada que ver con su tema.

La cura: **partirla** en skills de un solo propósito, **adelgazarla** (mover datos fuera), o **borrarla** si su contenido ya existe en otro sitio (sube la escalera ponytail: ¿hace falta que exista?).

---

## 6. Checklist de calidad de una skill

- [ ] Hace **una** cosa (un solo propósito claro).
- [ ] Pesa entre ~0.5 y ~3 KB. Si pesa mucho más, justifícalo o pártela.
- [ ] `description` precisa: deja claro **cuándo** aplica (eso decide la auto-invocación).
- [ ] `globs` correctos si debe auto-invocarse por tipo de archivo.
- [ ] `disable-model-invocation: true` si NO debe dispararse sola.
- [ ] Sin datos pesados embebidos (CSVs, binarios, `__pycache__`).
- [ ] No duplica lo que ya está en una regla o en `docs/`.
- [ ] Cuerpo accionable: tablas, patrones y ejemplos, no prosa larga.

---

## 7. Ejemplos reales

**`naming`** (eshu) — auto-invocable, ~1 KB, `globs: ["*.ts", "*.tsx"]`. Tablas compactas: cómo nombrar archivos/clases (interfaces con prefijo `I`, use cases con sufijo `UseCase`…), variables, endpoints (kebab-case, plural, versionados), BD (snake_case) y tests. Un solo propósito: nomenclatura.

**`testing`** (eshu) — auto-invocable por `globs` de carpetas de test (`**/__tests__/**`, `*.spec.*`). Define cobertura mínima, escenarios mínimos por tipo (use case: éxito + error + input inválido), el patrón Arrange/Act/Assert y el comando de validación. Foco único: cómo y qué testear.

> Ambas comparten la receta: frontmatter mínimo, descripción precisa, cuerpo en tablas, un solo tema. Esa es la skill que sale barata y se usa.

Siguiente pilar: [`03-agentes-y-flujo.md`](03-agentes-y-flujo.md).
