import type { InvestmentRecord, Movement, OperationType } from './types';

export interface InvestmentFilterState {
  search: string;
  asset: string;
  operationType: 'all' | OperationType;
  dateFrom: string;
  dateTo: string;
}

export interface MovementFilterState {
  search: string;
  type: 'all' | 'expense' | 'income' | 'investment' | 'note';
  dateFrom: string;
  dateTo: string;
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function inDateRange(date: string | undefined, from: string, to: string): boolean {
  const d = date || '';
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function resolveOperationType(inv: InvestmentRecord): string {
  return inv.operation_type || inv.action || 'buy';
}

export function filterInvestments(
  investments: InvestmentRecord[],
  filters: InvestmentFilterState,
): InvestmentRecord[] {
  const q = normalizeSearch(filters.search);
  const assetQ = normalizeSearch(filters.asset);

  return investments.filter((inv) => {
    if (filters.operationType !== 'all' && resolveOperationType(inv) !== filters.operationType) {
      return false;
    }
    if (!inDateRange(inv.date, filters.dateFrom, filters.dateTo)) {
      return false;
    }
    if (assetQ) {
      const invAsset = (inv.asset || '').trim().toLowerCase();
      if (invAsset !== assetQ && !invAsset.includes(assetQ)) {
        return false;
      }
    }
    if (!q) return true;
    const haystack = [inv.asset, inv.notes].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

export function filterMovements(movements: Movement[], filters: MovementFilterState): Movement[] {
  const q = normalizeSearch(filters.search);

  return movements.filter((m) => {
    if (filters.type !== 'all' && m.type !== filters.type) {
      return false;
    }
    if (!inDateRange(m.date, filters.dateFrom, filters.dateTo)) {
      return false;
    }
    if (!q) return true;
    const haystack = [m.description, m.category, m.account_name, m.type_label]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}
