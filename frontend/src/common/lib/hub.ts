/**
 * Hub LAN + cola offline para la PWA.
 *
 * Política (ver docs/02_mobile_lan_sync.md):
 * - El PC (hub) es la única fuente de verdad.
 * - El móvil solo encola mutaciones y las empuja en FIFO a demanda.
 * - Al primer fallo la cola se detiene (no reordena).
 * - 4xx no reintentable → conflicto (el usuario descarta o reintenta).
 * - Red / 5xx → error reintentable (el ítem sigue pending).
 */

const HUB_BASE_KEY = 'delfos.hubBaseUrl';
const QUEUE_KEY = 'delfos.offlineQueue';
const SYNC_META_KEY = 'delfos.syncMeta';

export type QueueItemStatus = 'pending' | 'conflict';

export type QueuedMutation = {
  id: string;
  method: string;
  path: string;
  body?: string | null;
  contentType?: string | null;
  createdAt: string;
  status: QueueItemStatus;
  /** Último error conocido (conflicto o fallo de red al intentar). */
  lastError?: string | null;
  /** HTTP status del hub si hubo respuesta. */
  httpStatus?: number | null;
  conflictAt?: string | null;
};

/** Estados de sincronización expuestos a la UI. */
export type SyncState =
  | 'idle' // sin cola, sin error reciente
  | 'pending' // hay ítems pending
  | 'syncing' // sync en curso
  | 'synced' // última sync vació la cola con éxito
  | 'partial' // empujó algunos; quedan pending (corte por red)
  | 'conflict' // hay al menos un ítem en conflicto
  | 'error'; // último intento falló por red/5xx y no hay conflictos

export type FailureKind = 'network' | 'conflict' | 'auth';

export type SyncMeta = {
  state: SyncState;
  lastSyncAt: string | null;
  lastError: string | null;
  lastOkCount: number;
};

export type SyncSnapshot = SyncMeta & {
  pending: number;
  conflicts: number;
  items: QueuedMutation[];
};

export type SyncResult = {
  state: SyncState;
  ok: number;
  failed: number;
  remaining: number;
  conflicts: number;
  lastError?: string;
  failureKind?: FailureKind;
};

function blankMeta(): SyncMeta {
  return { state: 'idle', lastSyncAt: null, lastError: null, lastOkCount: 0 };
}

function canUseStorage(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const k = '__delfos_probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    // iOS modo privado / storage bloqueado: no tumbar la PWA.
    return false;
  }
}

export function getHubBaseUrl(): string {
  if (!canUseStorage()) return '';
  return (localStorage.getItem(HUB_BASE_KEY) || '').trim().replace(/\/$/, '');
}

export function setHubBaseUrl(url: string): void {
  if (!canUseStorage()) return;
  const cleaned = url.trim().replace(/\/$/, '');
  try {
    if (!cleaned) localStorage.removeItem(HUB_BASE_KEY);
    else localStorage.setItem(HUB_BASE_KEY, cleaned);
  } catch {
    /* private mode */
  }
}

/** Base efectiva: override del hub, o PUBLIC_API_BASE_URL, o mismo origen. */
export function resolveApiBase(): string {
  const hub = getHubBaseUrl();
  if (hub) return hub;
  return import.meta.env.PUBLIC_API_BASE_URL ?? '';
}

function normalizeItem(raw: Partial<QueuedMutation> & { id: string; method: string; path: string }): QueuedMutation {
  return {
    id: raw.id,
    method: String(raw.method || 'POST').toUpperCase(),
    path: raw.path,
    body: raw.body ?? null,
    contentType: raw.contentType ?? null,
    createdAt: raw.createdAt || new Date().toISOString(),
    status: raw.status === 'conflict' ? 'conflict' : 'pending',
    lastError: raw.lastError ?? null,
    httpStatus: raw.httpStatus ?? null,
    conflictAt: raw.conflictAt ?? null,
  };
}

export function loadQueue(): QueuedMutation[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeItem(item));
  } catch {
    return [];
  }
}

function saveQueue(items: QueuedMutation[]): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    /* quota / private mode */
  }
}

