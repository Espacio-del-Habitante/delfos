/** Valores canónicos de asset_type (alineados con backend/services/quote_symbol.py). */
export const INVESTMENT_ASSET_TYPES = [
  { value: 'etf', label: 'ETF' },
  { value: 'stock', label: 'Acción' },
  { value: 'crypto', label: 'Cripto' },
] as const;

export type InvestmentAssetType = (typeof INVESTMENT_ASSET_TYPES)[number]['value'];

export const INVESTMENT_OPERATION_TYPES = [
  { value: 'deposit', label: 'Depósito' },
  { value: 'buy', label: 'Compra' },
  { value: 'sell', label: 'Venta' },
  { value: 'dividend', label: 'Dividendo' },
] as const;

export function normalizeAssetType(raw: string | undefined | null): InvestmentAssetType {
  const key = (raw || '').trim().toLowerCase();
  if (key === 'stock' || key === 'acción' || key === 'accion' || key === 'equity') return 'stock';
  if (key === 'crypto' || key === 'cripto' || key === 'cryptocurrency') return 'crypto';
  if (key === 'etf' || key === 'fund' || key === 'other') return 'etf';
  return 'etf';
}

export function assetTypeLabel(type: string | undefined | null): string {
  const key = (type || '').trim().toLowerCase();
  if (key === 'cash' || key === 'efectivo') return 'Efectivo';
  const normalized = normalizeAssetType(type);
  return INVESTMENT_ASSET_TYPES.find((t) => t.value === normalized)?.label ?? type ?? '—';
}
