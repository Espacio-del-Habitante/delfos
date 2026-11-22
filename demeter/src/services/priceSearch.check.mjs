import assert from 'node:assert/strict';

function extractCopPrices(text) {
  const out = [];
  const re =
    /(?:\$\s*)(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})(?:\s*(?:COP|pesos))?|\b(\d{1,3}(?:[.\s]\d{3})+)\s*(?:COP|pesos)\b/gi;
  for (const m of String(text || '').matchAll(re)) {
    const token = (m[1] || m[2] || '').replace(/\s/g, '').replace(/\./g, '');
    const n = Number(token);
    if (Number.isFinite(n) && n >= 500 && n <= 2_000_000) out.push(n);
  }
  return out;
}

function median(nums) {
  if (!nums.length) return null;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

assert.deepEqual(extractCopPrices('aprox $12.500 COP y $3.200'), [12500, 3200]);
assert.equal(extractCopPrices('año 2024 id 123').length, 0);
assert.equal(median([1000, 3000, 2000]), 2000);
assert.equal(median([1000, 2000]), 1500);

console.log('priceSearch check ok');
