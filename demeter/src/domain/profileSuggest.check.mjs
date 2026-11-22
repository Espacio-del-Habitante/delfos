import assert from 'node:assert/strict';

const HINTS = {
  fitness: [
    { name: 'pechuga de pollo', qty: 1, unit: 'kg', category: 'proteina', why: 'x' },
    { name: 'huevos', qty: 1, unit: 'paq', category: 'proteina', why: 'y' },
  ],
  divertido: [{ name: 'chocolate', qty: 1, unit: 'und', category: 'otros', why: 'z' }],
  excentrico: [{ name: 'kimchi', qty: 1, unit: 'und', category: 'verduras', why: 'w' }],
};

function keyOf(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

function profileBuySuggestions(profile, cart, limit = 4) {
  const id = ['fitness', 'divertido', 'excentrico'].includes(profile) ? profile : 'fitness';
  const inCart = new Set(cart.map((c) => keyOf(c.name)).filter(Boolean));
  const out = [];
  for (const hint of HINTS[id]) {
    if (inCart.has(keyOf(hint.name))) continue;
    out.push(hint);
    if (out.length >= limit) break;
  }
  return out;
}

assert.equal(profileBuySuggestions('fitness', []).length, 2);
assert.equal(profileBuySuggestions('fitness', [{ name: 'Huevos' }]).length, 1);
assert.equal(profileBuySuggestions('divertido', [])[0].name, 'chocolate');

console.log('profileSuggest.check ok');
