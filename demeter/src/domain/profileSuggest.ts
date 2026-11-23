import {
  PROFILE_BUY_HINTS,
  normalizeShopProfile,
  type ShopProfileId,
} from './shopProfiles';

export type ProfileSuggestion = {
  name: string;
  qty: number;
  unit: string;
  category: string;
  why: string;
  amount: number | null;
};

type CartLike = { name: string }[];
type ProductLike = {
  name: string;
  priceHistory?: Array<{ amount?: number | null; qty?: number; unit?: string }>;
};

function keyOf(name: string) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

/**
 * Sugerencias “deberías comprar” según perfil.
 * Omite lo que ya está en el carrito (por nombre).
 */
export function profileBuySuggestions(
  profile: ShopProfileId | string,
  cart: CartLike,
  products: Record<string, ProductLike> = {},
  limit = 4,
): ProfileSuggestion[] {
  const id = normalizeShopProfile(profile);
  const inCart = new Set(cart.map((c) => keyOf(c.name)).filter(Boolean));
  const out: ProfileSuggestion[] = [];

  for (const hint of PROFILE_BUY_HINTS[id]) {
    const key = keyOf(hint.name);
    if (!key || inCart.has(key)) continue;
    const hist = products[key]?.priceHistory || [];
    const last = [...hist].reverse().find((h) => h.amount != null) || hist.at(-1);
    out.push({
      name: hint.name,
      qty: hint.qty,
      unit: hint.unit,
      category: hint.category,
      why: hint.why,
      amount: last?.amount != null ? Number(last.amount) : null,
    });
    if (out.length >= limit) break;
  }
  return out;
}
