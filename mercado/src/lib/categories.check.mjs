import assert from 'node:assert/strict';
import { categorizeProduct } from './categories.js';

assert.equal(categorizeProduct('carne de res'), 'proteina');
assert.equal(categorizeProduct('3 libras de papa'), 'verduras');
assert.equal(categorizeProduct('pan tajado'), 'harinas');
assert.equal(categorizeProduct('xyz desconocido'), 'otros');
console.log('categories check ok');
