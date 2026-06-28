import type { Category } from './types';

export const FREQUENT_EMOJIS = [
  '🍽️', '☕', '🚌', '🛒', '🏥', '📚', '🎬', '💡',
  '🏠', '👕', '📈', '💰', '📝', '🏷️', '🎁', '✈️',
  '💊', '🐾', '🎮', '💳', '🍔', '🥗', '🍺', '💼',
];

export const KIND_LABELS: Record<string, string> = {
  expense: 'Gasto',
  investment: 'Inversión',
  note: 'Nota',
  general: 'General',
};

const EMOJI_KEYWORDS: [string, string][] = [
  ['comida', '🍽️'], ['food', '🍽️'], ['restaurant', '🍽️'],
  ['café', '☕'], ['cafe', '☕'], ['coffee', '☕'],
  ['transporte', '🚌'], ['bus', '🚌'], ['uber', '🚌'], ['taxi', '🚌'],
  ['mercado', '🛒'], ['super', '🛒'], ['grocery', '🛒'],
  ['salud', '🏥'], ['medico', '🏥'], ['doctor', '🏥'],
  ['educacion', '📚'], ['education', '📚'], ['libro', '📚'],
  ['entretenimiento', '🎬'], ['cine', '🎬'], ['netflix', '🎬'],
  ['servicio', '💡'], ['luz', '💡'], ['agua', '💡'], ['internet', '💡'],
  ['casa', '🏠'], ['renta', '🏠'], ['arriendo', '🏠'],
  ['ropa', '👕'], ['clothes', '👕'],
  ['inversion', '📈'], ['invest', '📈'], ['etf', '📈'], ['accion', '📈'],
  ['nota', '📝'], ['note', '📝'], ['idea', '📝'],
  ['regalo', '🎁'], ['gift', '🎁'],
  ['viaje', '✈️'], ['travel', '✈️'], ['vuelo', '✈️'],
  ['farmacia', '💊'], ['medicina', '💊'],
  ['mascota', '🐾'], ['pet', '🐾'],
  ['juego', '🎮'], ['game', '🎮'],
  ['tarjeta', '💳'], ['card', '💳'],
  ['hamburguesa', '🍔'], ['burger', '🍔'],
  ['cerveza', '🍺'], ['beer', '🍺'],
  ['trabajo', '💼'], ['work', '💼'],
];

export function guessEmoji(name: string): string {
  if (!name) return '🏷️';
  const lower = name.toLowerCase();
  for (const [keyword, emoji] of EMOJI_KEYWORDS) {
    if (lower.includes(keyword)) return emoji;
  }
  return '🏷️';
}

export function findCategoryByName(
  categories: Category[],
  name: string,
  kind?: string,
): Category | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  return (
    categories.find(
      (c) =>
        c.name.toLowerCase() === lower &&
        (!kind || c.kind === kind || c.kind === 'general'),
    ) ?? null
  );
}

export function categoriesForKind(categories: Category[], kind: string): Category[] {
  return categories.filter((c) => c.kind === kind || c.kind === 'general');
}

export interface CategorySelection {
  id?: string;
  name: string;
  emoji: string;
  isNew?: boolean;
}
