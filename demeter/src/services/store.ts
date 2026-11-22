import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid, todayIso } from '../shared/format';
import { DEFAULT_AI, type AiSettings } from './aiSettings';
import { DEFAULT_STATS_WIDGETS, normalizeStatsWidgets } from '../domain/stats';
import { slugCategory, type CategoryDef } from '../domain/categories';
import {
  DEFAULT_SHOP_PROFILE,
  normalizeShopProfile,
  type ShopProfileId,
} from '../domain/shopProfiles';

const KEY = 'demeter_mercado_v1';

export type CartItem = {
  id: string;
  name: string;
  qty: number;
  unit: string;
  amount: number | null;
  category: string;
  photoDataUrl?: string | null;
  createdAt: string;
};

export type Trip = {
  id: string;
  createdAt: string;
  closedAt: string | null;
  storeName: string;
  budget: number;
  status: 'open' | 'checkout' | 'closed';
  items: CartItem[];
  receipt: { photoDataUrl?: string | null; ticketTotal?: number | null; notes?: string } | null;
  sync: { at: string; ok: boolean; error?: string } | null;
};

type Product = {
  name: string;
  category: string;
  photos: string[];
  priceHistory: Array<{ date: string; unitPrice: number; qty: number; unit: string; amount: number | null; tripId: string | null }>;
};

export type AppSettings = {
  budgetDefault: number;
  currency: string;
  ai: AiSettings;
  /** Base URL de Delfos para sync de gasto (ej. https://host:5000) */
  delfosApiBase?: string;
  delfosAccountId?: string | null;
  /** Gadgets visibles en Estadísticas (ids de domain/stats). */
  statsWidgets?: string[];
  /** Categorías propias (como en Delfos), se mezclan con el catálogo builtin. */
  customCategories?: CategoryDef[];
  /** Perfil de compra: guía recomendaciones y recetas. */
  shopProfile?: ShopProfileId;
};

type State = {
  settings: AppSettings;
  activeTripId: string | null;
  trips: Trip[];
  products: Record<string, Product>;
};

const DEFAULT: State = {
  settings: {
    budgetDefault: 200000,
    currency: 'COP',
    ai: { ...DEFAULT_AI },
    delfosApiBase: '',
    delfosAccountId: null,
    statsWidgets: [...DEFAULT_STATS_WIDGETS],
    customCategories: [],
    shopProfile: DEFAULT_SHOP_PROFILE,
  },
  activeTripId: null,
  trips: [],
  products: {},
};

let cache: State = structuredClone(DEFAULT);
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function nameKey(name: string) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

async function persist() {
  await AsyncStorage.setItem(KEY, JSON.stringify(cache));
  emit();
}

export async function initStore() {
  if (hydrated) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      cache = {
        ...structuredClone(DEFAULT),
        ...data,
        settings: {
          ...DEFAULT.settings,
          ...(data.settings || {}),
          ai: { ...DEFAULT_AI, ...((data.settings && data.settings.ai) || {}) },
          statsWidgets: normalizeStatsWidgets(
            (data.settings && data.settings.statsWidgets) || DEFAULT_STATS_WIDGETS,
          ),
          customCategories: normalizeCustomCategories(
            (data.settings && data.settings.customCategories) || [],
          ),
          shopProfile: normalizeShopProfile(
            (data.settings && data.settings.shopProfile) || DEFAULT_SHOP_PROFILE,
          ),
        },
        products: data.products || {},
        trips: Array.isArray(data.trips) ? data.trips : [],
      };
    }
  } catch {
    cache = structuredClone(DEFAULT);
  }
  hydrated = true;
  emit();
  return cache;
}

export function getState() {
  return cache;
}

export function getAiSettings(): AiSettings {
  return { ...DEFAULT_AI, ...(cache.settings.ai || {}) };
}

