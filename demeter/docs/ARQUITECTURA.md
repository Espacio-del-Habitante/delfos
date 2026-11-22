# Deméter — Arquitectura (Expo)

Fuente de verdad para auditar el código móvil. Deliberadamente simple: **features + services + domain**, alineado al espíritu de Delfos (sin Clean Architecture con UseCases/IoC).

```
App.tsx
  └── src/app/AppRoot.tsx          # shell + tabs
        ├── features/mercado/      # carrito, voz, edición, búsqueda de precios
        ├── features/history/      # mercados cerrados
        ├── features/stats/        # resumen, categorías, tendencias, share
        └── features/settings/     # presupuesto + IA
              │
              ▼
        services/                  # I/O: AsyncStorage, speech, HTTP, foto, AI
              │
              ▼
        domain/                    # pura: parse, categorías, units, stats
              │
        shared/                    # theme, format
```

## Capas

| Capa | Puede | No debe |
|------|-------|---------|
| `app/` | Navegación, tabs, wiring de pantallas | Lógica de negocio, persistencia |
| `features/*` | UI, orquestar calls a services/domain | Scraping, fetch crudo, fórmulas de dinero |
| `services/` | Persistencia, speech, price/web search, AI adapters | Render UI |
| `domain/` | Funciones puras (parse, stats, categories) | Importar React Native / AsyncStorage / fetch |
| `shared/` | Theme, formatters | Estado global |

## Persistencia

- Clave AsyncStorage: `demeter_mercado_v1`
- Modelo: `settings` + `trips[]` + `products{}` + `activeTripId`
- Todo local-first en el teléfono.

## Features vs PWA `mercado/`

| Capacidad | Estado Expo |
|-----------|-------------|
| Carrito + voz + hábitos | ✅ |
| Búsqueda de precios + cards | ✅ |
| Historial de cosechas | ✅ `features/history` |
| Estadísticas + share | ✅ `features/stats` |
| Checkout (total factura) | ✅ `CheckoutSheet` |
| Sync gasto → Delfos | ✅ `services/syncDelfos` + URL en Ajustes |
| OCR visión de factura | ⏸ opcional (como en PWA) |

## Checks auditables

```bash
cd demeter && npm run check
```

Cada módulo no trivial en `domain/` o `services/` deja un `*.check.mjs` que falla si se rompe la regla.
