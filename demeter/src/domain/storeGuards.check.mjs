import assert from 'node:assert/strict';

function canCloseTrip(trip) {
  return Boolean(trip && trip.status !== 'closed' && (trip.items?.length ?? 0) > 0);
}

function pendingSyncTrips(trips) {
  const tripTotal = (t) => (t.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  return trips.filter(
    (t) =>
      t.status === 'closed' &&
      !t.sync?.ok &&
      (t.items?.length ?? 0) > 0 &&
      (Number(t.receipt?.ticketTotal) > 0 || tripTotal(t) > 0),
  );
}

assert.equal(canCloseTrip(null), false);
assert.equal(canCloseTrip({ status: 'open', items: [] }), false);
assert.equal(canCloseTrip({ status: 'open', items: [{ id: '1' }] }), true);
assert.equal(canCloseTrip({ status: 'closed', items: [{ id: '1' }] }), false);

const pending = pendingSyncTrips([
  { id: 'empty', status: 'closed', sync: null, items: [] },
  { id: 'zero', status: 'closed', sync: null, items: [{ amount: 0 }] },
  { id: 'ok', status: 'closed', sync: null, items: [{ amount: 5000 }] },
  { id: 'ticket', status: 'closed', sync: null, items: [], receipt: { ticketTotal: 1000 } }, // sin ítems → out
  { id: 'done', status: 'closed', sync: { ok: true }, items: [{ amount: 100 }] },
]);
assert.deepEqual(
  pending.map((t) => t.id),
  ['ok'],
);

// Repetir: no sugerir desde open
function historyFromClosed(hist, trips) {
  return (hist || []).filter((h) => trips.find((t) => t.id === h.tripId)?.status === 'closed');
}
assert.deepEqual(
  historyFromClosed(
    [
      { tripId: 'a', qty: 1 },
      { tripId: 'b', qty: 2 },
    ],
    [
      { id: 'a', status: 'closed' },
      { id: 'b', status: 'open' },
    ],
  ).map((h) => h.tripId),
  ['a'],
);

console.log('storeGuards.check ok');
