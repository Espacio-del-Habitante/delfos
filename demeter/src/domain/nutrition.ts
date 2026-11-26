/** Tabla nutricional por porción (etiqueta) + agregados del carrito. */

export type NutritionFacts = {
  servingSize?: string;
  servingsPerPack?: number | null;
  /** kcal por porción */
  kcal?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  fiberG?: number | null;
  sugarG?: number | null;
  sodiumMg?: number | null;
  source?: 'label-photo' | 'manual' | 'estimate';
};

export type NutritionTotals = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  labeledItems: number;
  estimatedItems: number;
};

type ItemLike = {
  name?: string;
  qty?: number;
  unit?: string;
  category?: string;
  nutrition?: NutritionFacts | null;
};

function n(v: unknown): number | null {
  if (v == null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

export function normalizeNutrition(raw: unknown): NutritionFacts | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const out: NutritionFacts = {
    servingSize: row.servingSize != null ? String(row.servingSize).trim() : undefined,
    servingsPerPack: n(row.servingsPerPack),
    kcal: n(row.kcal),
    proteinG: n(row.proteinG),
    carbsG: n(row.carbsG),
    fatG: n(row.fatG),
    fiberG: n(row.fiberG),
    sugarG: n(row.sugarG),
    sodiumMg: n(row.sodiumMg),
    source:
      row.source === 'label-photo' || row.source === 'manual' || row.source === 'estimate'
        ? row.source
        : undefined,
  };
  const has =
    out.kcal != null ||
    out.proteinG != null ||
    out.carbsG != null ||
    out.fatG != null ||
    out.fiberG != null;
  return has ? out : null;
}

export function parseNutritionJson(raw: string): NutritionFacts | null {
  try {
    return normalizeNutrition(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Prompt visión: OCR de tabla nutricional → JSON. */
export function nutritionLabelPrompt() {
  return `Lee la tabla nutricional de la foto (producto Colombia / Latam).
Responde SOLO JSON con valores numéricos por PORCIÓN (como en la etiqueta):
{"servingSize":"30g","servingsPerPack":10,"kcal":150,"proteinG":5,"carbsG":20,"fatG":6,"fiberG":2,"sugarG":3,"sodiumMg":120,"source":"label-photo"}
Si un campo no aparece, usa null. No inventes números.`;
}

/**
 * Estimación gruesa por categoría cuando no hay etiqueta.
 * ponytail: techo = heurística fija por categoría; upgrade = etiqueta OCR o DB nutricional.
 */
export function estimateNutritionForItem(item: ItemLike): NutritionFacts | null {
  const qty = Math.max(0.1, Number(item.qty) || 1);
  const unit = String(item.unit || 'und').toLowerCase();
  const cat = String(item.category || 'otros');
  // Factor: kg≈10 porciones, lt≈4, und/paq≈1
  let servings = qty;
  if (unit === 'kg' || unit === 'g') servings = unit === 'g' ? qty / 100 : qty * 10;
  else if (unit === 'lt' || unit === 'ml') servings = unit === 'ml' ? qty / 250 : qty * 4;

  const per: Record<string, Partial<NutritionFacts>> = {
    proteina: { kcal: 160, proteinG: 22, carbsG: 0, fatG: 8 },
    lacteos: { kcal: 120, proteinG: 8, carbsG: 10, fatG: 5 },
    harinas: { kcal: 110, proteinG: 3, carbsG: 22, fatG: 1, fiberG: 1 },
    granos: { kcal: 120, proteinG: 5, carbsG: 22, fatG: 1, fiberG: 3 },
    frutas: { kcal: 60, proteinG: 1, carbsG: 15, fatG: 0, fiberG: 2, sugarG: 12 },
    verduras: { kcal: 35, proteinG: 2, carbsG: 7, fatG: 0, fiberG: 2 },
    bebidas: { kcal: 80, proteinG: 0, carbsG: 20, fatG: 0, sugarG: 18 },
    panaderia: { kcal: 130, proteinG: 4, carbsG: 24, fatG: 2 },
    otros: { kcal: 90, proteinG: 2, carbsG: 12, fatG: 3 },
  };
  const base = per[cat] || per.otros;
  const mul = Math.min(40, servings);
  return {
    servingSize: 'estimada',
    servingsPerPack: Math.round(mul * 10) / 10,
    kcal: base.kcal != null ? Math.round(base.kcal * mul) : null,
    proteinG: base.proteinG != null ? Math.round(base.proteinG * mul * 10) / 10 : null,
    carbsG: base.carbsG != null ? Math.round(base.carbsG * mul * 10) / 10 : null,
    fatG: base.fatG != null ? Math.round(base.fatG * mul * 10) / 10 : null,
    fiberG: base.fiberG != null ? Math.round(base.fiberG * mul * 10) / 10 : null,
    sugarG: base.sugarG != null ? Math.round(base.sugarG * mul * 10) / 10 : null,
    source: 'estimate',
  };
}

function itemTotals(item: ItemLike): { facts: NutritionFacts; estimated: boolean } {
  const labeled = normalizeNutrition(item.nutrition);
  if (labeled) {
    const servings = Math.max(1, Number(labeled.servingsPerPack) || 1);
    const scale = (v: number | null | undefined) =>
      v == null ? 0 : v * servings;
    return {
      estimated: false,
      facts: {
        ...labeled,
        kcal: scale(labeled.kcal),
        proteinG: scale(labeled.proteinG),
        carbsG: scale(labeled.carbsG),
        fatG: scale(labeled.fatG),
        fiberG: scale(labeled.fiberG),
        sugarG: scale(labeled.sugarG),
        source: labeled.source || 'label-photo',
      },
    };
  }
  return { estimated: true, facts: estimateNutritionForItem(item) || {} };
}

export function aggregateNutrition(items: ItemLike[]): NutritionTotals {
  const out: NutritionTotals = {
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    sugarG: 0,
    labeledItems: 0,
    estimatedItems: 0,
  };
  for (const it of items) {
    const { facts, estimated } = itemTotals(it);
    if (estimated) out.estimatedItems += 1;
    else out.labeledItems += 1;
    out.kcal += Number(facts.kcal) || 0;
    out.proteinG += Number(facts.proteinG) || 0;
    out.carbsG += Number(facts.carbsG) || 0;
    out.fatG += Number(facts.fatG) || 0;
    out.fiberG += Number(facts.fiberG) || 0;
    out.sugarG += Number(facts.sugarG) || 0;
  }
  out.kcal = Math.round(out.kcal);
  out.proteinG = Math.round(out.proteinG * 10) / 10;
  out.carbsG = Math.round(out.carbsG * 10) / 10;
  out.fatG = Math.round(out.fatG * 10) / 10;
  out.fiberG = Math.round(out.fiberG * 10) / 10;
  out.sugarG = Math.round(out.sugarG * 10) / 10;
  return out;
}

/** Texto para compartir: macros del mercado, no plata. */
export function nutritionShareLines(totals: NutritionTotals): string[] {
  if (!totals.kcal && !totals.proteinG && !totals.carbsG) {
    return ['Aún sin datos nutricionales · súmale foto a las etiquetas.'];
  }
  const lines = [
    `≈ ${totals.kcal} kcal en el mercado`,
    `Proteína ≈ ${totals.proteinG} g`,
    `Carbohidratos ≈ ${totals.carbsG} g`,
    `Grasas ≈ ${totals.fatG} g`,
  ];
  if (totals.fiberG > 0) lines.push(`Fibra ≈ ${totals.fiberG} g`);
  if (totals.labeledItems) {
    lines.push(`${totals.labeledItems} con etiqueta · ${totals.estimatedItems} estimados`);
  } else {
    lines.push('Estimado por categoría (sin etiquetas aún)');
  }
  return lines;
}

/** kcal aprox. de una receta a partir de usos + carrito. */
export function estimateRecipeKcal(
  uses: string[],
  cart: ItemLike[],
  fallback = 420,
): number {
  if (!uses.length || !cart.length) return fallback;
  const keys = uses.map((u) =>
    String(u || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, ''),
  );
  let sum = 0;
  let hits = 0;
  for (const it of cart) {
    const nk = String(it.name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    if (!keys.some((k) => nk.includes(k) || k.includes(nk))) continue;
    const { facts } = itemTotals(it);
    // Una porción de lo usado en la receta ≈ 1 serving del pack estimado / 2
    const pack = Math.max(1, Number(facts.servingsPerPack) || 1);
    const piece = (Number(facts.kcal) || 0) / pack;
    sum += piece;
    hits += 1;
  }
  if (!hits) return fallback;
  return Math.max(80, Math.round(sum));
}
