import { normalizeShopProfile, type ShopProfileId } from './shopProfiles';

export type RecipeIdea = {
  title: string;
  minutes: number;
  uses: string[];
  missing: string[];
  steps: string[];
  vibe: string;
};

type ItemLike = { name: string };

function keyOf(name: string) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

const TEMPLATES: Array<{
  title: string;
  minutes: number;
  needAny: string[];
  steps: string[];
  profiles: ShopProfileId[];
  vibe: string;
}> = [
  {
    title: 'Bowl de pollo y verduras',
    minutes: 25,
    needAny: ['pollo', 'pechuga', 'espinaca', 'brocoli', 'brocóli'],
    steps: ['Saltea la proteína', 'Agrega verdura al final', 'Sirve con limón'],
    profiles: ['fitness'],
    vibe: 'Alto en proteína',
  },
  {
    title: 'Avena overnight',
    minutes: 5,
    needAny: ['avena', 'yogur', 'platano', 'plátano', 'banano'],
    steps: ['Mezcla avena + yogur', 'Agrega fruta', 'Deja en nevera'],
    profiles: ['fitness'],
    vibe: 'Desayuno fácil',
  },
  {
    title: 'Noche de nachos',
    minutes: 15,
    needAny: ['nachos', 'queso', 'gaseosa', 'papas'],
    steps: ['Hornea o calienta la base', 'Carga toppings', 'Acompaña con algo frío'],
    profiles: ['divertido'],
    vibe: 'Plan peli',
  },
  {
    title: 'Bandeja de antojos',
    minutes: 10,
    needAny: ['chocolate', 'gomitas', 'helado', 'papas'],
    steps: ['Arma un plato compartido', 'Porciones chicas', 'Disfruta sin culpas'],
    profiles: ['divertido'],
    vibe: 'Chucherías con estilo',
  },
  {
    title: 'Sopa miso express',
    minutes: 12,
    needAny: ['miso', 'alga', 'nori', 'tofu'],
    steps: ['Disuelve miso en agua caliente (no hirviendo)', 'Agrega alga/tofu', 'Sirve ya'],
    profiles: ['excentrico'],
    vibe: 'Umami rápido',
  },
  {
    title: 'Hummus con twist',
    minutes: 15,
    needAny: ['tahini', 'garbanzo', 'sumac', 'limón'],
    steps: ['Licúa tahini + garbanzo', 'Ajusta ácido', 'Polvo de sumac arriba'],
    profiles: ['excentrico'],
    vibe: 'Snack poco común',
  },
  {
    title: 'Salteado libre',
    minutes: 20,
    needAny: ['arroz', 'cebolla', 'ajo', 'carne', 'pollo', 'verdura'],
    steps: ['Sofríe aromáticos', 'Agrega proteína', 'Cierra con lo que tengas'],
    profiles: ['fitness', 'divertido', 'excentrico'],
    vibe: 'Usa lo del carrito',
  },
];

/** Recetas heurísticas offline a partir del carrito + perfil. */
export function recipesFromCart(
  items: ItemLike[],
  profile: ShopProfileId | string,
  limit = 3,
): RecipeIdea[] {
  const id = normalizeShopProfile(profile);
  const names = items.map((i) => i.name).filter(Boolean);
  const keys = names.map(keyOf);

  const scored = TEMPLATES.map((t) => {
    const hits = t.needAny.filter((n) => keys.some((k) => k.includes(keyOf(n))));
    const profileBoost = t.profiles.includes(id) ? 2 : 0;
    return { t, hits, score: hits.length * 3 + profileBoost };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const out: RecipeIdea[] = [];
  for (const { t, hits } of scored) {
    const uses = names.filter((n) =>
      t.needAny.some((need) => keyOf(n).includes(keyOf(need))),
    );
    const missing = t.needAny
      .filter((need) => !keys.some((k) => k.includes(keyOf(need))))
      .slice(0, 3);
    out.push({
      title: t.title,
      minutes: t.minutes,
      uses: uses.length ? uses : hits,
      missing,
      steps: t.steps,
      vibe: t.vibe,
    });
    if (out.length >= limit) break;
  }

  if (!out.length && names.length) {
    out.push({
      title: 'Lo que hay en la bolsa',
      minutes: 20,
      uses: names.slice(0, 6),
      missing: [],
      steps: [
        'Corta lo fresco',
        'Cocina lo proteico primero',
        'Termina con lo que quede del carrito',
      ],
      vibe: shopProfileBlurb(id),
    });
  }
  return out;
}

function shopProfileBlurb(id: ShopProfileId) {
  if (id === 'divertido') return 'Con lo que compraste, modo chill';
  if (id === 'excentrico') return 'Con un twist raro';
  return 'Balanceado y práctico';
}

/** Prompt para completeJson — la UI parsea { recipes: [...] }. */
export function recipesAiPrompt(items: ItemLike[], profile: ShopProfileId | string) {
  const id = normalizeShopProfile(profile);
  const list = items.map((i) => i.name).filter(Boolean).slice(0, 40);
  return `Eres chef de mercado en Colombia. Perfil de compra: ${id}.
Ingredientes del carrito: ${JSON.stringify(list)}.
Propón 3 recetas realistas con lo que hay (puedes sugerir 0-2 faltantes baratos).
Responde SOLO JSON:
{"recipes":[{"title":"","minutes":20,"uses":["ing"],"missing":["opcional"],"steps":["paso1","paso2","paso3"],"vibe":"corto"}]}`;
}

export function parseRecipesJson(raw: string): RecipeIdea[] {
  try {
    const data = JSON.parse(raw) as { recipes?: unknown };
    if (!Array.isArray(data.recipes)) return [];
    return data.recipes
      .map((r) => {
        if (!r || typeof r !== 'object') return null;
        const row = r as Record<string, unknown>;
        const title = String(row.title || '').trim();
        if (!title) return null;
        return {
          title,
          minutes: Math.max(1, Number(row.minutes) || 20),
          uses: Array.isArray(row.uses) ? row.uses.map(String).filter(Boolean) : [],
          missing: Array.isArray(row.missing) ? row.missing.map(String).filter(Boolean) : [],
          steps: Array.isArray(row.steps) ? row.steps.map(String).filter(Boolean).slice(0, 6) : [],
          vibe: String(row.vibe || '').trim() || 'Idea de mercado',
        } satisfies RecipeIdea;
      })
      .filter((x): x is RecipeIdea => Boolean(x))
      .slice(0, 5);
  } catch {
    return [];
  }
}
