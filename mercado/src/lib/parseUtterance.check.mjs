import assert from 'node:assert/strict';
import { parseUtterance, findItemMatches } from './parseUtterance.js';

const a = parseUtterance('compré 3 libras de papa 30 mil');
assert.equal(a.intent, 'add');
assert.equal(a.item.qty, 3);
assert.equal(a.item.unit, 'lb');
assert.equal(a.item.amount, 30000);
assert.match(a.item.name, /papa/);
assert.equal(a.item.category, 'verduras');

const b = parseUtterance('4 kg de carne 56 mil');
assert.equal(b.intent, 'add');
assert.equal(b.item.qty, 4);
assert.equal(b.item.unit, 'kg');
assert.equal(b.item.amount, 56000);
assert.equal(b.item.category, 'proteina');

const c = parseUtterance('mejor 2 libras de papa');
assert.equal(c.intent, 'update');
assert.equal(c.item.qty, 2);
assert.match(c.item.name, /papa/);

const d = parseUtterance('listo voy a pagar');
assert.equal(d.intent, 'checkout');

const matches = findItemMatches(
  [
    { id: '1', name: 'papa criolla' },
    { id: '2', name: 'carne de res' },
  ],
  'papa',
);
assert.equal(matches[0].id, '1');

const e = parseUtterance('papa');
assert.equal(e.intent, 'add');
assert.match(e.item.name, /papa/);
assert.equal(e.item.amount, null);
assert.ok(e.confidence >= 0.7);

const f = parseUtterance('papa 8000');
assert.equal(f.intent, 'add');
assert.equal(f.item.qty, 1);
assert.equal(f.item.amount, 8000);
assert.match(f.item.name, /papa/);

console.log('parseUtterance check ok');
