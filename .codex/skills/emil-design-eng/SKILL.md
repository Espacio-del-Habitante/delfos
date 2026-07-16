---
name: emil-design-eng
description: Design engineering guidance for UI polish, component feel, interaction details, motion decisions, accessibility, and animation craft. Use when Codex builds or reviews frontend UI, visual components, transitions, microinteractions, or product polish in this repo.
---

# Design Engineering

Usa esta guia para construir interfaces que se sienten correctas, no solo funcionales. Para la version Cursor completa, consulta `.cursor/skills/emil-design-eng/SKILL.md`; este skill mantiene el resumen operativo para Codex.

## Principios

- Entrena gusto con referencias reales: estudia por que una interfaz se siente bien antes de copiar patrones.
- Los detalles invisibles componen la experiencia: defaults, estados, timing, origen de transforms, errores y accesibilidad.
- La belleza es leverage, pero no justifica complejidad innecesaria.

## Antes De Animar

Pregunta en orden:

1. Frecuencia: acciones 100+ veces/dia o de teclado no deben animarse; acciones de decenas/dia deben reducirse; modals/drawers/toasts pueden usar motion estandar; momentos raros pueden tener delight.
2. Proposito: spatial consistency, state indication, explanation, feedback o evitar un cambio brusco.
3. Easing: entrar/salir usa `ease-out` o curva fuerte; movimiento/morph usa `ease-in-out`; hover/color usa `ease`; constante usa `linear`.
4. Duracion: UI normal bajo 300ms. Button press 100-160ms; tooltips/popovers 125-200ms; dropdowns/selects 150-250ms; modals/drawers 200-500ms.

Curvas recomendadas:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

## Componentes

- Botones y elementos pressable: agrega feedback sutil `transform: scale(0.97)` en `:active` con transicion corta.
- Nunca animes entrada desde `scale(0)`. Usa `scale(0.9-0.97)` con `opacity: 0`.
- Popovers, dropdowns y tooltips escalan desde el trigger; modals mantienen centro.
- Tooltips: delay inicial, pero hovers siguientes instantaneos cuando ya hay tooltip abierto.
- Usa transitions para UI interruptible; evita keyframes en elementos que cambian rapido.
- Usa `@starting-style` cuando el soporte del proyecto lo permita.
- Para crossfades imperfectos, considera `filter: blur(2px)` temporal y ligero.

## Performance Y Accesibilidad

- Anima solo `transform` y `opacity` salvo justificacion fuerte.
- Evita animar `width`, `height`, `margin`, `padding`, `top`, `left`.
- En Framer Motion bajo carga, prefiere `transform: "translateX(...)"` a shorthands `x`, `y`, `scale`.
- Respeta `prefers-reduced-motion`: reduce movimiento, conserva opacity/color si ayudan a entender.
- Gatea hover motion con `@media (hover: hover) and (pointer: fine)`.

## Reviews De UI

Cuando revises UI, usa una tabla:

| Before | After | Why |
| --- | --- | --- |
| `transition: all 300ms` | `transition: transform 200ms ease-out` | Especifica propiedades; evita animaciones fuera de GPU |

Incluye `file:line` cuando sea posible.
