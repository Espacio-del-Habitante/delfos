# Delfos — Desktop Electron (hub) + PWA móvil (mismo monorepo)

> Rama experimental `cursor/mobile-pwa-lan-sync-*`.
> Extiende `01_arquitectura.md` sin reinventar capas: el hub sigue siendo Flask + JSON.
> Fuente de verdad de datos: JSON del PC (proceso arrancado por Electron o `.exe`).

---

## Modelo del monorepo

```
delfos/
├── backend/     # Flask API + JSON (hub / fuente de verdad)
├── frontend/    # Astro + Svelte  →  UI compartida (ventana Electron + PWA)
├── desktop/     # Electron: empaqueta FE+BE y es el hub en el PC
└── docs/
```

| Superficie | Rol | Dónde |
|------------|-----|--------|
| **Electron (`desktop/`)** | App de escritorio: arranca backend embebido + ventana nativa. **Hub central.** | PC |
| **PWA (`frontend/` + manifest/SW)** | Misma UI instalable en el celular; captura offline y sync LAN | Móvil |
| **Flask** | API + sirve `frontend/dist`; JSON local = verdad | Proceso hijo del hub |

Electron **no** sustituye al backend: lo empaqueta y lo expone. La PWA **no** es otro producto: es el mismo frontend apuntando al hub del PC.

```
┌──────────────────────────────────┐         Wi‑Fi LAN         ┌──────────────────────┐
│  PC — Electron (hub)             │◄──── sync a demanda ─────│  Móvil — PWA         │
│  ├─ ventana: UI (frontend/dist)  │                          │  cola offline        │
│  └─ hijo: Flask 0.0.0.0:5000     │──── /api + UI ──────────►│  mismo frontend      │
│       JSON en userData/data      │                          │                      │
└──────────────────────────────────┘                          └──────────────────────┘
```

---

## Por qué PWA (y no Expo) junto a Electron

| Opción | Coste | Encaje |
|--------|-------|--------|
| **PWA** del frontend actual | Bajo: un solo UI con Electron | Captura móvil + install en home screen |
| Expo / RN | Alto: segunda UI | No hace falta mientras el hub sea LAN al PC |
| Capacitor | Medio | Fase 2 si hace falta APIs nativas |

---

## Flujo

1. En el PC abres **Delfos Desktop** (`npm --prefix desktop run dev` o el build).
2. En Configuración activas **Compartir en red local** y reinicias el hub (Electron relee el flag al arrancar).
3. Electron con LAN: Flask en `0.0.0.0:5000` (puerto estable `DELFOS_HUB_PORT`).
4. El celular abre `http://<IP-LAN>:5000`, instala la PWA (mismo `frontend`).
5. Offline: mutaciones → cola en el móvil. Online + **Sincronizar** → se empujan al `/api/*` del hub.

Sin nube. Sin sync automático en background en esta fase.

---

## Estados de sincronización

El cliente (`frontend/src/common/lib/hub.ts`) expone un estado explícito. La UI de
Configuración lo muestra y bloquea “seguir a ciegas” cuando hay conflicto.

| Estado | Significado | Qué hacer |
|--------|-------------|-----------|
| `idle` | Cola vacía, sin error reciente | Nada |
| `pending` | Hay mutaciones en cola aún no enviadas | Pulsar **Sincronizar** en la misma Wi‑Fi |
| `syncing` | Sync en curso | Esperar |
| `synced` | Última sync vació la cola con éxito | Listo; el hub tiene la verdad |
| `partial` | Se empujaron N ítems y luego cortó (red/5xx) | Reintentar **Sincronizar**; no se reordenó la cola |
| `error` | Fallo reintentable y aún hay pending | Revisar Wi‑Fi / hub encendido → **Sincronizar** |
| `conflict` | El hub rechazó un ítem (4xx no reintentable) | Ver conflicto → **Reintentar** o **Descartar** |

Reglas de máquina:

1. Cola **FIFO**. Al primer fallo se **detiene** (los siguientes no se envían).
2. Ítems en `conflict` no se reenvían solos: exigen acción del usuario.
3. Tras un sync exitoso (cola limpia), el cliente debe **refrescar** `GET /api/finance`
   (la UI del hub gana visualmente también).

### Clasificación de fallos

| Respuesta | Tipo | Efecto en la cola |
|-----------|------|-------------------|
| Sin HTTP / timeout / 5xx / 408 / 429 | `network` (reintentable) | Ítem sigue `pending`; estado `error` o `partial` |
| 401 / 403 | `auth` | Ítem → `conflict` (revisar acceso al hub) |
| 400 / 404 / 409 / resto de 4xx | `conflict` | Ítem → `conflict`; sync se detiene |

