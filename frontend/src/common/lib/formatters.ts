export const ACCOUNT_TYPES: Record<string, string> = {
  cash: 'Efectivo',
  bank: 'Banco',
  credit_card: 'Tarjeta crédito',
  debit_card: 'Tarjeta débito',
  wallet: 'Billetera',
  broker: 'Broker',
  crypto: 'Cripto',
  savings: 'Ahorros',
  other: 'Otro',
};

export function formatAmount(amount: number | null | undefined, currency = 'COP'): string {
  if (amount == null) return '—';
  if (currency === 'USD') return `$${amount.toLocaleString('en-US')} USD`;
  return `$${amount.toLocaleString('es-CO')} COP`;
}

export function formatMultiCurrency(totals: Record<string, number> | Record<string, string> | undefined): string {
  if (!totals || typeof totals !== 'object') return '$0';
  return Object.values(totals).join(' · ') || '$0';
}

export function formatAmountPreview(amount: number | null | undefined, currency?: string): string {
  if (amount == null || amount === ('' as unknown)) return '—';
  const n = Number(amount);
  if (currency === 'USD') return `$${n.toLocaleString('en-US')} USD`;
  return `$${n.toLocaleString('es-CO')} COP`;
}

export function accountTypeLabel(type: string): string {
  return ACCOUNT_TYPES[type] || type;
}

export const OPERATION_TYPE_LABELS: Record<string, string> = {
  deposit: 'Depósito',
  withdrawal: 'Retiro',
  buy: 'Compra',
  sell: 'Venta',
  dividend: 'Dividendo',
};

export function operationTypeLabel(type: string | undefined): string {
  if (!type) return '—';
  return OPERATION_TYPE_LABELS[type] || type;
}

export function formatLedgerNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}
