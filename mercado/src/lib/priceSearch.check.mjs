import assert from 'node:assert/strict';
import { priceSearchLinks, extractCopPrices, googlePriceUrl } from './priceSearch.js';
import { convertQty } from './units.js';

const links = priceSearchLinks('papa criolla');
assert.ok(links.length >= 3);
assert.ok(links.some((l) => l.id === 'google'));

const prices = extractCopPrices('En Éxito $4.250 COP y en otro lado 3.900 pesos, ruido 2024');
assert.ok(prices.includes(4250));
assert.ok(prices.includes(3900));
assert.ok(!prices.includes(2024));

assert.ok(googlePriceUrl('papa', 'D1').includes('google.com'));

assert.equal(convertQty(1, 'kg', 'kg'), 1);
assert.ok(Math.abs(convertQty(1, 'lb', 'kg') - 0.454) < 0.01);
assert.equal(convertQty(2, 'und', 'kg'), null);

console.log('priceSearch/units check ok');
