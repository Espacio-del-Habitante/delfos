import { normalizeShopProfile, type ShopProfileId } from './shopProfiles';

export type RecipeIdea = {
  title: string;
  minutes: number;
  uses: string[];
  missing: string[];
  steps: string[];
  vibe: string;
  emoji: string;
  description: string;
  /** URL opcional (TheMealDB u otra); la UI cae al emoji. */
  imageUrl?: string | null;
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
  emoji: string;
  description: string;
  imageQuery: string;
}> = [
  {
    title: 'Bowl de pollo y verduras',
    minutes: 25,
    needAny: ['pollo', 'pechuga', 'espinaca', 'brocoli', 'brocóli'],
    steps: [
      'Lava y corta la verdura en trozos parejos para que cocine pareja.',
      'Calienta una sartén con un chorrito de aceite a fuego medio-alto.',
      'Saltea la pechuga o pollo en trozos 6–8 min hasta dorar; sala al gusto.',
      'Baja el fuego, agrega la verdura y cocina 3–4 min (que quede crujiente).',
      'Apaga, exprime limón o un toque de pimienta y sirve en bowl caliente.',
    ],
    profiles: ['fitness'],
    vibe: 'Alto en proteína',
    emoji: '🥗',
    description:
      'Un plato completo y ligero: proteína magra con verdura rápida. Ideal post-entreno o almuerzo de semana.',
    imageQuery: 'chicken',
  },
  {
    title: 'Avena overnight',
    minutes: 5,
    needAny: ['avena', 'yogur', 'platano', 'plátano', 'banano'],
    steps: [
      'En un frasco mezcla 1/2 taza de avena con yogur hasta cubrir.',
      'Agrega un chorrito de leche o agua si queda muy espeso.',
      'Corta el plátano y mézclalo (o déjalo arriba para el día siguiente).',
      'Tapa y deja en nevera al menos 4 horas (mejor toda la noche).',
      'Al servir, remueve y endulza solo si hace falta.',
    ],
    profiles: ['fitness'],
    vibe: 'Desayuno fácil',
    emoji: '🥣',
    description:
      'Desayuno frío que se arma la noche anterior. Fibra + proteína sin cocinar en la mañana.',
    imageQuery: 'oatmeal',
  },
  {
    title: 'Noche de nachos',
    minutes: 15,
    needAny: ['nachos', 'queso', 'gaseosa', 'papas'],
    steps: [
      'Precalienta el horno o air fryer a 180 °C.',
      'Extiende nachos o papas en una bandeja en una sola capa.',
      'Ralla o desmenuza queso encima; no satures o no crujen.',
      'Hornea 6–8 min hasta que el queso burbujee.',
      'Sirve al centro con algo frío (gaseosa o agua) y comparte de una.',
    ],
    profiles: ['divertido'],
    vibe: 'Plan peli',
    emoji: '🧀',
    description: 'Picada express para película o visita improvisada. Crocante, queso y cero drama.',
    imageQuery: 'nachos',
  },
  {
    title: 'Bandeja de antojos',
    minutes: 10,
    needAny: ['chocolate', 'gomitas', 'helado', 'papas'],
    steps: [
      'Elige un plato o bandeja ancha y limpia.',
      'Abre las bolsas y arma “islas”: dulce a un lado, salado al otro.',
      'Si hay helado, sácalo 3 min antes para que esté cremoso.',
      'Parte el chocolate en trozos chicos para que alcance.',
      'Sirve con cucharitas o palillos y listo — sin receta estricta.',
    ],
    profiles: ['divertido'],
    vibe: 'Chucherías con estilo',
    emoji: '🍿',
    description: 'No es cocina gourmet: es permiso de picar bonito. Perfecta para el perfil Divertido.',
    imageQuery: 'dessert',
  },
  {
    title: 'Sopa miso express',
    minutes: 12,
    needAny: ['miso', 'alga', 'nori', 'tofu'],
    steps: [
      'Calienta agua (no la dejes hervir a borbotones al final).',
      'En un bowl disuelve 1–2 cucharadas de miso con un poco del agua caliente.',
      'Vierte el resto del agua y mezcla hasta homogéneo.',
      'Agrega alga nori en tiras o tofu en cubos; espera 1 minuto.',
      'Sirve ya: el miso pierde aroma si hierve fuerte.',
    ],
    profiles: ['excentrico'],
    vibe: 'Umami rápido',
    emoji: '🍜',
    description: 'Caldo japonés en minutos. Umami limpio: ideal cuando quieres algo distinto al caldo de sobre.',
    imageQuery: 'miso',
  },
  {
    title: 'Hummus con twist',
    minutes: 15,
    needAny: ['tahini', 'garbanzo', 'sumac', 'limón'],
    steps: [
      'Escurre garbanzos (reserva un chorrito del líquido).',
      'Licúa garbanzo + tahini + jugo de limón hasta crema.',
      'Ajusta sal y líquido hasta que quede untuoso.',
      'Sirve en plato, haz un surco con la cuchara.',
      'Polvorea sumac (o pimentón) y un hilo de aceite; acompaña con pan o verdura.',
    ],
    profiles: ['excentrico'],
    vibe: 'Snack poco común',
    emoji: '🫙',
    description: 'Dip cremoso con ácido y un toque floral del sumac. Para picar distinto al queso crema.',
    imageQuery: 'hummus',
  },
  {
    title: 'Salteado libre',
    minutes: 20,
    needAny: ['arroz', 'cebolla', 'ajo', 'carne', 'pollo', 'verdura'],
    steps: [
      'Si usas arroz, cocínalo primero o aprovecha arroz del día anterior.',
      'Pica cebolla y ajo; sofríe 2 min en sartén caliente.',
      'Agrega la proteína en trozos y cocina hasta que pierda el color crudo.',
      'Suma verdura al final para que no se pase.',
      'Mezcla con el arroz o sirve al lado; ajusta sal y un toque ácido.',
    ],
    profiles: ['fitness', 'divertido', 'excentrico'],
    vibe: 'Usa lo del carrito',
    emoji: '🍳',
    description: 'La receta comodín: aromáticos + proteína + lo que haya. Sirve para vaciar la bolsa del mercado.',
    imageQuery: 'stir fry',
  },
];

