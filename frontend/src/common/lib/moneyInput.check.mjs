/** ponytail: node src/common/lib/moneyInput.check.mjs */
import assert from 'node:assert/strict';
import {
  caretAfterMoneyFormat,
  formatMoneyInput,
  formatMoneyTyping,
  parseMoneyInput,
} from './moneyInput.mjs';

assert.equal(parseMoneyInput('1.880.000,50'), 1880000.5);
assert.equal(parseMoneyInput('1.880.000'), 1880000);
assert.equal(parseMoneyInput('50,5'), 50.5);
assert.equal(parseMoneyInput('1880000.50'), 1880000.5);
assert.equal(parseMoneyInput('1,880,000.50'), 1880000.5);
assert.equal(parseMoneyInput(''), null);
assert.equal(parseMoneyInput('  '), null);
assert.equal(formatMoneyInput(1880000.5), '1.880.000,50');
assert.equal(formatMoneyInput(1880000), '1.880.000');
assert.equal(formatMoneyInput(null), '');
assert.equal(formatMoneyInput(0), '0');

assert.equal(formatMoneyTyping('1880000'), '1.880.000');
assert.equal(formatMoneyTyping('1880000,'), '1.880.000,');
assert.equal(formatMoneyTyping('1880000,5'), '1.880.000,5');
assert.equal(formatMoneyTyping('1.880.000,5'), '1.880.000,5');
assert.equal(formatMoneyTyping('0,5'), '0,5');
assert.equal(formatMoneyTyping(','), ',');
assert.equal(formatMoneyTyping(''), '');
assert.equal(formatMoneyTyping('1880000,567', 2), '1.880.000,56');

assert.equal(caretAfterMoneyFormat('1880000', 7, '1.880.000'), 9);
assert.equal(caretAfterMoneyFormat('1.880.000', 9, '1.880.000'), 9);
assert.equal(caretAfterMoneyFormat('188000,', 7, '188.000,'), 8);
assert.equal(caretAfterMoneyFormat('1.880.00', 8, '188.000'), 7);

console.log('moneyInput check ok');
