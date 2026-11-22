import assert from 'node:assert/strict';

const TO_KG = { kg: 1, lb: 0.453592, g: 0.001, gr: 0.001 };

function convertQty(qty, from, to) {
  const q = Number(qty);
  if (!Number.isFinite(q)) return null;
  const a = from === 'gr' ? 'g' : from;
  const b = to === 'gr' ? 'g' : to;
  if (!(a in TO_KG) || !(b in TO_KG)) return null;
  if (a === b) return q;
  const kg = q * TO_KG[a];
  return Math.round((kg / TO_KG[b]) * 1000) / 1000;
}

function unitPriceAs(total, qty, unit, asUnit) {
  const t = Number(total);
  const q = Number(qty);
  if (!Number.isFinite(t) || !Number.isFinite(q) || t <= 0 || q <= 0) return null;
  const converted = convertQty(q, unit, asUnit);
  if (converted == null || converted <= 0) {
    if (unit === asUnit) return Math.round(t / q);
    return null;
  }
  return Math.round(t / converted);
}

function inferPackFromText(text) {
  const t = String(text || '');
  const m = t.match(/(?:x\s*)?(\d+(?:[.,]\d+)?)\s*(kg|kilos?|g|gr|gramos?|lb|libras?)\b/i);
  if (!m) return null;
  const qty = Number(String(m[1]).replace(',', '.'));
  if (!Number.isFinite(qty) || qty <= 0) return null;
  let unit = m[2].toLowerCase();
  if (unit.startsWith('kilo') || unit === 'kg') unit = 'kg';
  else if (unit.startsWith('libra') || unit === 'lb') unit = 'lb';
  else unit = 'g';
  return { qty, unit };
}

// 3 lb × 8000 → ~2667 / lb
assert.equal(unitPriceAs(8000, 3, 'lb', 'lb'), 2667);

// Éxito 5000 g por 30000 vs 1 lb a 3000
const exitoPerLb = unitPriceAs(30000, 5000, 'g', 'lb');
const minePerLb = unitPriceAs(3000, 1, 'lb', 'lb');
assert.ok(exitoPerLb != null && minePerLb != null);
assert.ok(exitoPerLb < minePerLb, 'pack grande debe salir más barato por libra');

assert.deepEqual(inferPackFromText('Arroz Diana 5000g'), { qty: 5000, unit: 'g' });
assert.deepEqual(inferPackFromText('Arroz x 5 kg'), { qty: 5, unit: 'kg' });
assert.equal(inferPackFromText('Sin peso'), null);

// Recalc: rate fijo, qty 3 → 6
const rate = 8000 / 3;
assert.equal(Math.round(rate * 6), 16000);

console.log('units.check ok');
