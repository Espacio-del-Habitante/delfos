# Animation Standards Reference

Valores y reglas precisas para reviews de motion. Derivado de la filosofia de Emil Kowalski / animations.dev y de `.cursor/skills/review-animations/STANDARDS.md`.

## Frecuencia

| Frequency | Decision |
| --- | --- |
| 100+ times/day, keyboard shortcuts, command palette toggle | No animation |
| Tens/day, hover effects, list navigation | Remove or drastically reduce |
| Occasional, modals, drawers, toasts | Standard animation |
| Rare/first-time, onboarding, feedback, celebrations | Can add delight |

Propositos validos: spatial consistency, state indication, explanation, feedback, preventing jarring change.

## Easing

- Entering/exiting: `ease-out`.
- Moving/morphing: `ease-in-out`.
- Hover/color: `ease`.
- Constant motion: `linear`.
- Nunca `ease-in` en UI.

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

## Duration

| Element | Duration |
| --- | --- |
| Button press feedback | 100-160ms |
| Tooltips, small popovers | 125-200ms |
| Dropdowns, selects | 150-250ms |
| Modals, drawers | 200-500ms |
| Marketing/explanatory | Can be longer |

Regla: UI animations bajo 300ms salvo justificacion.

## Physicality

- Nunca `scale(0)`. Usa `scale(0.9-0.97)` + `opacity: 0`.
- Popovers/dropdowns/tooltips deben usar origen del trigger, por ejemplo `var(--radix-popover-content-transform-origin)` o `var(--transform-origin)`.
- Modals son excepcion: pueden mantener `transform-origin: center`.
- Press feedback: `transform: scale(0.97)` con `transition: transform 160ms ease-out`.

## Springs

Usar springs para drag con momentum, gestos interruptibles, elementos decorativos vivos o interacciones que pueden revertirse a mitad de movimiento.

```js
{ type: "spring", duration: 0.5, bounce: 0.2 }
{ type: "spring", mass: 1, stiffness: 100, damping: 10 }
```

Mantener bounce sutil: `0.1-0.3`.

## Interruptibility

Transitions se retargetean; keyframes reinician. Para toasts, toggles, gestos y triggers rapidos, preferir transitions o springs.

Usar `@starting-style` para entry cuando aplique:

```css
.toast {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 400ms ease, transform 400ms ease;

  @starting-style {
    opacity: 0;
    transform: translateY(100%);
  }
}
```

## Performance

- Animar `transform` y `opacity`.
- Evitar `padding`, `margin`, `height`, `width`, `top`, `left`.
- Evitar manejar transforms de hijos con CSS variables en parent si causa recalculo masivo.
- En Framer Motion bajo carga, evitar shorthands `x`, `y`, `scale`; usar `transform` completo.
- CSS animations rinden mejor bajo carga para motion predeterminado; usar JS/springs para motion dinamico.
- WAAPI sirve para control programatico con performance de CSS.

## Gestures

- Momentum dismissal: calcular `Math.abs(distance) / elapsedMs`; dismiss si es `> ~0.11`.
- Aplicar damping en boundaries.
- Usar pointer capture al iniciar drag.
- Ignorar multi-touch adicional durante drag.
- Preferir friccion sobre hard stops.

## Accessibility

```css
@media (prefers-reduced-motion: reduce) {
  .element { animation: fade 0.2s ease; }
}

@media (hover: hover) and (pointer: fine) {
  .element:hover { transform: scale(1.05); }
}
```

Reduced motion significa menos movimiento y mas suave, no necesariamente cero transiciones.

## Stagger Y Cohesion

- Stagger de grupos: 30-80ms entre items.
- No bloquear interaccion mientras corre stagger.
- Motion debe coincidir con el producto: dashboard profesional = crisp y rapido; playful = puede tener mas bounce.
