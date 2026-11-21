export const UNITS = [
  { id: 'lb', label: 'libra (lb)' },
  { id: 'kg', label: 'kilo (kg)' },
  { id: 'g', label: 'gramo (g)' },
  { id: 'und', label: 'unidad' },
  { id: 'paq', label: 'paquete' },
  { id: 'lata', label: 'lata' },
  { id: 'bolsa', label: 'bolsa' },
] as const;

export type UnitId = (typeof UNITS)[number]['id'];

/** Convierte cantidad entre unidades de masa conocidas. null si no aplica. */
export function convertQty(qty: number, from: string, to: string) {
  const q = Number(qty);
  if (!Number.isFinite(q)) return null;
  const toKg: Record<string, number> = { kg: 1, lb: 0.453592, g: 0.001 };
  if (!(from in toKg) || !(to in toKg)) return null;
  if (from === to) return q;
  const kg = q * toKg[from];
  return Math.round((kg / toKg[to]) * 1000) / 1000;
}
