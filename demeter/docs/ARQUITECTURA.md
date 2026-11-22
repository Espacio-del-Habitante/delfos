# MercApp — Arquitectura (Expo)

Fuente de verdad para auditar el código móvil. Deliberadamente simple: **features + services + domain**, alineado al espíritu de Delfos (sin Clean Architecture con UseCases/IoC).

Revisado con el árbol real de `demeter/src/` (nov 2026).

```
App.tsx
  └── src/app/AppRoot.tsx              # shell + BottomNav (píldora)
        ├── features/mercado/
        │     screens/MercadoScreen    # carrito, hábitos, FAB + composer
        │     components/
        │       CheckoutSheet          # cierra + foto factura (sin sync)
        │       ItemEditSheet          # qty/precio/foto + búsqueda
        │       InAppBrowser           # cards de precios
        │       VerticalWheel
        ├── features/history/          # lista + detalle “Qué compramos” + sync lote
        ├── features/stats/            # resumen, ideal mensual, categorías, sparks
        └── features/settings/         # presupuesto, URL Delfos, sync lote, IA
              │
              ▼
        services/   store, speech, priceSearch, webSearch, ai*, pickPhoto, syncDelfos
        domain/     parseUtterance, categories, units, stats (+ idealMonthlyMarket)
        shared/     theme, format, BottomNav (safe-area + dock helpers)
```

## Capas

| Capa | Puede | No debe |
|------|-------|---------|
| `app/` | Tabs, wiring de pantallas | Lógica de negocio, persistencia |
| `features/*` | UI, orquestar services/domain | Fetch crudo, fórmulas de dinero |
| `services/` | AsyncStorage, speech, HTTP, foto, AI, sync | Render UI |
| `domain/` | Funciones puras (parse, stats, ideal mensual) | React Native / AsyncStorage / fetch |
| `shared/` | Theme, format, BottomNav | Estado global |

## Navegación y safe-area

- Bottom nav: píldora flotante icon-only (como Delfos), `navDockBottom(insets.bottom)`.
- FABs / composer: `floatingDockBottom` = tope de píldora + gap.
- Listas: `contentBottomPad` para no quedar bajo el dock.

## Persistencia

- Clave AsyncStorage: `demeter_mercado_v1`
- Modelo: `settings` + `trips[]` + `products{}` + `activeTripId`
- Local-first en el teléfono.

## Sync a Delfos

- **No** ocurre al cerrar el mercado (Checkout solo guarda).
- Pendientes = `status === 'closed' && !sync?.ok` (incluye meses sin sync y reintentos).
- `syncAllPendingToDelfos` en Historial y Ajustes: un gasto por mercado, en lote.
- Copy de botón: “Enviar a Delfos” (no “Sync pendientes…”).

## Historial y Stats (solo cerrados)

- Historial = `listClosedTrips()` → `status === 'closed'`. Un mercado abierto no aparece ahí.
- Estadísticas (barras, donut, trend, share) también sobre viajes cerrados. Productos/hábitos siguen siendo locales.

## Categorías propias

- `settings.customCategories` + helpers `addCustomCategory` / `removeCustomCategory`.
- Se mezclan con el catálogo builtin (`mergeCategories`) en Mercado, Stats e ItemEdit.

## Precio unitario

- En ItemEdit: muestra COP/unidad; al cambiar qty recalcula el total con el rate actual.
- Comparación web: `inferPackFromText` + `unitPriceAs` para ver Éxito 5 kg vs tu libra en la misma unidad.

## Stats — mercado ideal mensual

- `domain/stats.idealMonthlyMarket(products)`
- Por producto: compras / meses distintos × cantidad moda × último unitario.
- UI en Stats: “Tu ritmo · Mercado ideal mensual” (estimación, no presupuesto fijo).

## Stats en vivo (antes de cerrar)

- En Mercado, bloque “En este mercado” bajo el hero del carrito abierto.
- Reusa `categoryBars([trip])` + `shareBlurb(categoryBreakdown(trip))` del domain de Stats.
- Blurb dinámico: top 2 categorías reales del carrito (no fijo proteína/harinas).

## Stats — gadgets de gráficos

- Librería: `react-native-gifted-charts` (+ `react-native-svg`).
- Catálogo en `domain/stats.STATS_WIDGETS` (con emoji); selección en `settings.statsWidgets`.
- UI: botón “Gadgets” en Estadísticas → `WidgetPicker`; charts en `features/stats/components/ChartGadgets`.
- Widgets chart: donut categorías, barras, gasto mensual (línea/área).

## Onboarding / walkthrough

- Librería: `@wrack/react-native-tour-guide` (spotlight + tooltips, Expo/web).
- Steps en `features/onboarding/mercappTour.ts`; bootstrap en `TourBootstrap`.
- Targets: `tour-brand`, `tour-start`, `tour-nav-*`, `tour-gadgets`.
- Persistencia “una vez” vía AsyncStorage; replay desde Ajustes.

## Features vs PWA `mercado/`

| Capacidad | Estado Expo |
|-----------|-------------|
| Carrito + voz + hábitos | ✅ |
| Stats en vivo del carrito (categoría) | ✅ en Mercado antes de cerrar |
| FAB escritura + mic | ✅ |
| Búsqueda de precios + cards | ✅ |
| Historial + detalle compras | ✅ |
| Estadísticas + share + ideal mensual | ✅ |
| Gadgets charts elegibles (gifted-charts) | ✅ |
| Checkout (foto + total factura) | ✅ |
| Sync lote → Delfos | ✅ |
| OCR visión de factura | ⏸ opcional |

## Checks auditables

```bash
cd demeter && npm run check
```

Cubre: `parseUtterance`, `historySuggest`, `stats` (incl. ideal mensual), `tripTotal`, `priceSearch`, `webSearch`, `syncDelfos` + `tsc --noEmit`.
