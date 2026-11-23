import assert from 'node:assert/strict';

function normalizeShopProfile(raw) {
  const id = String(raw || '').trim();
  if (id === 'fitness' || id === 'divertido' || id === 'excentrico') return id;
  return 'fitness';
}

assert.equal(normalizeShopProfile('divertido'), 'divertido');
assert.equal(normalizeShopProfile('nope'), 'fitness');
assert.equal(normalizeShopProfile(null), 'fitness');

console.log('shopProfiles.check ok');
