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

const TO_KG: Record<string, number> = { kg: 1, lb: 0.453592, g: 0.001, gr: 0.001 };

/** Convierte cantidad entre unidades de masa conocidas. null si no aplica. */
export function convertQty(qty: number, from: string, to: string) {
  const q = Number(qty);
  if (!Number.isFinite(q)) return null;
  const a = from === 'gr' ? 'g' : from;
  const b = to === 'gr' ? 'g' : to;
  if (!(a in TO_KG) || !(b in TO_KG)) return null;
  if (a === b) return q;
  const kg = q * TO_KG[a];
  return Math.round((kg / TO_KG[b]) * 1000) / 1000;
}

/** Precio por unidad de masa (ej. COP/lb) a partir de total + qty + unidad. */
export function unitPriceAs(total: number, qty: number, unit: string, asUnit: string) {
  const t = Number(total);
  const q = Number(qty);
  if (!Number.isFinite(t) || !Number.isFinite(q) || t <= 0 || q <= 0) return null;
  const converted = convertQty(q, unit, asUnit);
  if (converted == null || converted <= 0) {
    // und/paq/etc: precio por pieza
    if (unit === asUnit) return Math.round(t / q);
    return null;
  }
  return Math.round(t / converted);
}

/** Detecta empaque en títulos tipo "Arroz 5000g" / "5 kg". */
export function inferPackFromText(text: string): { qty: number; unit: string } | null {
  const t = String(text || '');
  const m = t.match(/(?:x\s*)?(\d+(?:[.,]\d+)?)\s*(kg|kilos?|g|gr|gramos?|lb|libras?)\b/i);
  if (!m) return null;
  const qty = Number(String(m[1]).replace(',', '.'));
  if (!Number.isFinite(qty) || qty <= 0) return null;
  let unit = m[2].toLowerCase();
  if (unit.startsWith('kilo') || unit === 'kg') unit = 'kg';
  else if (unit.startsWith('libra') || unit === 'lb') unit = 'lb';
  else unit = 'g';
  return { qty, unit };
}
