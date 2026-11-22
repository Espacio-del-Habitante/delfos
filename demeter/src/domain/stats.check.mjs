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

console.log('stats check ok');
