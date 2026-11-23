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
    blurb: 'Modo saludable: proteína, fibra y cero drama en la cocina.',
  },
  {
    id: 'divertido',
    label: 'Divertido',
    chip: '🎉 Divertido',
    blurb: 'Modo antojo: chucherías, peli y permiso de picar rico.',
  },
  {
    id: 'excentrico',
    label: 'Excéntrico',
    chip: '🧪 Excéntrico',
    blurb: 'Modo chef curioso: ingredientes raritos y giros con punch.',
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
    { name: 'pechuga de pollo', qty: 1, unit: 'kg', category: 'proteina', why: 'Proteína fácil, cero drama' },
    { name: 'huevos', qty: 1, unit: 'paq', category: 'proteina', why: 'Salvan cualquier cena' },
    { name: 'avena', qty: 1, unit: 'und', category: 'granos', why: 'Energía que dura' },
    { name: 'yogur griego', qty: 1, unit: 'und', category: 'lacteos', why: 'Snack con músculo' },
    { name: 'espinaca', qty: 1, unit: 'paq', category: 'verduras', why: 'Verde listo pa’ saltear' },
    { name: 'plátano', qty: 6, unit: 'und', category: 'frutas', why: 'Post-gym amigable' },
  ],
  divertido: [
    { name: 'papas de paquete', qty: 1, unit: 'und', category: 'otros', why: 'Crujiente sin pensarlo' },
    { name: 'gaseosa', qty: 1, unit: 'und', category: 'bebidas', why: 'Plan peli activado' },
    { name: 'chocolate', qty: 1, unit: 'und', category: 'otros', why: 'El antojo clásico' },
    { name: 'helado', qty: 1, unit: 'und', category: 'lacteos', why: 'Postre en 2 minutos' },
    { name: 'nachos', qty: 1, unit: 'und', category: 'otros', why: 'Pa’ compartir y reír' },
    { name: 'gomitas', qty: 1, unit: 'und', category: 'otros', why: 'Chuchería de bolsillo' },
  ],
  excentrico: [
    { name: 'pasta miso', qty: 1, unit: 'und', category: 'otros', why: 'Umami al instante' },
    { name: 'tahini', qty: 1, unit: 'und', category: 'otros', why: 'Hummus con estilo' },
    { name: 'kimchi', qty: 1, unit: 'und', category: 'verduras', why: 'Fermento con carácter' },
    { name: 'alga nori', qty: 1, unit: 'paq', category: 'otros', why: 'Rollitos caseros' },
    { name: 'sumac', qty: 1, unit: 'und', category: 'otros', why: 'Ácido floral wow' },
    { name: 'leche de coco', qty: 1, unit: 'und', category: 'otros', why: 'Curry o postre' },
  ],
};
