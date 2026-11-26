import {
  parseRecipesJson,
  recipesAiPrompt,
  recipesFromCart,
  type RecipeIdea,
} from '../domain/recipes';
import { estimateRecipeKcal } from '../domain/nutrition';
import { normalizeShopProfile, type ShopProfileId } from '../domain/shopProfiles';
import { friendlyError, friendlyNotice } from '../shared/appError';
import { aiReady, completeJson } from './aiComplete';
import { attachRecipeImages } from './recipeImages';
import {
  getAiSettings,
  getActiveTrip,
  getState,
  getTripById,
  setTripRecipes,
} from './store';

export type { RecipeIdea };

export type ProposeRecipesResult = {
  recipes: RecipeIdea[];
  source: 'ai' | 'local';
  tripId: string | null;
  /** Aviso de app (toast), nunca stack técnico. */
  notice?: string;
  noticeTone?: 'info' | 'warn' | 'error';
};

function withKcal(
  recipes: RecipeIdea[],
  items: Array<{ name: string; qty?: number; unit?: string; category?: string; nutrition?: unknown }>,
): RecipeIdea[] {
  return recipes.map((r) => {
    const kcal =
      r.kcalApprox != null && Number(r.kcalApprox) > 0
        ? Math.round(Number(r.kcalApprox))
        : estimateRecipeKcal(r.uses, items as never);
    return { ...r, kcalApprox: kcal };
  });
}

/** Bajo demanda: IA si está lista; si no, heurística local + imágenes opcionales.
 * Persiste en el trip (activo o `tripId`); si preguntas otra vez, reemplaza.
 */
export async function proposeRecipes(opts?: {
  profile?: ShopProfileId | string;
  /** Mercado a consultar (cerrado o abierto). Default: activo. */
  tripId?: string | null;
  /** Texto libre: “algo liviano”, “con pollo”, etc. */
  note?: string;
}): Promise<ProposeRecipesResult> {
  const trip = opts?.tripId ? getTripById(opts.tripId) : getActiveTrip();
  const items = trip?.items || [];
  const profile = normalizeShopProfile(
    opts?.profile ?? getState().settings.shopProfile,
  );
  const note = String(opts?.note || '').trim();

  if (!items.length) {
    return {
      recipes: [],
      source: 'local',
      tripId: trip?.id || null,
      notice: friendlyNotice('empty-cart'),
      noticeTone: 'warn',
    };
  }

  const local = withKcal(recipesFromCart(items, profile, 3), items);
  const ai = getAiSettings();

  let recipes = local;
  let source: 'ai' | 'local' = 'local';
  let notice: string | undefined;
  let noticeTone: ProposeRecipesResult['noticeTone'];

  if (aiReady(ai)) {
    try {
      const raw = await completeJson(ai, recipesAiPrompt(items, profile, note));
      const parsed = withKcal(parseRecipesJson(raw), items);
      if (parsed.length) {
        recipes = parsed;
        source = 'ai';
      } else {
        notice = 'La IA se enredó · te dejamos ideas caseras del carrito';
        noticeTone = 'warn';
      }
    } catch (e) {
      notice = friendlyError(e, friendlyNotice('ai-fallback'));
      if (/señal|demoró|servicio|conexión|tardó/i.test(notice)) {
        notice = friendlyNotice('ai-fallback');
      }
      noticeTone = 'warn';
    }
  }

  try {
    recipes = await attachRecipeImages(recipes, 3);
  } catch {
    // sin imagen no es error de app
  }

  if (trip?.id) {
    try {
      await setTripRecipes(trip.id, recipes, note || null);
    } catch {
      // UI igual muestra el resultado
    }
  }

  return { recipes, source, tripId: trip?.id || null, notice, noticeTone };
}
