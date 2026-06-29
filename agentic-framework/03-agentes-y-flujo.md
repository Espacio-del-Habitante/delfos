# Pilar 3 — Agentes y flujo

> Cómo trabajar con el pipeline de subagentes: quién hace qué, qué frena la entrega y qué evidencias se exigen.

---

## 1. El pipeline end-to-end

Una tarea (HU o tarea técnica) recorre cinco roles. Cada uno tiene un trabajo y **no invade** el del siguiente. Un orquestador los encadena sin esperar instrucciones intermedias.

```
Planner  →  Implementer  →  Tester  →  Quality-gate  →  Delivery-orchestrator
(planea)    (escribe)       (verifica)  (gates F1/F2)    (commit/push + PR + evidencias)
```

| Subagente | Hace | NO hace |
|-----------|------|---------|
| **Planner** | Refina la tarea si está ambigua y produce un plan (archivos a crear/modificar, capas, dependencias, orden). | NO escribe código. |
| **Implementer** | Escribe el código de producción siguiendo la arquitectura, en orden de capas. | NO escribe tests ni gestiona PRs. |
| **Tester** | Escribe tests para lo importante y los ejecuta. | NO toca código de producción salvo que un test revele un bug. NO hace commit. |
| **Quality-gate** | Ejecuta los gates (F1/F2), hace commit/push y valida calidad externa si está configurada. | NO diseña arquitectura. |
| **Delivery-orchestrator** | Encadena todo end-to-end y cierra con evidencias y DoD. Crea PRs cuando el usuario lo pide. | NO salta pasos del flujo. |

> El **delivery-orchestrator** es el que tiene "autonomía alta": ejecuta Planner → Implementation → Tester → Quality gates → entrega, sin pedir permiso entre etapas, deteniéndose solo ante un bloqueo real.

### Rol de cada subagente (detalle)

**Planner** — Lee el contexto obligatorio (`docs/00_vision.md`, `docs/01_arquitectura.md`), valida el estado de la tarea (si es básica/ambigua, la refina primero), identifica entidades/capas/contratos afectados y produce un plan con formato fijo. Si hay dependencias no implementadas, las lista como **bloqueantes**.

**Implementer** — Verifica que exista un plan (o analiza la tarea si es simple) e implementa **en orden de capas** (negocio → infraestructura → presentación), respetando nomenclatura y solo librerías aprobadas. Si falta un contrato, lo crea siguiendo la arquitectura; si algo no está claro, **pregunta**. Reporta archivos creados/modificados y contratos que necesitan tests.

**Tester** — Identifica lo que tocó el implementer y escribe tests para **lo importante** (no cobertura por cobertura). Mockea dependencias externas, testea comportamiento (no implementación) y ejecuta la suite. Una cobertura baja **no es motivo para detenerse**: es motivo para escribir más tests donde aportan.

**Quality-gate** — Ejecuta F1/F2, corrige y re-ejecuta si fallan, hace commit/push y, si hay validación de calidad externa (p. ej. SonarCloud), la valida **solo por el PR**. Si no está configurada, lo deja como evidencia explícita y no bloquea el cierre local.

**Delivery-orchestrator** — Junta todo: contexto → pipeline → entrega. Cuando el usuario pide PRs, los crea con `gh pr create` hacia las ramas acordadas y reporta las URLs. Cierra con el formato de salida obligatorio (ver §4).

---

## 2. Gates: bloqueantes vs. opcionales

Los gates son los puntos de control antes de entregar.

| Gate | Qué valida | Carácter | Si falla |
|------|------------|----------|----------|
| **F1 — Tests** | Suite de tests / cobertura | **Opcional** (recomendado para lo importante: lógica de negocio, repos, servicios críticos) | No bloquea. Escribir más tests donde aporten. |
| **F2 — Build** | El proyecto compila/construye sin errores | **BLOQUEANTE** | Corregir y repetir **antes** de push. |

> Regla dura: **F2 debe pasar ANTES de cualquier push.** No se entrega código que no construye. F1 acompaña: no se persigue un número de cobertura por el número, se cubre lo que de verdad importa.

Los comandos exactos dependen del stack y se definen en la regla de workflow del proyecto (p. ej. `npm run build` / `yarn build` para F2; `npx jest --coverage` para F1). El método fija el **carácter** de cada gate, no el comando.

---

## 3. Definición de Done (DoD)

Una tarea está terminada cuando:

- [ ] **F2 (build) OK** — evidencia real del output.
- [ ] **F1 (tests)** ejecutados si aplicaban a archivos importantes.
- [ ] Sin errores de tipos/lint introducidos.
- [ ] Commit + push hechos (el código está en el remoto).
- [ ] PR creado **si** el usuario pidió proceso con PR (URL reportada).
- [ ] **Evidencias** adjuntas (ver §4).

---

## 4. Exigencia de evidencias reales

Principio no negociable: **no se afirma una ejecución que no se hizo.**

> En las reglas de eshu aparece literal entre las prohibiciones absolutas: *"Decir que se ejecutó algo sin haberlo hecho"* y *"Cerrar sin evidencias"*. Las evidencias son parte de la entrega, no un extra.

Formato de cierre del delivery-orchestrator:

1. Resumen de lo implementado.
2. Archivos creados/modificados.
3. Tests agregados (si aplica) y resultado.
4. **Resultado real de F1 y F2** (output, no "debería pasar").
5. Commit(s) y rama.
6. URLs de PRs (si aplica).
7. Evidencia de calidad externa (si estaba configurada) o nota explícita de que no lo está.
8. Checklist DoD completa.

---

## 5. Autonomía y cuándo DETENERSE

El agente avanza solo de principio a fin. Pero hay frenos explícitos. **Detente y pregunta** cuando:

- La tarea/HU **no es clara o es ambigua** (criterios, alcance). No se adivina el requerimiento.
- No hay match de proyecto/módulo o no encaja con la arquitectura definida.
- Hay **dependencias no implementadas** que bloquean.
- Aparece un **error 403 / problema de conectividad**: detenerse, listar los dominios necesarios, explicar por qué, y **no continuar**.
- Falta autenticación o configuración para entregar (p. ej. `gh` auth, tokens): detenerse y dar los pasos.

Y sigue solo (sin preguntar entre pasos) cuando el flujo ya está definido y no hay bloqueo: ahí la autonomía es el comportamiento esperado, no esperar instrucciones para el siguiente paso.

> Resumen de la actitud: **autonomía alta + frenos duros.** Avanza hasta cerrar todo el proceso; solo te detienes ante información bloqueante o un riesgo real (conectividad, falta de contexto, dependencia ausente).

---

## 6. Checklist del flujo

- [ ] El Planner leyó `docs/` antes de planear.
- [ ] El Implementer respetó capas y nomenclatura, sin librerías no aprobadas.
- [ ] El Tester cubrió lo importante (no número por número).
- [ ] F2 (build) pasó **antes** del push.
- [ ] Hay evidencias reales de F1/F2 en el cierre.
- [ ] DoD completa.
- [ ] Ante ambigüedad/403/dependencia ausente → se detuvo y preguntó.

Volver al [README](README.md) · plantillas en [`templates/`](templates/).
