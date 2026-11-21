import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid, todayIso } from './format';

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

type State = {
  settings: { budgetDefault: number; currency: string };
  activeTripId: string | null;
  trips: Trip[];
  products: Record<string, Product>;
};

const DEFAULT: State = {
  settings: { budgetDefault: 200000, currency: 'COP' },
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
        settings: { ...DEFAULT.settings, ...(data.settings || {}) },
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

export function getActiveTrip() {
  if (!cache.activeTripId) return null;
  return cache.trips.find((t) => t.id === cache.activeTripId) || null;
}

export async function startTrip({ budget }: { budget?: number } = {}) {
  const trip: Trip = {
    id: uid('trip'),
    createdAt: todayIso(),
    closedAt: null,
    storeName: 'Deméter',
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

function rememberProduct(item: CartItem) {
  const key = nameKey(item.name);
  if (!key) return;
  const unitPrice =
    item.amount != null && item.qty ? Number(item.amount) / Number(item.qty) : null;
  const prev = cache.products[key] || {
    name: item.name,
    category: item.category,
    photos: [],
    priceHistory: [],
  };
  prev.category = item.category || prev.category;
  prev.name = item.name || prev.name;
  if (unitPrice != null && Number.isFinite(unitPrice)) {
    prev.priceHistory.push({
      date: todayIso(),
      unitPrice,
      qty: item.qty,
      unit: item.unit,
      amount: item.amount,
      tripId: cache.activeTripId,
    });
    // ponytail: last 40 points
    if (prev.priceHistory.length > 40) prev.priceHistory = prev.priceHistory.slice(-40);
  }
  cache.products[key] = prev;
}

export async function addItem(item: Omit<CartItem, 'id' | 'createdAt'> & { id?: string }) {
  const trip = getActiveTrip();
  if (!trip || trip.status === 'closed') throw new Error('No hay mercado abierto');
  const row: CartItem = {
    id: uid('item'),
    name: item.name,
    qty: Number(item.qty) || 1,
    unit: item.unit || 'und',
    amount: item.amount == null ? null : Number(item.amount),
    category: item.category || 'otros',
    photoDataUrl: item.photoDataUrl || null,
    createdAt: todayIso(),
  };
  trip.items.push(row);
  rememberProduct(row);
  await persist();
  return { trip, item: row };
}

export async function updateItem(itemId: string, patch: Partial<CartItem>) {
  const trip = getActiveTrip();
  if (!trip) throw new Error('No hay mercado abierto');
  const row = trip.items.find((i) => i.id === itemId);
  if (!row) throw new Error('Ítem no encontrado');
  Object.assign(row, patch);
  rememberProduct(row);
  await persist();
  return { trip, item: row };
}

export async function removeItem(itemId: string) {
  const trip = getActiveTrip();
  if (!trip) throw new Error('No hay mercado abierto');
  trip.items = trip.items.filter((i) => i.id !== itemId);
  await persist();
  return trip;
}

export function tripTotal(trip: Trip | null) {
  return (trip?.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

export async function closeTrip() {
  const trip = getActiveTrip();
  if (!trip) throw new Error('No hay mercado abierto');
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
  const hist = cache.products[key]?.priceHistory || [];
  const last = hist.at(-1);
  if (!last) return null;
  const unitPrice = Number(last.unitPrice);
  if (!Number.isFinite(unitPrice)) return null;
  return {
    unitPrice,
    unit: last.unit || 'und',
    amountFor: (q: number) => Math.round(unitPrice * q),
  };
}
