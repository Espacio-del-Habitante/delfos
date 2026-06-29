---
name: review-animations
description: Specialized motion and animation review for frontend diffs. Use when Codex is asked to review animation, transitions, gestures, motion performance, easing, duration, reduced-motion support, or UI feel. This skill reviews motion only and should produce findings before summaries.
---

# Reviewing Animations

Haz una review especializada de motion. No implementes features ni revises codigo no relacionado con animacion, excepto cuando afecte directamente la experiencia de motion.

Para valores precisos, curvas, duraciones y reglas detalladas, lee `references/STANDARDS.md` antes de emitir findings.

## Estandares No Negociables

1. Toda animacion debe tener proposito: spatial consistency, state indication, feedback, explanation o evitar cambios bruscos.
2. Acciones de teclado o 100+ veces/dia no se animan.
3. `ease-in` en UI es finding. Entradas/salidas usan `ease-out` o curva custom fuerte.
4. UI motion debe estar bajo 300ms salvo justificacion.
5. Popovers/dropdowns/tooltips escalan desde el trigger; no desde centro. Nunca usar `scale(0)`.
6. Motion rapidamente disparado debe ser interruptible: transitions o springs, no keyframes que reinician.
7. Animar solo `transform` y `opacity` salvo justificacion.
8. Respetar `prefers-reduced-motion` y gatear hover motion en dispositivos con hover real.
9. Timing asimetrico cuando el usuario decide lento y el sistema responde rapido.
10. Motion debe coincidir con la personalidad del producto.

## Triggers De Bloqueo

Bloquea o marca con severidad alta:

- `transition: all`
- `scale(0)` en entrada
- `ease-in` en interaccion UI
- animacion en keyboard shortcut o accion de alta frecuencia
- duracion UI > 300ms sin razon
- `transform-origin: center` en popover/dropdown/tooltip anclado
- keyframes en toasts, toggles o triggers rapidos
- animar layout properties
- falta de `prefers-reduced-motion` en movimiento
- hover motion sin media query

## Formato Obligatorio

Primero una tabla:

| Before | After | Why |
| --- | --- | --- |
| `transition: all 300ms` | `transition: transform 200ms ease-out` | `all` anima propiedades no previstas y puede salir de GPU |

Despues un verdict agrupado por impacto, omitiendo secciones vacias:

1. Feel-breaking regressions
2. Missed simplifications
3. Performance
4. Interruptibility & timing
5. Origin, physicality & cohesion
6. Accessibility

Cierra con decision explicita: `Block` o `Approve`.

Siempre cita `file:line` cuando exista un diff o archivos locales.
