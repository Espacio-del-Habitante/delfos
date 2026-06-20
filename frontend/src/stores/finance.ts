import { writable } from 'svelte/store';
import { getFinanceData } from '@/lib/api';
import type { FinancePayload } from '@/lib/types';

export const finance = writable<FinancePayload | null>(null);

export async function refreshFinanceData(): Promise<FinancePayload> {
  const data = await getFinanceData();
  finance.set(data);
  return data;
}

export function applyFinancePayload(data: FinancePayload): void {
  finance.set(data);
}
