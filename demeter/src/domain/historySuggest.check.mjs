import assert from 'node:assert/strict';

// Node can't import TS store (AsyncStorage). Mirror the ranking rules here.
function isLastCalendarMonth(iso, now = new Date()) {
  const d = new Date(iso);
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return d.getFullYear() === last.getFullYear() && d.getMonth() === last.getMonth();
}

function suggest(hist, now = new Date()) {
  const lastMonth = hist.filter((h) => isLastCalendarMonth(h.date, now));
  const pool = lastMonth.length ? lastMonth : hist.slice(-8);
  const counts = new Map();
  for (const h of pool) {
    const k = `${h.qty}|${h.unit}`;
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
  return {
    qty: best.qty,
    unit: best.unit,
    source: lastMonth.length ? 'last-month' : bestN > 1 ? 'usual' : 'last',
  };
}

const now = new Date('2026-03-15T12:00:00Z');
const hist = [
  { date: '2026-01-10T00:00:00Z', qty: 1, unit: 'und' },
  { date: '2026-02-05T00:00:00Z', qty: 3, unit: 'lb' },
  { date: '2026-02-20T00:00:00Z', qty: 3, unit: 'lb' },
  { date: '2026-03-01T00:00:00Z', qty: 2, unit: 'kg' },
];
const s = suggest(hist, now);
assert.equal(s.source, 'last-month');
assert.equal(s.qty, 3);
assert.equal(s.unit, 'lb');

const onlyOld = suggest(
  [
    { date: '2025-12-01T00:00:00Z', qty: 5, unit: 'und' },
    { date: '2025-12-15T00:00:00Z', qty: 5, unit: 'und' },
  ],
  now,
);
assert.equal(onlyOld.source, 'usual');
assert.equal(onlyOld.qty, 5);

console.log('historySuggest check ok');
