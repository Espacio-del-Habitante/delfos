import { CATEGORIES } from './categories';

export type TripLike = {
  items?: Array<{ category?: string; amount?: number | null }>;
  receipt?: { ticketTotal?: number | null } | null;
  createdAt?: string | null;
  closedAt?: string | null;
};

/** Gadgets de Estadísticas — el usuario elige cuáles mostrar. */
export const STATS_WIDGETS = [
  { id: 'summary', label: 'Resumen', blurb: 'Cosechas y total gastado' },
  { id: 'donut', label: 'Donut categorías', blurb: 'Reparto visual del gasto' },
  { id: 'bars', label: 'Barras categorías', blurb: 'Comparativa por tipo' },
  { id: 'trend', label: 'Gasto mensual', blurb: 'Línea de los últimos meses' },
  { id: 'ideal', label: 'Mercado ideal', blurb: 'Tu ritmo mensual estimado' },
  { id: 'prices', label: 'Precios que cambian', blurb: 'Unitario vs compra pasada' },
  { id: 'share', label: 'Card para redes', blurb: 'Lean proteína / harinas' },
] as const;

export type StatsWidgetId = (typeof STATS_WIDGETS)[number]['id'];

export const DEFAULT_STATS_WIDGETS: StatsWidgetId[] = [
  'summary',
  'donut',
  'bars',
  'trend',
  'ideal',
  'prices',
  'share',
];

const WIDGET_SET = new Set<string>(STATS_WIDGETS.map((w) => w.id));

export function normalizeStatsWidgets(raw: unknown): StatsWidgetId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_STATS_WIDGETS];
  const seen = new Set<string>();
  const out: StatsWidgetId[] = [];
  for (const id of raw) {
    if (typeof id !== 'string' || !WIDGET_SET.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id as StatsWidgetId);
  }
  return out.length ? out : [...DEFAULT_STATS_WIDGETS];
}

/** Paleta verde Ágora + acentos legibles en charts. */
export const CHART_PALETTE = [
  '#1b7a4a',
  '#3d9b6c',
  '#86efac',
  '#14532d',
  '#0f766e',
  '#65a30d',
  '#15803d',
  '#4ade80',
  '#166534',
  '#a3e635',
];

export type ProductLike = {
  name: string;
  category: string;
  priceHistory: Array<{
    unitPrice: number;
    qty?: number;
    unit?: string;
    amount?: number | null;
    date?: string;
  }>;
};

export type IdealLine = {
  name: string;
  category: string;
  qty: number;
  unit: string;
  amount: number;
  buysPerMonth: number;
};

export function tripLineTotal(trip: TripLike | null) {
  return (trip?.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

export function spentTotal(trips: TripLike[]) {
  return trips.reduce((s, t) => {
    const ticket = Number(t.receipt?.ticketTotal);
    return s + (Number.isFinite(ticket) && ticket > 0 ? ticket : tripLineTotal(t));
  }, 0);
}

export function categoryBreakdown(trip: TripLike | null): Record<string, number> {
  const map: Record<string, number> = {};
  for (const it of trip?.items || []) {
    const k = it.category || 'otros';
    map[k] = (map[k] || 0) + (Number(it.amount) || 0);
  }
  return map;
}

export function aggregateCategories(trips: TripLike[]) {
  const map: Record<string, number> = {};
  for (const t of trips) {
    for (const [k, v] of Object.entries(categoryBreakdown(t))) {
      map[k] = (map[k] || 0) + v;
    }
  }
  return map;
}

export function categoryBars(trips: TripLike[]) {
  const totals = aggregateCategories(trips);
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  return CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    emoji: c.emoji,
    amount: totals[c.id] || 0,
    pct: Math.round(((totals[c.id] || 0) / sum) * 100),
  })).filter((r) => r.amount > 0);
}

export function lastDelta(history: Array<{ unitPrice: number }>) {
  if (!history || history.length < 2) return null;
  return history[history.length - 1].unitPrice - history[history.length - 2].unitPrice;
}

/** Puntos SVG polyline viewBox 0..100 × 0..56 */
export function sparkPoints(history: Array<{ unitPrice: number }>) {
  const vals = history.map((h) => h.unitPrice);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  return vals
    .map((v, i) => {
      const x = (i / Math.max(vals.length - 1, 1)) * 100;
      const y = 50 - ((v - min) / span) * 42;
      return `${x},${y}`;
    })
    .join(' ');
}

