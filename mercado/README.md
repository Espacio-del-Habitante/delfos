# Deméter

Mini-app **aparte** de Delfos para mercar con voz. Nombre por la diosa griega de la cosecha.
Paleta verde; stack Astro + Svelte; PWA para iPhone.

No modifica el frontend de Delfos. El look base se vendor desde `frontend` y se recolorea aquí.

## Dev

```bash
cd mercado
npm install
npm run check
npm run dev
```

http://127.0.0.1:5173

## Sync con Delfos

En Ajustes pega la URL del API. Requiere CORS (`FLASK_DEBUG` o `DELFOS_CORS_ORIGINS`).
