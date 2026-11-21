# Delfos Mercado (aparte)

Mini-app **separada** de Delfos: mismo lenguaje visual (CSS / toast vendored desde `frontend/`),
stack Astro + Svelte, PWA para iPhone. **No modifica** el frontend principal.

## Dev

```bash
cd mercado
npm install
npm run check
npm run dev
```

http://127.0.0.1:5173

`npm run vendor:delfos` copia `global.css` + toast desde `../frontend` a `src/vendor/delfos/`
(antes de dev/build).

## Qué hace v0.2

- Mercado con presupuesto (hero-card Delfos)
- Dictado / texto → parser local (0 tokens LLM)
- Historial, stats, share card
- Sync opcional a Delfos API

## iPhone

Safari → Compartir → Añadir a pantalla de inicio.
