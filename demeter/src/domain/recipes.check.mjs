import assert from 'node:assert/strict';

function keyOf(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

function recipesFromCart(items) {
  const keys = items.map((i) => keyOf(i.name));
  const has = (n) => keys.some((k) => k.includes(keyOf(n)));
  if (has('pollo') || has('pechuga')) {
    return [{ title: 'Bowl de pollo y verduras', uses: items.map((i) => i.name) }];
  }
  if (items.length) {
    return [{ title: 'Lo que hay en la bolsa', uses: items.map((i) => i.name) }];
  }
  return [];
}

function parseRecipesJson(raw) {
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.recipes)) return [];
    return data.recipes.filter((r) => r && r.title).slice(0, 5);
  } catch {
    return [];
  }
}

assert.equal(recipesFromCart([{ name: 'pechuga de pollo' }])[0].title.includes('pollo'), true);
assert.equal(recipesFromCart([]).length, 0);
assert.equal(parseRecipesJson('{"recipes":[{"title":"A"}]}').length, 1);
assert.equal(parseRecipesJson('nope').length, 0);

console.log('recipes.check ok');
