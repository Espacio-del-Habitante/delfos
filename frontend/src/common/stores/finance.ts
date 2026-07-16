import { writable } from 'svelte/store';
import { getFinanceData } from '@common/lib/api';
import type { FinancePayload } from '@common/lib/types';

export type FinanceStatus = 'idle' | 'loading' | 'ready' | 'error';

export const finance = writable<FinancePayload | null>(null);
export const financeStatus = writable<FinanceStatus>('idle');

export async function refreshFinanceData(): Promise<FinancePayload> {
  financeStatus.set('loading');
  try {
    const data = await getFinanceData();
    finance.set(data);
    financeStatus.set('ready');
    return data;
  } catch (err) {
    financeStatus.set('error');
    throw err;
  }
}

export function applyFinancePayload(data: FinancePayload): void {
  finance.set(data);
  financeStatus.set('ready');
}
