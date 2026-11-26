import assert from 'node:assert/strict';

function normalizeNutrition(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const n = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const out = {
    servingsPerPack: n(raw.servingsPerPack),
    kcal: n(raw.kcal),
    proteinG: n(raw.proteinG),
    carbsG: n(raw.carbsG),
    fatG: n(raw.fatG),
  };
  return out.kcal != null || out.proteinG != null ? out : null;
}

function estimateNutritionForItem(item) {
  const qty = Math.max(0.1, Number(item.qty) || 1);
  const unit = String(item.unit || 'und').toLowerCase();
  let servings = qty;
  if (unit === 'kg') servings = qty * 10;
  const per = { proteina: { kcal: 160, proteinG: 22 }, granos: { kcal: 120, proteinG: 5 } };
  const base = per[item.category] || { kcal: 90, proteinG: 2 };
  const mul = Math.min(40, servings);
  return {
    servingsPerPack: mul,
    kcal: Math.round(base.kcal * mul),
    proteinG: Math.round(base.proteinG * mul * 10) / 10,
    source: 'estimate',
  };
}

function itemTotals(item) {
  const labeled = normalizeNutrition(item.nutrition);
  if (labeled) {
    const servings = Math.max(1, Number(labeled.servingsPerPack) || 1);
    return {
      estimated: false,
      facts: {
        kcal: (labeled.kcal || 0) * servings,
        proteinG: (labeled.proteinG || 0) * servings,
      },
    };
  }
  return { estimated: true, facts: estimateNutritionForItem(item) };
}

function aggregateNutrition(items) {
  const out = { kcal: 0, proteinG: 0, labeledItems: 0, estimatedItems: 0 };
  for (const it of items) {
    const { facts, estimated } = itemTotals(it);
    if (estimated) out.estimatedItems += 1;
    else out.labeledItems += 1;
    out.kcal += Number(facts.kcal) || 0;
    out.proteinG += Number(facts.proteinG) || 0;
  }
  out.kcal = Math.round(out.kcal);
  return out;
}

const label = normalizeNutrition({
  servingsPerPack: 10,
  kcal: 150,
  proteinG: 5,
});
assert.equal(label.kcal, 150);

const tot = aggregateNutrition([
  { name: 'Avena', qty: 1, unit: 'und', category: 'granos', nutrition: label },
  { name: 'Pollo', qty: 1, unit: 'kg', category: 'proteina' },
]);
assert.equal(tot.kcal, 150 * 10 + 160 * 10);
assert.equal(tot.labeledItems, 1);
assert.equal(tot.estimatedItems, 1);

console.log('nutrition.check ok');
