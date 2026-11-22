import assert from 'node:assert/strict';

function buildBody(trip, settings) {
  const base = String(settings.delfosApiBase || '').replace(/\/$/, '');
  if (!base) throw new Error('Configura la URL de Delfos en Ajustes');
  const ticket = trip.receipt?.ticketTotal;
  const cart = (trip.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const total =
    ticket != null && Number.isFinite(Number(ticket)) && Number(ticket) > 0
      ? Number(ticket)
      : cart;
  if (!total || total <= 0) throw new Error('El total del mercado es 0');
  return {
    url: `${base}/api/expenses`,
    amount: total,
    description: `Ágora · ${trip.storeName || 'Mercado'} · ${trip.items.length} ítems`,
  };
}

function pendingSyncTrips(trips) {
  return trips.filter((t) => t.status === 'closed' && !t.sync?.ok);
}

assert.throws(() => buildBody({ items: [{ amount: 1000 }], storeName: 'X' }, {}), /URL de Delfos/);
const body = buildBody(
  {
    items: [{ amount: 1000 }, { amount: 500 }],
    storeName: 'Éxito',
    receipt: { ticketTotal: 1600 },
  },
  { delfosApiBase: 'http://localhost:5000/' },
);
assert.equal(body.url, 'http://localhost:5000/api/expenses');
assert.equal(body.amount, 1600);

const trips = [
  { id: 'a', status: 'closed', sync: null },
  { id: 'b', status: 'closed', sync: { ok: true } },
  { id: 'c', status: 'closed', sync: { ok: false } },
  { id: 'd', status: 'open', sync: null },
];
const pending = pendingSyncTrips(trips);
assert.deepEqual(
  pending.map((t) => t.id),
  ['a', 'c'],
);

console.log('syncDelfos check ok');
