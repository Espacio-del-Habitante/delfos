import { uid, todayIso } from './format.js';

const KEY = 'delfos_mercado_v1';

const DEFAULT = {
  settings: {
    budgetDefault: 200000,
    delfosApiBase: '',
    delfosAccountId: '',
    currency: 'COP',
  },
  activeTripId: null,
  trips: [],
  products: {}, // nameKey -> { name, category, photos: [], priceHistory: [{date, unitPrice, qty, unit}] }
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    const data = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT),
      ...data,
      settings: { ...DEFAULT.settings, ...(data.settings || {}) },
      products: data.products || {},
      trips: Array.isArray(data.trips) ? data.trips : [],
    };
  } catch {
    return structuredClone(DEFAULT);
  }
}

function save(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

function nameKey(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

export function getState() {
  return load();
}

export function updateSettings(patch) {
  const data = load();
  data.settings = { ...data.settings, ...patch };
  save(data);
  return data.settings;
}

export function getActiveTrip() {
  const data = load();
  if (!data.activeTripId) return null;
  return data.trips.find((t) => t.id === data.activeTripId) || null;
}

export function startTrip({ budget, storeName } = {}) {
  const data = load();
  const trip = {
    id: uid('trip'),
    createdAt: todayIso(),
    closedAt: null,
    storeName: storeName || 'Deméter',
    budget: Number(budget ?? data.settings.budgetDefault) || 0,
    status: 'open', // open | checkout | closed
    items: [],
    receipt: null, // { photoDataUrl, ticketTotal, comparedAt, notes }
    sync: null, // { at, expenseId, ok, error }
  };
  data.trips.unshift(trip);
  data.activeTripId = trip.id;
  save(data);
  return trip;
}

function persistTrip(trip) {
  const data = load();
  const i = data.trips.findIndex((t) => t.id === trip.id);
  if (i >= 0) data.trips[i] = trip;
  else data.trips.unshift(trip);
  save(data);
  return trip;
}

function rememberProduct(data, item) {
  const key = nameKey(item.name);
  if (!key) return;
  const unitPrice =
    item.amount != null && item.qty ? Number(item.amount) / Number(item.qty) : null;
  const prev = data.products[key] || {
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
      tripId: data.activeTripId,
    });
    // ponytail: keep last 40 points; enough for yearly glance without bloat
    if (prev.priceHistory.length > 40) prev.priceHistory = prev.priceHistory.slice(-40);
  }
  data.products[key] = prev;
}

export function addItem(item) {
  const data = load();
  const trip = data.trips.find((t) => t.id === data.activeTripId);
  if (!trip || trip.status === 'closed') throw new Error('No hay mercado abierto');
  const row = {
    id: uid('item'),
    name: item.name,
    qty: Number(item.qty) || 1,
    unit: item.unit || 'und',
    amount: item.amount == null ? null : Number(item.amount),
    category: item.category || 'otros',
    photoDataUrl: item.photoDataUrl || null,
    createdAt: todayIso(),
  };
  if (row.photoDataUrl) rememberProductPhoto(data, row.name, row.photoDataUrl);
  trip.items.push(row);
  rememberProduct(data, row);
  save(data);
  return { trip, item: row };
}

export function updateItem(itemId, patch) {
  const data = load();
  const trip = data.trips.find((t) => t.id === data.activeTripId);
  if (!trip) throw new Error('No hay mercado abierto');
  const row = trip.items.find((i) => i.id === itemId);
  if (!row) throw new Error('Ítem no encontrado');
  Object.assign(row, patch);
  if (patch.photoDataUrl) rememberProductPhoto(data, row.name, patch.photoDataUrl);
  rememberProduct(data, row);
  save(data);
  return { trip, item: row };
}

export function removeItem(itemId) {
  const data = load();
  const trip = data.trips.find((t) => t.id === data.activeTripId);
  if (!trip) throw new Error('No hay mercado abierto');
  trip.items = trip.items.filter((i) => i.id !== itemId);
  save(data);
  return trip;
}

export function tripTotal(trip) {
  return (trip?.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

export function setCheckout(receiptPatch = {}) {
  const data = load();
  const trip = data.trips.find((t) => t.id === data.activeTripId);
  if (!trip) throw new Error('No hay mercado abierto');
  trip.status = 'checkout';
  trip.receipt = { ...(trip.receipt || {}), ...receiptPatch, comparedAt: todayIso() };
  save(data);
  return trip;
}

export function closeTrip() {
  const data = load();
  const trip = data.trips.find((t) => t.id === data.activeTripId);
  if (!trip) throw new Error('No hay mercado abierto');
  trip.status = 'closed';
  trip.closedAt = todayIso();
  data.activeTripId = null;
  save(data);
  return trip;
}

export function markSynced(tripId, syncInfo) {
  const data = load();
  const trip = data.trips.find((t) => t.id === tripId);
  if (!trip) return null;
  trip.sync = syncInfo;
  save(data);
  return trip;
}

export function listTrips() {
  return load().trips;
}

export function getProducts() {
  return load().products;
}

function rememberProductPhoto(data, name, dataUrl) {
  const key = nameKey(name);
  if (!key || !dataUrl) return;
  const prev = data.products[key] || { name, category: 'otros', photos: [], priceHistory: [] };
  prev.photos = [dataUrl, ...(prev.photos || []).filter((p) => p !== dataUrl)].slice(0, 3);
  data.products[key] = prev;
}

export function attachProductPhoto(name, dataUrl) {
  const data = load();
  rememberProductPhoto(data, name, dataUrl);
  save(data);
  return data.products[nameKey(name)] || null;
}

/** Ítem del carrito activo con el mismo nombre (normalizado). */
export function findCartItemByName(name) {
  const trip = getActiveTrip();
  if (!trip) return null;
  const key = nameKey(name);
  if (!key) return null;
  return trip.items.find((i) => nameKey(i.name) === key) || null;
}

export function categoryBreakdown(trip) {
  const map = {};
  for (const it of trip?.items || []) {
    const k = it.category || 'otros';
    map[k] = (map[k] || 0) + (Number(it.amount) || 0);
  }
  return map;
}

export function exportTripJson(trip) {
  return JSON.stringify(trip, null, 2);
}

export { persistTrip, nameKey, load as _loadForTests };
