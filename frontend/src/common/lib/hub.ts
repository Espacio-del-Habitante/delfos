/**
 * Hub LAN + cola offline para la PWA.
 * El PC (Flask) es la fuente de verdad; aquí solo se encolan mutaciones
 * cuando no hay red y se reenvían al pulsar Sincronizar.
 */

const HUB_BASE_KEY = 'delfos.hubBaseUrl';
const QUEUE_KEY = 'delfos.offlineQueue';

export type QueuedMutation = {
  id: string;
  method: string;
  path: string;
  body?: string | null;
  contentType?: string | null;
  createdAt: string;
};

export function getHubBaseUrl(): string {
  if (typeof localStorage === 'undefined') return '';
  return (localStorage.getItem(HUB_BASE_KEY) || '').trim().replace(/\/$/, '');
}

export function setHubBaseUrl(url: string): void {
  const cleaned = url.trim().replace(/\/$/, '');
  if (!cleaned) localStorage.removeItem(HUB_BASE_KEY);
  else localStorage.setItem(HUB_BASE_KEY, cleaned);
}

/** Base efectiva: override del hub, o PUBLIC_API_BASE_URL, o mismo origen. */
export function resolveApiBase(): string {
  const hub = getHubBaseUrl();
  if (hub) return hub;
  return import.meta.env.PUBLIC_API_BASE_URL ?? '';
}

export function loadQueue(): QueuedMutation[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(items: QueuedMutation[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export function queueCount(): number {
  return loadQueue().length;
}

export function enqueueMutation(init: {
  method: string;
  path: string;
  body?: string | null;
  contentType?: string | null;
}): QueuedMutation {
  const item: QueuedMutation = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    method: init.method.toUpperCase(),
    path: init.path,
    body: init.body ?? null,
    contentType: init.contentType ?? null,
    createdAt: new Date().toISOString(),
  };
  const q = loadQueue();
  q.push(item);
  saveQueue(q);
  return item;
}

export type SyncResult = {
  ok: number;
  failed: number;
  remaining: number;
  lastError?: string;
};

/** Reenvía la cola al hub. Para al primer fallo para no desordenar. */
export async function syncQueue(): Promise<SyncResult> {
  const base = resolveApiBase();
  const queue = loadQueue();
  let ok = 0;
  let failed = 0;
  let lastError: string | undefined;
  const remaining: QueuedMutation[] = [];

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
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
        throw new Error((data as { error?: string }).error || res.statusText);
      }
      ok += 1;
    } catch (err) {
      failed += 1;
      lastError = err instanceof Error ? err.message : 'Error de sync';
      remaining.push(...queue.slice(i));
      break;
    }
  }

  saveQueue(remaining);
  return { ok, failed, remaining: remaining.length, lastError };
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