export async function updateSettings(patch: Partial<AppSettings>) {
  cache.settings = {
    ...cache.settings,
    ...patch,
    ai: patch.ai ? { ...cache.settings.ai, ...patch.ai } : cache.settings.ai,
    statsWidgets: patch.statsWidgets
      ? normalizeStatsWidgets(patch.statsWidgets)
      : cache.settings.statsWidgets,
    customCategories: patch.customCategories
      ? normalizeCustomCategories(patch.customCategories)
      : cache.settings.customCategories,
    shopProfile:
      patch.shopProfile != null
        ? normalizeShopProfile(patch.shopProfile)
        : cache.settings.shopProfile,
  };
  await persist();
  return cache.settings;
}

export function getShopProfile(): ShopProfileId {
  return normalizeShopProfile(cache.settings.shopProfile);
}

export async function setShopProfile(id: ShopProfileId | string) {
  cache.settings.shopProfile = normalizeShopProfile(id);
  await persist();
  return cache.settings.shopProfile;
}

export type BackupPayload = {
  version: 1;
  app: 'mercapp';
  exportedAt: string;
  state: {
    settings: AppSettings;
    trips: Trip[];
    products: Record<string, Product>;
    activeTripId: string | null;
  };
};

export function exportBackupObject(): BackupPayload {
  return {
    version: 1,
    app: 'mercapp',
    exportedAt: new Date().toISOString(),
    state: {
      settings: structuredClone(cache.settings),
      trips: structuredClone(cache.trips),
      products: structuredClone(cache.products),
      activeTripId: cache.activeTripId,
    },
  };
}

export async function restoreFromBackupObject(raw: unknown) {
  if (!raw || typeof raw !== 'object') throw new Error('Backup vacío');
  const payload = raw as Partial<BackupPayload> & { state?: Partial<State> };
  const state = payload.state;
  if (!state || typeof state !== 'object') throw new Error('Backup sin state');
  if (payload.app && payload.app !== 'mercapp') {
    throw new Error('Este archivo no es un backup de MercApp');
  }

  const settingsIn = (state.settings || {}) as Partial<AppSettings>;
  cache = {
    settings: {
      ...structuredClone(DEFAULT.settings),
      ...settingsIn,
      ai: { ...DEFAULT_AI, ...(settingsIn.ai || {}) },
      statsWidgets: normalizeStatsWidgets(
        settingsIn.statsWidgets || DEFAULT_STATS_WIDGETS,
      ),
      customCategories: normalizeCustomCategories(settingsIn.customCategories || []),
      shopProfile: normalizeShopProfile(settingsIn.shopProfile || DEFAULT_SHOP_PROFILE),
    },
    trips: Array.isArray(state.trips) ? structuredClone(state.trips) : [],
    products:
      state.products && typeof state.products === 'object'
        ? structuredClone(state.products)
        : {},
    activeTripId:
      typeof state.activeTripId === 'string' || state.activeTripId === null
        ? state.activeTripId
        : null,
  };
  hydrated = true;
  await persist();
  return cache;
}

function normalizeCustomCategories(raw: unknown): CategoryDef[] {
  if (!Array.isArray(raw)) return [];
  const out: CategoryDef[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const id = String((row as CategoryDef).id || '').trim();
    const label = String((row as CategoryDef).label || '').trim();
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label,
      emoji: String((row as CategoryDef).emoji || '🧺').slice(0, 8) || '🧺',
    });
  }
  return out;
}

export function getStatsWidgets() {
  return normalizeStatsWidgets(cache.settings.statsWidgets);
}

export async function setStatsWidgets(ids: string[]) {
  cache.settings.statsWidgets = normalizeStatsWidgets(ids);
  await persist();
  return cache.settings.statsWidgets;
}

export function getCustomCategories(): CategoryDef[] {
  return normalizeCustomCategories(cache.settings.customCategories);
}