export function productsWithSparks(products: Record<string, ProductLike>, limit = 8) {
  return Object.values(products)
    .filter((p) => (p.priceHistory || []).length >= 2)
    .slice(0, limit)
    .map((p) => ({
      name: p.name,
      category: p.category,
      unitPrice: p.priceHistory.at(-1)?.unitPrice ?? 0,
      delta: lastDelta(p.priceHistory),
      history: p.priceHistory,
    }));
}

export function shareBlurb(catTotals: Record<string, number>) {
  const proteina = catTotals.proteina || 0;
  const harinas = catTotals.harinas || 0;
  return {
    lean: (proteina >= harinas ? 'proteina' : 'harinas') as 'proteina' | 'harinas',
    proteina,
    harinas,
  };
}

function tripMonthKey(trip: TripLike) {
  return monthKey(trip.closedAt || trip.createdAt || undefined);
}

/** Gasto por mes (últimos `limit` meses con datos), orden cronológico. */
export function monthlySpendSeries(trips: TripLike[], limit = 6) {
  const map = new Map<string, number>();
  for (const t of trips) {
    const mk = tripMonthKey(t);
    if (!mk) continue;
    map.set(mk, (map.get(mk) || 0) + spentTotal([t]));
  }
  const keys = [...map.keys()].sort();
  const sliced = keys.slice(-limit);
  return sliced.map((key) => {
    const [y, m] = key.split('-').map(Number);
    const label = new Date(y, m, 1).toLocaleDateString('es-CO', { month: 'short' });
    return { key, label: label.replace('.', ''), value: map.get(key) || 0 };
  });
}

function monthKey(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function modeQtyUnit(hist: ProductLike['priceHistory']) {
  const counts = new Map<string, { n: number; qty: number; unit: string }>();
  for (const h of hist) {
    const qty = Number(h.qty) || 1;
    const unit = h.unit || 'und';
    const k = `${qty}|${unit}`;
    const prev = counts.get(k);
    if (prev) prev.n += 1;
    else counts.set(k, { n: 1, qty, unit });
  }
  let best = { n: 0, qty: 1, unit: 'und' };
  for (const row of counts.values()) {
    if (row.n >= best.n) best = row;
  }
  return { qty: best.qty, unit: best.unit };
}

function lastUnitPrice(hist: ProductLike['priceHistory']) {
  for (let i = hist.length - 1; i >= 0; i--) {
    const p = Number(hist[i].unitPrice);
    if (Number.isFinite(p) && p > 0) return p;
    const amt = Number(hist[i].amount);
    const qty = Number(hist[i].qty) || 1;
    if (Number.isFinite(amt) && amt > 0 && qty > 0) return amt / qty;
  }
  return 0;
}

function roundQty(q: number, unit: string) {
  if (!Number.isFinite(q) || q <= 0) return 0;
  const discrete = unit === 'und' || unit === 'paq' || unit === 'lt';
  if (discrete) return Math.max(1, Math.round(q));
  return Math.round(q * 10) / 10;
}

/**
 * Mercado ideal mensual a partir del historial de productos.
 * Frecuencia = compras / meses distintos observados (mín. 1).
 * Cantidad típica = moda de qty+unidad; precio = último unitario > 0.
 */
export function idealMonthlyMarket(
  products: Record<string, ProductLike>,
  limit = 12,
): { items: IdealLine[]; total: number; monthsSampled: number; productCount: number } {
  const rows: IdealLine[] = [];
  const allMonths = new Set<string>();

  for (const p of Object.values(products)) {
    const hist = p.priceHistory || [];
    if (!hist.length) continue;
    for (const h of hist) {
      const mk = monthKey(h.date);
      if (mk) allMonths.add(mk);
    }
    const months = Math.max(
      1,
      new Set(hist.map((h) => monthKey(h.date)).filter(Boolean)).size,
    );
    const buysPerMonth = hist.length / months;
    const { qty, unit } = modeQtyUnit(hist);
    const unitPrice = lastUnitPrice(hist);
    const monthlyQty = roundQty(qty * buysPerMonth, unit);
    if (monthlyQty <= 0 || unitPrice <= 0) continue;
    const amount = Math.round(unitPrice * monthlyQty);
    rows.push({
      name: p.name,
      category: p.category || 'otros',
      qty: monthlyQty,
      unit,
      amount,
      buysPerMonth: Math.round(buysPerMonth * 10) / 10,
    });
  }

  rows.sort((a, b) => b.amount - a.amount);
  const items = rows.slice(0, limit);
  const total = items.reduce((s, i) => s + i.amount, 0);
  return {
    items,
    total,
    monthsSampled: Math.max(allMonths.size, 1),
    productCount: rows.length,
  };
}
