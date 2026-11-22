import assert from 'node:assert/strict';

function tripLineTotal(trip) {
  return (trip?.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

function categoryBreakdown(trip) {
  const map = {};
  for (const it of trip?.items || []) {
    const k = it.category || 'otros';
    map[k] = (map[k] || 0) + (Number(it.amount) || 0);
  }
  return map;
}

function spentTotal(trips) {
  return trips.reduce((s, t) => {
    const ticket = Number(t.receipt?.ticketTotal);
    return s + (Number.isFinite(ticket) && ticket > 0 ? ticket : tripLineTotal(t));
  }, 0);
}

function lastDelta(history) {
  if (!history || history.length < 2) return null;
  return history[history.length - 1].unitPrice - history[history.length - 2].unitPrice;
}

const trip = {
  items: [
    { category: 'proteina', amount: 10000 },
    { category: 'harinas', amount: 4000 },
    { category: 'proteina', amount: 2000 },
  ],
  receipt: null,
};

assert.equal(tripLineTotal(trip), 16000);
assert.deepEqual(categoryBreakdown(trip), { proteina: 12000, harinas: 4000 });
assert.equal(spentTotal([{ ...trip, receipt: { ticketTotal: 15000 } }]), 15000);
assert.equal(lastDelta([{ unitPrice: 100 }, { unitPrice: 130 }]), 30);
assert.equal(lastDelta([{ unitPrice: 100 }]), null);

function monthKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function modeQtyUnit(hist) {
  const counts = new Map();
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

function idealMonthlyMarket(products, limit = 12) {
  const rows = [];
  const allMonths = new Set();
  for (const p of Object.values(products)) {
    const hist = p.priceHistory || [];
    if (!hist.length) continue;
    for (const h of hist) {
      const mk = monthKey(h.date);
      if (mk) allMonths.add(mk);
    }
    const months = Math.max(1, new Set(hist.map((h) => monthKey(h.date)).filter(Boolean)).size);
    const buysPerMonth = hist.length / months;
    const { qty, unit } = modeQtyUnit(hist);
    const unitPrice = Number(hist.at(-1)?.unitPrice) || 0;
    const monthlyQty =
      unit === 'und' || unit === 'paq' ? Math.max(1, Math.round(qty * buysPerMonth)) : Math.round(qty * buysPerMonth * 10) / 10;
    if (monthlyQty <= 0 || unitPrice <= 0) continue;
    rows.push({
      name: p.name,
      amount: Math.round(unitPrice * monthlyQty),
      qty: monthlyQty,
      unit,
    });
  }
  rows.sort((a, b) => b.amount - a.amount);
  const items = rows.slice(0, limit);
  return { items, total: items.reduce((s, i) => s + i.amount, 0), monthsSampled: Math.max(allMonths.size, 1) };
}

const ideal = idealMonthlyMarket({
  leche: {
    name: 'leche',
    category: 'lacteos',
    priceHistory: [
      { date: '2026-01-05', qty: 2, unit: 'und', unitPrice: 7000 },
      { date: '2026-01-20', qty: 2, unit: 'und', unitPrice: 7000 },
      { date: '2026-02-10', qty: 2, unit: 'und', unitPrice: 7200 },
      { date: '2026-02-25', qty: 2, unit: 'und', unitPrice: 7200 },
    ],
  },
  pan: {
    name: 'pan',
    category: 'harinas',
    priceHistory: [{ date: '2026-02-01', qty: 1, unit: 'und', unitPrice: 5000 }],
  },
});
// leche: 4 buys / 2 months = 2/mes × 2 und × 7200 = 28800
assert.equal(ideal.items[0].name, 'leche');
assert.equal(ideal.items[0].amount, 28800);
assert.equal(ideal.total, 28800 + 5000);
assert.equal(ideal.monthsSampled, 2);

console.log('stats check ok');
