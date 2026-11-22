import assert from 'node:assert/strict';

function shareBlurb(catTotals) {
  const rows = Object.entries(catTotals)
    .map(([id, amount]) => ({ id, amount: Number(amount) || 0 }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  if (!rows.length) return null;
  return {
    topId: rows[0].id,
    topAmount: rows[0].amount,
    secondId: rows[1]?.id ?? null,
    secondAmount: rows[1]?.amount ?? 0,
  };
}

// Arroz (granos) > harinas → no forzar proteína
const b = shareBlurb({ granos: 12000, harinas: 4000, proteina: 2000 });
assert.equal(b.topId, 'granos');
assert.equal(b.secondId, 'harinas');
assert.equal(shareBlurb({}), null);
assert.equal(shareBlurb({ aseo: 5000 }).secondId, null);

console.log('shareBlurb.check ok');