---

## Conflictos: política y resolución

**Política actual: `hub_wins_queue_fifo`** (también en `GET /api/hub` → `sync_policy`).

- El JSON del PC es la **única fuente de verdad**.
- El móvil **no** hace merge campo a campo ni mantiene un segundo ledger autoritativo.
- Un “conflicto” = el hub **rechazó** una mutación encolada (p. ej. editar/borrar un gasto
  que ya no existe en el PC, o validación 400).

### Casos típicos

| Situación | Qué pasa | Resolución |
|-----------|----------|------------|
| Móvil crea gasto offline; sync OK | POST al hub | Queda en el JSON del PC |
| Móvil edita X; en el PC ya borraron X | PATCH → 404 → `conflict` | **Descartar** el ítem (hub gana) o recrear el movimiento a mano en el móvil y sync |
| Móvil borra X; en el PC ya no está | DELETE → 404 → `conflict` | **Descartar** (idempotente en la práctica) |
| Mitad de la cola OK, luego Wi‑Fi cae | `partial` | **Sincronizar** de nuevo; no duplica los ya OK (salen de la cola al confirmarse) |
| Dos dispositivos móviles | Cada uno tiene su cola | Ambos empujan al mismo hub; no hay merge entre colas. Orden = orden de sync humano |

### Acciones de resolución (UI)

| Acción | Efecto |
|--------|--------|
| **Sincronizar** | Envía solo `pending` en orden |
| **Reintentar** (por ítem) | Pasa un `conflict` otra vez a `pending` |
| **Descartar** (por ítem) | Elimina el ítem de la cola; **no** escribe en el hub |
| **Descartar conflictos** | Elimina todos los `conflict`; deja `pending` |

> No hay “quedarse con la versión del móvil” automática en esta fase: eso sería merge
> bidireccional (fuera de alcance). Si el dato del móvil importa, el usuario lo vuelve a
> registrar y sincroniza.

### Qué no es un conflicto

- Estar offline → solo `pending`.
- Hub apagado → `error` / `partial`, reintentable.
- UI del móvil desactualizada tras sync → se corrige con refresh del `FinancePayload` del hub.

---

## Piezas

| Pieza | Dónde |
|-------|--------|
| Shell Electron + spawn Flask | `desktop/main.js` |
| Empaquetado FE+BE | `desktop/package.json` (`dist:*`) + `scripts/build-backend.mjs` |
| Info hub + IPs | `GET /api/hub` · `backend/services/hub_service.py` |
| Flag LAN persistido | `GET/POST /api/settings/hub` · `hub_settings.json` en `DELFOS_DATA_DIR` |
| Bind / CORS LAN | `config.LAN_SYNC` · `backend/app.py` |
| Cola + estados + conflictos | `frontend/src/common/lib/hub.ts` + `api.ts` |
| UI sync / resolución | sección en Configuración |
| PWA | `frontend/public/manifest.webmanifest` + `sw.js` |
| Política anunciada por API | `sync_policy: hub_wins_queue_fifo` en `/api/hub` |

---

## Cómo probar

```bash
# 1) Frontend build (Electron y PWA comparten dist)
npm --prefix frontend install && npm --prefix frontend run build

# 2) Desktop hub
npm --prefix desktop install
# Opcional: forzar LAN desde el primer arranque
DELFOS_LAN_SYNC=1 npm --prefix desktop run dev

# 3) En Configuración (ventana Electron): activar “Compartir en red local”,
#    reiniciar desktop si hace falta, copiar la URL LAN.

# 4) Celular (misma Wi‑Fi): abrir http://<IP>:5000 → Instalar PWA → Sincronizar
```

Variables útiles:

- `DELFOS_LAN_SYNC=1` — hub escuchando en LAN
- `DELFOS_HUB_PORT=5000` — puerto estable para la PWA
- `DELFOS_OPEN_BROWSER=false` — lo pone Electron (no abre Chrome encima de la ventana)
- `DELFOS_RENDERER_URL` — p.ej. Astro dev `http://localhost:4321`

---

## Fuera de alcance (fase 2)

- Discovery mDNS / QR automático
- Merge bidireccional / CRDT / vector clocks
- “Quedarse con versión móvil” automática
- Expo / Capacitor
- Sync por internet / túnel
- Sync automático en background
