import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

/** Mirror de store.tripTotal — suma amount de cada ítem (line total). */
function tripTotal(trip) {
  return (trip?.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

const TARGET = 1_000_000;

/** Mercado aleatorio que suma exactamente TARGET. */
function buildRandomMillionMarket(seed = 42) {
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };

  const catalog = [
    { name: 'arroz Diana 5kg', category: 'granos', unit: 'und', price: 28900 },
    { name: 'aceite Premier 3L', category: 'otros', unit: 'und', price: 34900 },
    { name: 'leche Alpina x6', category: 'lacteos', unit: 'paq', price: 24900 },
    { name: 'pollo entero', category: 'proteina', unit: 'kg', price: 18500 },
    { name: 'carne molida', category: 'proteina', unit: 'lb', price: 12900 },
    { name: 'papa pastusa', category: 'verduras', unit: 'lb', price: 2200 },
    { name: 'plátano hartón', category: 'verduras', unit: 'und', price: 1800 },
    { name: 'banano', category: 'frutas', unit: 'und', price: 600 },
    { name: 'huevos x30', category: 'proteina', unit: 'paq', price: 16900 },
    { name: 'pan Tajado', category: 'harinas', unit: 'und', price: 7900 },
    { name: 'café Sello Rojo', category: 'bebidas', unit: 'und', price: 28900 },
    { name: 'detergente Fab', category: 'aseo', unit: 'und', price: 22900 },
    { name: 'papel higiénico x12', category: 'aseo', unit: 'paq', price: 24900 },
    { name: 'gaseosa 3L', category: 'bebidas', unit: 'und', price: 8900 },
    { name: 'queso campesino', category: 'lacteos', unit: 'lb', price: 15900 },
    { name: 'tomate chonto', category: 'verduras', unit: 'lb', price: 3500 },
    { name: 'cebolla cabezona', category: 'verduras', unit: 'lb', price: 2800 },
    { name: 'atún Van Camps', category: 'proteina', unit: 'und', price: 5900 },
    { name: 'avena Quaker', category: 'granos', unit: 'und', price: 12900 },
    { name: 'yogur Alpina', category: 'lacteos', unit: 'und', price: 8900 },
  ];

  const items = [];
  let remaining = TARGET;
  let n = 0;

  while (remaining > 0 && n < 80) {
    const p = catalog[Math.floor(rnd() * catalog.length)];
    const maxQty = Math.max(1, Math.floor(remaining / p.price));
    if (maxQty < 1) break;
    // qty 1..min(8, maxQty) salvo al final
    let qty = 1 + Math.floor(rnd() * Math.min(8, maxQty));
    let amount = qty * p.price;
    if (amount > remaining) {
      qty = Math.floor(remaining / p.price);
      if (qty < 1) {
        // remanente: un ítem de ajuste
        items.push({
          id: `adj_${n}`,
          name: 'ajuste mercado',
          qty: 1,
          unit: 'und',
          amount: remaining,
          category: 'otros',
        });
        remaining = 0;
        break;
      }
      amount = qty * p.price;
    }
    items.push({
      id: `it_${n}`,
      name: p.name,
      qty,
      unit: p.unit,
      amount,
      category: p.category,
    });
    remaining -= amount;
    n += 1;
  }

  if (remaining > 0) {
    items.push({
      id: 'adj_final',
      name: 'ajuste mercado',
      qty: 1,
      unit: 'und',
      amount: remaining,
      category: 'otros',
    });
    remaining = 0;
  }

  const trip = { id: 'sim', budget: TARGET, items, status: 'open' };
  return trip;
}

const trip = buildRandomMillionMarket(20261121);
const total = tripTotal(trip);
const manual = trip.items.reduce((s, i) => s + i.amount, 0);

assert.equal(total, TARGET, `tripTotal=${total} expected ${TARGET}`);
assert.equal(manual, TARGET, `manual sum=${manual}`);
assert.equal(trip.items.filter((i) => i.amount == null).length, 0);

// null / basura no rompen
assert.equal(tripTotal({ items: [{ amount: 1000 }, { amount: null }, { amount: '500' }] }), 1500);
assert.equal(tripTotal(null), 0);

console.log(
  JSON.stringify(
    {
      ok: true,
      target: TARGET,
      total,
      items: trip.items.length,
      sample: trip.items.slice(0, 5).map((i) => ({
        name: i.name,
        qty: i.qty,
        amount: i.amount,
      })),
      last: trip.items[trip.items.length - 1],
    },
    null,
    2,
  ),
);

writeFileSync('/tmp/demeter-million-market.json', JSON.stringify(trip, null, 2));
console.log('tripTotal check ok → /tmp/demeter-million-market.json');