function emojiForTitle(title: string): string {
  const t = keyOf(title);
  if (t.includes('pollo') || t.includes('bowl')) return '🥗';
  if (t.includes('avena')) return '🥣';
  if (t.includes('nacho') || t.includes('queso')) return '🧀';
  if (t.includes('antojo') || t.includes('chocolate')) return '🍿';
  if (t.includes('miso') || t.includes('sopa')) return '🍜';
  if (t.includes('hummus')) return '🫙';
  if (t.includes('ensalada')) return '🥬';
  if (t.includes('pasta') || t.includes('arroz')) return '🍝';
  return '🍽️';
}

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
      emoji: t.emoji,
      description: t.description,
      imageUrl: null,
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
        'Saca todo a la mesa y separa fresco vs seco.',
        'Corta verdura y proteína en trozos manejables.',
        'Sofríe aromáticos (cebolla/ajo) si los tienes.',
        'Cocina la proteína primero; agrega verdura al final.',
        'Prueba sal/ácido y sirve con lo que sobre del carrito.',
      ],
      vibe: shopProfileBlurb(id),
      emoji: '🧺',
      description: 'Improvisa con lo comprado hoy. Sin lista fija: el carrito manda.',
      imageUrl: null,
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
Cada receta necesita descripción corta (1-2 frases) y 5 pasos detallados de preparación.
Responde SOLO JSON:
{"recipes":[{"title":"","minutes":20,"uses":["ing"],"missing":["opcional"],"description":"","emoji":"🍽️","steps":["paso1","paso2","paso3","paso4","paso5"],"vibe":"corto"}]}`;
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
        const emoji = String(row.emoji || '').trim() || emojiForTitle(title);
        const idea: RecipeIdea = {
          title,
          minutes: Math.max(1, Number(row.minutes) || 20),
          uses: Array.isArray(row.uses) ? row.uses.map(String).filter(Boolean) : [],
          missing: Array.isArray(row.missing) ? row.missing.map(String).filter(Boolean) : [],
          steps: Array.isArray(row.steps)
            ? row.steps.map(String).filter(Boolean).slice(0, 10)
            : [],
          vibe: String(row.vibe || '').trim() || 'Idea de mercado',
          emoji,
          description:
            String(row.description || '').trim() ||
            `Receta con lo del carrito · ${title}`,
          imageUrl: undefined,
        };
        return idea;
      })
      .filter((x): x is RecipeIdea => Boolean(x))
      .slice(0, 5);
  } catch {
    return [];
  }
}

export function recipeImageQuery(recipe: RecipeIdea): string {
  const base = recipe.uses[0] || recipe.title.split(/\s+/)[0] || 'food';
  return keyOf(base).slice(0, 40) || 'food';
}
