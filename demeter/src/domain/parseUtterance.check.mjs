/**
 * Smoke check without Metro: transpile-free mirror of the critical money/qty rules.
 * Full parser lives in parseUtterance.ts — keep these cases in sync when changing it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'parseUtterance.ts'), 'utf8');
assert.match(src, /amount === qtyNum \* 1000/);
assert.match(src, /intentOf/);
assert.match(src, /findItemMatches/);

// Lightweight inline reimplementation of the mil-vs-qty guard for runnable assert.
function moneyVsQty(qtyNum, amount, hasUnit) {
  if (amount == null || hasUnit) return { qty: qtyNum, amount };
  if (qtyNum === amount || amount === qtyNum * 1000) return { qty: 1, amount };
  return { qty: qtyNum, amount };
}
assert.deepEqual(moneyVsQty(8000, 8000, false), { qty: 1, amount: 8000 });
assert.deepEqual(moneyVsQty(3, 3000, false), { qty: 1, amount: 3000 });
assert.deepEqual(moneyVsQty(3, 3000, true), { qty: 3, amount: 3000 });

console.log('parseUtterance check ok');
