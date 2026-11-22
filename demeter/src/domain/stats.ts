import { CATEGORIES } from './categories';

export type TripLike = {
  items?: Array<{ category?: string; amount?: number | null }>;
  receipt?: { ticketTotal?: number | null } | null;
};

export type ProductLike = {
  name: string;
  category: string;
  priceHistory: Array<{ unitPrice: number }>;
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