export function loadSyncMeta(): SyncMeta {
  if (!canUseStorage()) return blankMeta();
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    if (!raw) return blankMeta();
    const parsed = JSON.parse(raw) as Partial<SyncMeta>;
    return {
      state: (parsed.state as SyncState) || 'idle',
      lastSyncAt: parsed.lastSyncAt ?? null,
      lastError: parsed.lastError ?? null,
      lastOkCount: Number(parsed.lastOkCount || 0),
    };
  } catch {
    return blankMeta();
  }
}

function saveSyncMeta(meta: SyncMeta): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    /* quota / private mode */
  }
}

export function queueCount(): number {
  return loadQueue().filter((i) => i.status === 'pending').length;
}

export function conflictCount(): number {
  return loadQueue().filter((i) => i.status === 'conflict').length;
}

/**
 * Clasifica un fallo HTTP/red.
 * - conflict: 4xx no reintentable (hub rechazó; suele ser recurso borrado/ inválido)
 * - auth: 401/403 (hub exige algo que el móvil no tiene)
 * - network: sin status, 408/429, 5xx
 */
export function classifySyncFailure(httpStatus?: number | null): FailureKind {
  if (httpStatus == null) return 'network';
  if (httpStatus === 401 || httpStatus === 403) return 'auth';
  if (httpStatus === 408 || httpStatus === 429) return 'network';
  if (httpStatus >= 500) return 'network';
  if (httpStatus >= 400) return 'conflict';
  return 'network';
}

function deriveState(items: QueuedMutation[], meta: SyncMeta, syncing = false): SyncState {
  if (syncing) return 'syncing';
  const hasConflict = items.some((i) => i.status === 'conflict');
  const hasPending = items.some((i) => i.status === 'pending');
  if (hasConflict) return 'conflict';
  if (hasPending) {
    if (meta.lastError && meta.lastOkCount > 0) return 'partial';
    if (meta.lastError) return 'error';
    return 'pending';
  }
  if (meta.lastSyncAt && !meta.lastError) return 'synced';
  if (meta.lastError) return 'error';
  return 'idle';
}

export function getSyncSnapshot(): SyncSnapshot {
  const items = loadQueue();
  const meta = loadSyncMeta();
  const state = deriveState(items, meta);
  return {
    ...meta,
    state,
    pending: items.filter((i) => i.status === 'pending').length,
    conflicts: items.filter((i) => i.status === 'conflict').length,
    items,
  };
}

export const SYNC_STATE_LABELS: Record<SyncState, string> = {
  idle: 'Sin pendientes',
  pending: 'Pendiente de sync',
  syncing: 'Sincronizando…',
  synced: 'Sincronizado',
  partial: 'Sync parcial',
  conflict: 'Conflicto — acción requerida',
  error: 'Error de red — reintentar',
};

export function enqueueMutation(init: {
  method: string;
  path: string;
  body?: string | null;
  contentType?: string | null;
}): QueuedMutation {
  const item = normalizeItem({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    method: init.method,
    path: init.path,
    body: init.body ?? null,
    contentType: init.contentType ?? null,
    createdAt: new Date().toISOString(),
    status: 'pending',
  });
  const q = loadQueue();
  q.push(item);
  saveQueue(q);
  const meta = loadSyncMeta();
  saveSyncMeta({ ...meta, state: 'pending', lastError: null });
  return item;
}

function markConflict(item: QueuedMutation, message: string, httpStatus?: number | null): QueuedMutation {
  return {
    ...item,
    status: 'conflict',
    lastError: message,
    httpStatus: httpStatus ?? null,
    conflictAt: new Date().toISOString(),
  };
}

