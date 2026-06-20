const API_BASE = import.meta.env.PUBLIC_API_BASE_URL ?? 'http://localhost:5000';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error || res.statusText, res.status);
  }
  return data as T;
}

import type {
  AnalysisPreview,
  Category,
  ConfirmPayload,
  FinancePayload,
  OllamaHealth,
} from './types';

export function getFinanceData(): Promise<FinancePayload> {
  return fetchJson<FinancePayload>('/api/finance');
}

export function getCategories(kind?: string): Promise<{ categories: Category[] }> {
  const q = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  return fetchJson<{ categories: Category[] }>(`/api/categories${q}`);
}

export function getOllamaHealth(): Promise<OllamaHealth> {
  return fetch(`${API_BASE}/api/ollama/health`)
    .then((r) => r.json())
    .then((data) => data as OllamaHealth);
}

export function createAccount(body: Record<string, unknown>): Promise<FinancePayload & { account?: unknown }> {
  return fetchJson('/api/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function updateAccount(id: string, body: Record<string, unknown>): Promise<FinancePayload> {
  return fetchJson(`/api/accounts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function deleteAccount(id: string): Promise<FinancePayload> {
  return fetchJson(`/api/accounts/${id}`, { method: 'DELETE' });
}

export function createExpense(body: Record<string, unknown>): Promise<FinancePayload> {
  return fetchJson('/api/expenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function updateExpense(id: string, body: Record<string, unknown>): Promise<FinancePayload> {
  return fetchJson(`/api/expenses/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function deleteExpense(id: string): Promise<FinancePayload> {
  return fetchJson(`/api/expenses/${id}`, { method: 'DELETE' });
}

export function createInvestment(body: Record<string, unknown>): Promise<FinancePayload> {
  return fetchJson('/api/investments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function updateInvestment(id: string, body: Record<string, unknown>): Promise<FinancePayload> {
  return fetchJson(`/api/investments/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function deleteInvestment(id: string): Promise<FinancePayload> {
  return fetchJson(`/api/investments/${id}`, { method: 'DELETE' });
}

export function createNote(text: string, accountId?: string | null): Promise<FinancePayload> {
  return fetchJson('/api/note', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, account_id: accountId ?? null }),
  });
}

export function updateNote(id: string, body: Record<string, unknown>): Promise<FinancePayload> {
  return fetchJson(`/api/notes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function deleteNote(id: string): Promise<FinancePayload> {
  return fetchJson(`/api/notes/${id}`, { method: 'DELETE' });
}

export function createCategory(body: Record<string, unknown>): Promise<FinancePayload> {
  return fetchJson('/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function updateCategory(id: string, body: Record<string, unknown>): Promise<FinancePayload> {
  return fetchJson(`/api/categories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function deleteCategory(id: string): Promise<FinancePayload> {
  return fetchJson(`/api/categories/${id}`, { method: 'DELETE' });
}

export function analyzeText(text: string): Promise<AnalysisPreview> {
  return fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).then(async (res) => {
    const data = (await res.json()) as AnalysisPreview;
    if (!res.ok && !data.items?.length && !data.expenses?.length) {
      throw new ApiError(data.error || 'Error al analizar', res.status);
    }
    return data;
  });
}

export function confirmAnalysis(payload: ConfirmPayload): Promise<FinancePayload & { saved?: Record<string, number> }> {
  return fetchJson('/api/confirm-analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function resetData(): Promise<FinancePayload> {
  return fetchJson('/api/settings/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation: 'RESTABLECER' }),
  });
}
