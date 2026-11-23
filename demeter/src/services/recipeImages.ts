import type { RecipeIdea } from '../domain/recipes';
import { recipeImageQuery } from '../domain/recipes';

/**
 * Busca una imagen libre (TheMealDB) por ingrediente/título.
 * Si falla red/API → null (la UI usa emoji).
 */
export async function fetchRecipeImageUrl(recipe: RecipeIdea): Promise<string | null> {
  const q = recipeImageQuery(recipe);
  if (!q) return null;
  try {
    const url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`;
    const res = await Promise.race([
      fetch(url),
      new Promise<Response>((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
    ]);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      meals?: Array<{ strMealThumb?: string }> | null;
    };
    const thumb = data.meals?.[0]?.strMealThumb;
    return thumb && /^https?:\/\//i.test(thumb) ? thumb : null;
  } catch {
    return null;
  }
}

/** Enriquece hasta N recetas en paralelo (sin tumbar la UI si falla). */
export async function attachRecipeImages(
  recipes: RecipeIdea[],
  limit = 3,
): Promise<RecipeIdea[]> {
  const slice = recipes.slice(0, limit);
  const rest = recipes.slice(limit);
  const enriched = await Promise.all(
    slice.map(async (r) => {
      if (r.imageUrl) return r;
      const imageUrl = await fetchRecipeImageUrl(r);
      return { ...r, imageUrl };
    }),
  );
  return [...enriched, ...rest];
}