export async function addCustomCategory(input: { label: string; emoji?: string }) {
  const label = String(input.label || '').trim();
  if (!label) throw new Error('Nombre vacío');
  const emoji = String(input.emoji || '🧺').trim() || '🧺';
  let id = slugCategory(label);
  const existing = getCustomCategories();
  if (existing.some((c) => c.id === id)) id = `${id}_${Date.now().toString(36).slice(-4)}`;
  const next = [...existing, { id, label, emoji }];
  cache.settings.customCategories = next;
  await persist();
  return next;
}

export async function removeCustomCategory(id: string) {
  const next = getCustomCategories().filter((c) => c.id !== id);
  cache.settings.customCategories = next;
  await persist();
  return next;
}

/** Solo mercados cerrados — historial y estadísticas. */
export function listClosedTrips() {
  return listTrips().filter((t) => t.status === 'closed');
}

export async function updateAiSettings(patch: Partial<AiSettings>) {
  cache.settings.ai = { ...getAiSettings(), ...patch };
  await persist();
  return cache.settings.ai;
}

export function getActiveTrip() {
  if (!cache.activeTripId) return null;
  return cache.trips.find((t) => t.id === cache.activeTripId) || null;
}

export async function startTrip({ budget }: { budget?: number } = {}) {
  const current = getActiveTrip();
  // No spawnear otro open si ya hay uno (evita basura / mercados fantasma).
  if (current && current.status !== 'closed') return current;

  const trip: Trip = {
    id: uid('trip'),
    createdAt: todayIso(),
    closedAt: null,
    storeName: 'MercApp',
    budget: Number(budget ?? cache.settings.budgetDefault) || 0,
    status: 'open',
    items: [],
    receipt: null,
    sync: null,
  };
  cache.trips.unshift(trip);
  cache.activeTripId = trip.id;
  await persist();
  return trip;
}

function touchProductMeta(item: CartItem) {
  const key = nameKey(item.name);
  if (!key) return;
  const prev = cache.products[key] || {
    name: item.name,
    category: item.category,
    photos: [],
    priceHistory: [],
  };
  prev.category = item.category || prev.category;
  prev.name = item.name || prev.name;
  cache.products[key] = prev;
}

/** Historial de precio/hábito: solo al cerrar el mercado (no mientras está open). */
function rememberProduct(item: CartItem, tripId: string) {
  const key = nameKey(item.name);
  if (!key) return;
  touchProductMeta(item);
  const unitPrice =
    item.amount != null && item.qty ? Number(item.amount) / Number(item.qty) : null;
  const prev = cache.products[key]!;
  prev.priceHistory.push({
    date: todayIso(),
    unitPrice: unitPrice != null && Number.isFinite(unitPrice) ? unitPrice : 0,
    qty: item.qty,
    unit: item.unit,
    amount: item.amount,
    tripId,
  });
  // ponytail: last 40 points
  if (prev.priceHistory.length > 40) prev.priceHistory = prev.priceHistory.slice(-40);
}

/** Solo entradas de mercados ya cerrados (Repetir / último precio). */
function historyFromClosed(
  hist: Product['priceHistory'] | undefined,
): Product['priceHistory'] {
  return (hist || []).filter((h) => {
    if (!h.tripId) return false;
    const t = cache.trips.find((x) => x.id === h.tripId);
    return t?.status === 'closed';
  });
}

export async function addItem(item: Omit<CartItem, 'id' | 'createdAt'> & { id?: string }) {
  const trip = getActiveTrip();
  if (!trip || trip.status === 'closed') throw new Error('No hay mercado abierto');
  const name = String(item.name || '').trim();
  if (!name) throw new Error('Nombre vacío');
  const qty = Number(item.qty);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Cantidad inválida');
  const amount = item.amount == null ? null : Number(item.amount);
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
    throw new Error('Precio inválido');
  }
  const row: CartItem = {
    id: uid('item'),
    name,
    qty,
    unit: item.unit || 'und',
    amount,
    category: item.category || 'otros',
    photoDataUrl: item.photoDataUrl || null,
    createdAt: todayIso(),
  };
  trip.items.push(row);
  touchProductMeta(row);
  await persist();
  return { trip, item: row };
}

