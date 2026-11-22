/** Perfiles de compra: guían recomendaciones y tono de recetas. */

export type ShopProfileId = 'fitness' | 'divertido' | 'excentrico';

export type ShopProfile = {
  id: ShopProfileId;
  label: string;
  blurb: string;
  /** Hint corto en home / chips. */
  chip: string;
};

export const SHOP_PROFILES: ShopProfile[] = [
  {
    id: 'fitness',
    label: 'Fitness',
    chip: '💪 Fitness',
    blurb: 'Prioriza proteína, fibra y basicos limpios.',
  },
  {
    id: 'divertido',
    label: 'Divertido',
    chip: '🎉 Divertido',
    blurb: 'Permite antojos, chucherías y planes de picar.',
  },
  {
    id: 'excentrico',
    label: 'Excéntrico',
    chip: '🧪 Excéntrico',
    blurb: 'Ingredientes menos comunes y giros de cocina.',
  },
];

export const DEFAULT_SHOP_PROFILE: ShopProfileId = 'fitness';

export function normalizeShopProfile(raw: unknown): ShopProfileId {
  const id = String(raw || '').trim();
  if (id === 'fitness' || id === 'divertido' || id === 'excentrico') return id;
  return DEFAULT_SHOP_PROFILE;
}

export function shopProfileMeta(id: ShopProfileId | string | null | undefined): ShopProfile {
  const n = normalizeShopProfile(id);
  return SHOP_PROFILES.find((p) => p.id === n) || SHOP_PROFILES[0];
}

/** Catálogo heurístico de “deberías comprar” por perfil (sin IA). */
export const PROFILE_BUY_HINTS: Record<
  ShopProfileId,
  Array<{ name: string; qty: number; unit: string; category: string; why: string }>
> = {
  fitness: [
    { name: 'pechuga de pollo', qty: 1, unit: 'kg', category: 'proteina', why: 'Proteína magra fácil' },
    { name: 'huevos', qty: 1, unit: 'paq', category: 'proteina', why: 'Desayuno / cena rápida' },
    { name: 'avena', qty: 1, unit: 'und', category: 'granos', why: 'Fibra y energía estable' },
    { name: 'yogur griego', qty: 1, unit: 'und', category: 'lacteos', why: 'Snack alto en proteína' },
    { name: 'espinaca', qty: 1, unit: 'paq', category: 'verduras', why: 'Verdura lista para saltear' },
    { name: 'plátano', qty: 6, unit: 'und', category: 'frutas', why: 'Post-entreno barato' },
  ],
  divertido: [
    { name: 'papas de paquete', qty: 1, unit: 'und', category: 'otros', why: 'Picar sin pensar' },
    { name: 'gaseosa', qty: 1, unit: 'und', category: 'bebidas', why: 'Plan de película' },
    { name: 'chocolate', qty: 1, unit: 'und', category: 'otros', why: 'Antojo clásico' },
    { name: 'helado', qty: 1, unit: 'und', category: 'lacteos', why: 'Postre express' },
    { name: 'nachos', qty: 1, unit: 'und', category: 'otros', why: 'Con salsa y amigos' },
    { name: 'gomitas', qty: 1, unit: 'und', category: 'otros', why: 'Chuchería de bolsillo' },
  ],
  excentrico: [
    { name: 'pasta miso', qty: 1, unit: 'und', category: 'otros', why: 'Umami para sopas' },
    { name: 'tahini', qty: 1, unit: 'und', category: 'otros', why: 'Aderezos y hummus' },
    { name: 'kimchi', qty: 1, unit: 'und', category: 'verduras', why: 'Fermento con punch' },
    { name: 'alga nori', qty: 1, unit: 'paq', category: 'otros', why: 'Rollos y snacks' },
    { name: 'sumac', qty: 1, unit: 'und', category: 'otros', why: 'Ácido floral en ensaladas' },
    { name: 'leche de coco', qty: 1, unit: 'und', category: 'otros', why: 'Curries y postres' },
  ],
};
