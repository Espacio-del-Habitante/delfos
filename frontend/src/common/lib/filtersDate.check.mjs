/** ponytail: node src/common/lib/filtersDate.check.mjs */
import assert from 'node:assert/strict';
import { inDateRange, toDay } from './filtersDate.mjs';

assert.equal(toDay('2026-07-15'), '2026-07-15');
assert.equal(toDay('2026-07-15T18:30:00'), '2026-07-15');
assert.equal(toDay('27 Jul'), '');
assert.equal(toDay(''), '');
assert.equal(toDay(null), '');

assert.equal(inDateRange('2026-07-15', '2026-07-15', '2026-07-15'), true);
assert.equal(inDateRange('2026-07-15', '2026-07-01', '2026-07-31'), true);
assert.equal(inDateRange('2026-07-15', '2026-07-16', ''), false);
assert.equal(inDateRange('2026-07-15', '', '2026-07-14'), false);
assert.equal(inDateRange('2026-07-15', '', ''), true);
assert.equal(inDateRange('27 Jul', '2026-07-01', ''), false);
assert.equal(inDateRange('2026-07-15T09:00:00', '2026-07-15', '2026-07-15'), true);
// Inclusive bounds (misma semántica que list_movements date_from/date_to).
assert.equal(inDateRange('2026-06-01', '2026-06-01', '2026-06-30'), true);
assert.equal(inDateRange('2026-06-30', '2026-06-01', '2026-06-30'), true);
assert.equal(inDateRange('2026-05-31', '2026-06-01', '2026-06-30'), false);
assert.equal(inDateRange('2026-07-01', '2026-06-01', '2026-06-30'), false);

console.log('filtersDate check ok');