export async function updateItem(itemId: string, patch: Partial<CartItem>) {
  const trip = getActiveTrip();
  if (!trip) throw new Error('No hay mercado abierto');
  if (trip.status === 'closed') throw new Error('El mercado ya está cerrado');
  const row = trip.items.find((i) => i.id === itemId);
  if (!row) throw new Error('Ítem no encontrado');
  if (patch.name != null) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('Nombre vacío');
    patch = { ...patch, name };
  }
  if (patch.qty != null) {
    const qty = Number(patch.qty);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('Cantidad inválida');
    patch = { ...patch, qty };
  }
  if (patch.amount !== undefined && patch.amount != null) {
    const amount = Number(patch.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Precio inválido');
    patch = { ...patch, amount };
  }
  Object.assign(row, patch);
  touchProductMeta(row);
  await persist();
  return { trip, item: row };
}

export async function removeItem(itemId: string) {
  const trip = getActiveTrip();
  if (!trip) throw new Error('No hay mercado abierto');
  if (trip.status === 'closed') throw new Error('El mercado ya está cerrado');
  trip.items = trip.items.filter((i) => i.id !== itemId);
  await persist();
  return trip;
}

export function tripTotal(trip: Trip | null) {
  return (trip?.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

/** Cerrar solo tiene sentido con al menos un ítem. */
export function canCloseTrip(trip: Trip | null) {
  return Boolean(trip && trip.status !== 'closed' && (trip.items?.length ?? 0) > 0);
}

export function listTrips() {
  return [...cache.trips].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function setCheckout(receiptPatch: {
  photoDataUrl?: string | null;
  ticketTotal?: number | null;
  notes?: string;
} = {}) {
  const trip = getActiveTrip();
  if (!trip) throw new Error('No hay mercado abierto');
  if (trip.status === 'closed') throw new Error('El mercado ya está cerrado');
  if (!trip.items.length) throw new Error('El carrito está vacío');
  if (receiptPatch.ticketTotal != null) {
    const n = Number(receiptPatch.ticketTotal);
    if (!Number.isFinite(n) || n < 0) throw new Error('Total de factura inválido');
  }
  trip.status = 'checkout';
  trip.receipt = { ...(trip.receipt || {}), ...receiptPatch };
  await persist();
  return trip;
}

export async function markSynced(
  tripId: string,
  syncInfo: { at: string; ok: boolean; error?: string; expenseId?: string },
) {
  const trip = cache.trips.find((t) => t.id === tripId);
  if (!trip) return null;
  trip.sync = syncInfo;
  await persist();
  return trip;
}

export async function closeTrip() {
  const trip = getActiveTrip();
  if (!trip) throw new Error('No hay mercado abierto');
  if (trip.status === 'closed') throw new Error('El mercado ya está cerrado');
  if (!trip.items.length) throw new Error('El carrito está vacío');
  // Commit hábitos solo al cerrar (Repetir = mercados cerrados).
  for (const item of trip.items) rememberProduct(item, trip.id);
  trip.status = 'closed';
  trip.closedAt = todayIso();
  cache.activeTripId = null;
  await persist();
  return trip;
}

export function getProducts() {
  return cache.products;
}

export function findCartItemByName(name: string) {
  const trip = getActiveTrip();
  if (!trip) return null;
  const key = nameKey(name);
  if (!key) return null;
  return trip.items.find((i) => nameKey(i.name) === key) || null;
}

export function lastPriceFor(name: string) {
  const key = nameKey(name);
  const hist = historyFromClosed(cache.products[key]?.priceHistory);
  const last = [...hist].reverse().find((h) => Number(h.unitPrice) > 0) || hist.at(-1);
  if (!last) return null;
  const unitPrice = Number(last.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return {
      unitPrice: 0,
      unit: last.unit || 'und',
      qty: Number(last.qty) || 1,
      amount: last.amount ?? null,
      amountFor: (_q: number) => (last.amount != null ? Number(last.amount) : null),
    };
  }
  return {
    unitPrice,
    unit: last.unit || 'und',
    qty: Number(last.qty) || 1,
    amount: last.amount ?? null,
    amountFor: (q: number) => Math.round(unitPrice * q),
  };
}

function isLastCalendarMonth(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return d.getFullYear() === last.getFullYear() && d.getMonth() === last.getMonth();
}

export type HistorySuggestion = {
  name: string;
  qty: number;
  unit: string;
  amount: number | null;
  category: string;
  source: 'last-month' | 'usual' | 'last';
  label: string;
};

/** Moda de qty+unidad; prioriza compras del mes pasado. Solo mercados cerrados. */
export function suggestFromHistory(name: string): HistorySuggestion | null {
  const product = cache.products[nameKey(name)];
  const hist = historyFromClosed(product?.priceHistory);
  if (!product || !hist.length) return null;

  const lastMonth = hist.filter((h) => isLastCalendarMonth(h.date));
  const pool = lastMonth.length ? lastMonth : hist.slice(-8);
  const counts = new Map<string, { n: number; sample: (typeof hist)[0] }>();
  for (const h of pool) {
    const k = `${Number(h.qty)}|${h.unit || 'und'}`;
    const prev = counts.get(k);
    if (prev) prev.n += 1;
    else counts.set(k, { n: 1, sample: h });
  }
  let best = pool[pool.length - 1];
  let bestN = 0;
  for (const { n, sample } of counts.values()) {
    if (n >= bestN) {
      bestN = n;
      best = sample;
    }
  }

  const qty = Number(best.qty) || 1;
  const unit = best.unit || 'und';
  const unitPrice = Number(best.unitPrice);
  const amount =
    best.amount != null
      ? Number(best.amount)
      : unitPrice > 0
        ? Math.round(unitPrice * qty)
        : null;

  const source = lastMonth.length ? 'last-month' : bestN > 1 ? 'usual' : 'last';
  const prefix =
    source === 'last-month' ? 'Como el mes pasado' : source === 'usual' ? 'Lo de siempre' : 'Última vez';

  return {
    name: product.name,
    qty,
    unit,
    amount: amount != null && Number.isFinite(amount) ? amount : null,
    category: product.category || 'otros',
    source,
    label: `${prefix} · ${qty} ${unit}`,
  };
}

/** Chips rápidos: hábitos de mercados cerrados. */
export function recentHabitSuggestions(limit = 6): HistorySuggestion[] {
  const rows = Object.values(cache.products)
    .filter((p) => historyFromClosed(p.priceHistory).length)
    .map((p) => suggestFromHistory(p.name))
    .filter((s): s is HistorySuggestion => Boolean(s))
    .sort((a, b) => {
      const rank = (s: HistorySuggestion) =>
        s.source === 'last-month' ? 0 : s.source === 'usual' ? 1 : 2;
      return rank(a) - rank(b);
    });
  const seen = new Set<string>();
  const out: HistorySuggestion[] = [];
  for (const s of rows) {
    const k = nameKey(s.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

/** Test helper: seed closed trip + product habit without UI. */
export function _seedProductForTests(
  name: string,
  entries: Array<{ date: string; qty: number; unit: string; amount?: number | null; unitPrice?: number }>,
) {
  const tripId = uid('trip');
  cache.trips.unshift({
    id: tripId,
    createdAt: entries[0]?.date || todayIso(),
    closedAt: entries.at(-1)?.date || todayIso(),
    storeName: 'seed',
    budget: 0,
    status: 'closed',
    items: [],
    receipt: null,
    sync: null,
  });
  const key = nameKey(name);
  cache.products[key] = {
    name,
    category: 'otros',
    photos: [],
    priceHistory: entries.map((e) => ({
      date: e.date,
      qty: e.qty,
      unit: e.unit,
      amount: e.amount ?? null,
      unitPrice: e.unitPrice ?? (e.amount && e.qty ? Number(e.amount) / e.qty : 0),
      tripId,
    })),
  };
}
