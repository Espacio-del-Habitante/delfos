import assert from 'node:assert/strict';
import { priceSearchLinks } from './priceSearch.js';
import { convertQty } from './units.js';

const links = priceSearchLinks('papa criolla');
assert.equal(links.length, 3);
assert.ok(links[0].url.includes('mercadolibre'));
assert.ok(links[1].url.includes('tbm=shop'));

assert.equal(convertQty(1, 'kg', 'kg'), 1);
assert.ok(Math.abs(convertQty(1, 'lb', 'kg') - 0.454) < 0.01);
assert.equal(convertQty(2, 'und', 'kg'), null);

console.log('priceSearch/units check ok');
