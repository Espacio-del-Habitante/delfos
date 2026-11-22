import {
  parseRecipesJson,
  recipesAiPrompt,
  recipesFromCart,
  type RecipeIdea,
} from '../domain/recipes';
import { normalizeShopProfile, type ShopProfileId } from '../domain/shopProfiles';
import { aiReady, completeJson } from './aiComplete';
import { getAiSettings, getActiveTrip, getState } from './store';

export type { RecipeIdea };

/** Bajo demanda: IA si está lista; si no, heurística local. */
export async function proposeRecipes(opts?: {
  profile?: ShopProfileId | string;
}): Promise<{ recipes: RecipeIdea[]; source: 'ai' | 'local'; error?: string }> {
  const trip = getActiveTrip();
  const items = trip?.items || [];
  const profile = normalizeShopProfile(
    opts?.profile ?? getState().settings.shopProfile,
  );

  if (!items.length) {
    return { recipes: [], source: 'local', error: 'Suma algo al carrito para proponer recetas' };
  }

  const local = recipesFromCart(items, profile, 3);
  const ai = getAiSettings();
  if (!aiReady(ai)) {
    return { recipes: local, source: 'local' };
  }

  try {
    const raw = await completeJson(ai, recipesAiPrompt(items, profile));
    const parsed = parseRecipesJson(raw);
    if (parsed.length) return { recipes: parsed, source: 'ai' };
    return { recipes: local, source: 'local', error: 'IA sin recetas útiles · usé ideas locales' };
  } catch (e: any) {
    return {
      recipes: local,
      source: 'local',
      error: e?.message || 'IA falló · usé ideas locales',
    };
  }
}