/** Reenvía solo ítems pending (FIFO). Los conflict quedan hasta que el usuario actúe. */
export async function syncQueue(): Promise<SyncResult> {
  const base = resolveApiBase();
  const queue = loadQueue();
  let ok = 0;
  let failed = 0;
  let lastError: string | undefined;
  let failureKind: FailureKind | undefined;
  const next: QueuedMutation[] = [];
  let stopped = false;

  for (const item of queue) {
    if (item.status === 'conflict') {
      next.push(item);
      continue;
    }
    if (stopped) {
      next.push(item);
      continue;
    }

    try {
      const headers: Record<string, string> = {};
      if (item.contentType) headers['Content-Type'] = item.contentType;
      const res = await fetch(`${base}${item.path}`, {
        method: item.method,
        headers,
        body: item.body,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = (data as { error?: string }).error || res.statusText || `HTTP ${res.status}`;
        const kind = classifySyncFailure(res.status);
        failed += 1;
        lastError = message;
        failureKind = kind;
        if (kind === 'conflict' || kind === 'auth') {
          next.push(markConflict(item, message, res.status));
          // Conflicto: no reenvía los siguientes hasta resolver (evita desorden / efectos en cadena).
          stopped = true;
        } else {
          next.push({ ...item, status: 'pending', lastError: message, httpStatus: res.status });
          stopped = true;
        }
        continue;
      }
      ok += 1;
    } catch (err) {
      failed += 1;
      lastError = err instanceof Error ? err.message : 'Error de sync';
      failureKind = 'network';
      next.push({ ...item, status: 'pending', lastError, httpStatus: null });
      stopped = true;
    }
  }

  saveQueue(next);
  const conflicts = next.filter((i) => i.status === 'conflict').length;
  const pending = next.filter((i) => i.status === 'pending').length;
  let state: SyncState = 'synced';
  if (conflicts) state = 'conflict';
  else if (pending && ok > 0) state = 'partial';
  else if (pending) state = 'error';
  else if (ok === 0 && !lastError) state = pending ? 'pending' : 'idle';

  saveSyncMeta({
    state,
    lastSyncAt: new Date().toISOString(),
    lastError: lastError ?? null,
    lastOkCount: ok,
  });

  return {
    state,
    ok,
    failed,
    remaining: pending,
    conflicts,
    lastError,
    failureKind,
  };
}

/** Descarta un ítem en conflicto (o pending). Hub gana; no se reenvía. */
export function discardQueuedMutation(id: string): SyncSnapshot {
  const next = loadQueue().filter((i) => i.id !== id);
  saveQueue(next);
  const meta = { ...loadSyncMeta(), lastError: null };
  const state = deriveState(next, meta);
  saveSyncMeta({ ...meta, state });
  return getSyncSnapshot();
}

/** Vuelve un conflicto a pending para reintentar en el próximo sync. */
export function retryConflict(id: string): SyncSnapshot {
  const next = loadQueue().map((item) =>
    item.id === id
      ? { ...item, status: 'pending' as const, lastError: null, httpStatus: null, conflictAt: null }
      : item,
  );
  saveQueue(next);
  const meta = { ...loadSyncMeta(), lastError: null };
  saveSyncMeta({ ...meta, state: deriveState(next, meta) });
  return getSyncSnapshot();
}

/** Descarta todos los conflictos (no toca pending). */
export function discardAllConflicts(): SyncSnapshot {
  const next = loadQueue().filter((i) => i.status !== 'conflict');
  saveQueue(next);
  const meta = { ...loadSyncMeta(), lastError: null };
  saveSyncMeta({ ...meta, state: deriveState(next, meta) });
  return getSyncSnapshot();
}

export type HubInfo = {
  protocol_version: number;
  service: string;
  lan_enabled: boolean;
  lan_active: boolean;
  needs_restart: boolean;
  host: string;
  port: number;
  addresses: string[];
  urls: string[];
  hint: string;
  sync_policy?: string;
};

export async function fetchHubInfo(baseUrl?: string): Promise<HubInfo> {
  const base = (baseUrl ?? resolveApiBase()).replace(/\/$/, '');
  const res = await fetch(`${base}/api/hub`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || res.statusText);
  }
  return data as HubInfo;
}

export async function saveHubLanEnabled(lanEnabled: boolean): Promise<HubInfo> {
  const base = resolveApiBase();
  const res = await fetch(`${base}/api/settings/hub`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lan_enabled: lanEnabled }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || res.statusText);
  }
  return data as HubInfo;
}

/** ponytail: check puro de clasificación de fallos (sin DOM). */
export function _selfCheckClassify(): void {
  const cases: Array<[number | null, FailureKind]> = [
    [null, 'network'],
    [500, 'network'],
    [408, 'network'],
    [429, 'network'],
    [401, 'auth'],
    [403, 'auth'],
    [404, 'conflict'],
    [400, 'conflict'],
    [409, 'conflict'],
  ];
  for (const [status, expected] of cases) {
    const got = classifySyncFailure(status);
    if (got !== expected) {
      throw new Error(`classifySyncFailure(${status})=${got}, expected ${expected}`);
    }
  }
}
