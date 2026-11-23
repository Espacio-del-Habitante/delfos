import {
  parseRecipesJson,
  recipesAiPrompt,
  recipesFromCart,
  type RecipeIdea,
} from '../domain/recipes';
import { normalizeShopProfile, type ShopProfileId } from '../domain/shopProfiles';
import { friendlyError, friendlyNotice } from '../shared/appError';
import { aiReady, completeJson } from './aiComplete';
import { attachRecipeImages } from './recipeImages';
import { getAiSettings, getActiveTrip, getState } from './store';

export type { RecipeIdea };

export type ProposeRecipesResult = {
  recipes: RecipeIdea[];
  source: 'ai' | 'local';
  /** Aviso de app (toast), nunca stack técnico. */
  notice?: string;
  noticeTone?: 'info' | 'warn' | 'error';
};

/** Bajo demanda: IA si está lista; si no, heurística local + imágenes opcionales. */
export async function proposeRecipes(opts?: {
  profile?: ShopProfileId | string;
}): Promise<ProposeRecipesResult> {
  const trip = getActiveTrip();
  const items = trip?.items || [];
  const profile = normalizeShopProfile(
    opts?.profile ?? getState().settings.shopProfile,
  );

  if (!items.length) {
    return {
      recipes: [],
      source: 'local',
      notice: friendlyNotice('empty-cart'),
      noticeTone: 'warn',
    };
  }

  const local = recipesFromCart(items, profile, 3);
  const ai = getAiSettings();

  let recipes = local;
  let source: 'ai' | 'local' = 'local';
  let notice: string | undefined;
  let noticeTone: ProposeRecipesResult['noticeTone'];

  if (aiReady(ai)) {
    try {
      const raw = await completeJson(ai, recipesAiPrompt(items, profile));
      const parsed = parseRecipesJson(raw);
      if (parsed.length) {
        recipes = parsed;
        source = 'ai';
      } else {
        notice = 'La IA se enredó · te dejamos ideas caseras del carrito';
        noticeTone = 'warn';
      }
    } catch (e) {
      notice = friendlyError(e, friendlyNotice('ai-fallback'));
      // Si friendlyError devolvió mensaje genérico de red, preferir el notice de fallback
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

  return { recipes, source, notice, noticeTone };
}
