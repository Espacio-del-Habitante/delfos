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
    return [
      {
        title: 'Bowl de pollo y verduras',
        uses: items.map((i) => i.name),
        emoji: '🥗',
        description: 'Alto en proteína',
        steps: ['a', 'b', 'c', 'd', 'e'],
      },
    ];
  }
  if (items.length) {
    return [{ title: 'Lo que hay en la bolsa', uses: items.map((i) => i.name), emoji: '🧺' }];
  }
  return [];
}

function parseRecipesJson(raw) {
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.recipes)) return [];
    return data.recipes
      .filter((r) => r && r.title)
      .map((r) => ({
        ...r,
        emoji: r.emoji || '🍽️',
        description: r.description || '',
        steps: r.steps || [],
      }))
      .slice(0, 5);
  } catch {
    return [];
  }
}

const bowl = recipesFromCart([{ name: 'pechuga de pollo' }])[0];
assert.equal(bowl.title.includes('pollo'), true);
assert.equal(bowl.emoji, '🥗');
assert.ok(bowl.steps.length >= 3);
assert.equal(recipesFromCart([]).length, 0);
assert.equal(parseRecipesJson('{"recipes":[{"title":"A","description":"x","steps":["1"]}]}')[0].emoji, '🍽️');
assert.equal(parseRecipesJson('nope').length, 0);

console.log('recipes.check ok');
