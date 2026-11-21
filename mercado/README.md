# Delfos Mercado

Mini-app **local-first** para mercar con voz, presupuesto y sync opcional a Delfos.

## Por qué PWA (no nativa iOS aún)

Sin Mac no se firma un `.ipa`. Esta PWA se instala en iPhone (Safari → Añadir a pantalla de inicio),
funciona offline y se puede distribuir aparte. Más adelante se puede envolver con Capacitor.

## Dev

```bash
cd mercado
npm install
npm run check
npm run dev
```

App: http://127.0.0.1:5173

## Ideas de producto cubiertas en v0.1

- Sesión de mercado con presupuesto y total en vivo
- Dictado / texto → parser local (`3 libras de papa 30 mil`)
- Categorización por keywords (cero tokens)
- Editar/quitar con confirmación (“mejor 2 libras de papa”)
- Foto de factura + contraste por total manual
- Historial local + stats + share card
- Sync a `POST /api/expenses` de Delfos (URL en Ajustes)

## Sync

1. Corre Delfos API con CORS permisivo (`FLASK_DEBUG=true` o `DELFOS_CORS_ORIGINS`).
2. En Ajustes pega la URL base (tunnel o LAN).
3. Al pagar → **Sincronizar con Delfos**.
