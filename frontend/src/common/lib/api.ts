const API_BASE = import.meta.env.PUBLIC_API_BASE_URL ?? '';

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
  AiHealthStatus,
  AiSettingsPatch,
  AiSettingsResponse,
  AnalysisPreview,
  BulkImportKind,
  Category,
  ConfirmPayload,
  FinancePayload,
  AssistantContextPack,
  AccountDraft,
  ChatMessage,
  ChatResponse,
  ChatThread,
  FinancialProfile,
  FinancialProfilePatch,
  Goal,
  GoalInput,
  ImportPreviewResponse,
  InvestmentLedgerRow,
  OllamaHealth,
  OcrPreviewResponse,
  PortfolioInsights,
  QuoteSettings,
  QuoteSettingsPatch,
  QuoteTestStatus,
} from './types';

export function getFinanceData(): Promise<FinancePayload> {
  return fetchJson<FinancePayload>('/api/finance');
}

export function getAssistantProfile(): Promise<{ profile: FinancialProfile }> {
  return fetchJson('/api/assistant/profile');
}

export function updateAssistantProfile(
  patch: FinancialProfilePatch,
): Promise<{ profile: FinancialProfile }> {
  return fetchJson('/api/assistant/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function getAssistantGoals(): Promise<{ goals: Goal[] }> {
  return fetchJson('/api/assistant/goals');
}

export function createAssistantGoal(body: GoalInput): Promise<{ goal: Goal; goals: Goal[] }> {
  return fetchJson('/api/assistant/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function updateAssistantGoal(
  id: string,
  body: Partial<GoalInput>,
): Promise<{ goal: Goal; goals: Goal[] }> {
  return fetchJson(`/api/assistant/goals/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function deleteAssistantGoal(id: string): Promise<{ goals: Goal[] }> {
  return fetchJson(`/api/assistant/goals/${id}`, { method: 'DELETE' });
}

export function getAssistantContext(): Promise<AssistantContextPack> {
  return fetchJson('/api/assistant/context');
}

export function ensureAssistantThread(): Promise<{ thread: ChatThread }> {
  return fetchJson('/api/assistant/threads', { method: 'POST' });
}

export function getAssistantMessages(threadId: string): Promise<{ messages: ChatMessage[] }> {
  return fetchJson(`/api/assistant/threads/${threadId}/messages`);
}

export function sendAssistantChat(
  message: string,
  threadId?: string | null,
): Promise<ChatResponse> {
  return fetchJson('/api/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, thread_id: threadId || undefined }),
  });
}

export function applyAssistantProfileSuggestion(
  suggestion: FinancialProfilePatch,
): Promise<{ profile: FinancialProfile; applied: FinancialProfilePatch }> {
  return fetchJson('/api/assistant/apply-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestion }),
  });
}

export function applyAssistantAccountSuggestion(
  suggestion: AccountDraft,
): Promise<FinancePayload & { account?: unknown; applied?: AccountDraft }> {
  return fetchJson('/api/assistant/apply-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestion }),
  });
}

export function fetchPortfolioInsights(): Promise<PortfolioInsights> {
  return fetchJson<PortfolioInsights>('/api/investments/portfolio');
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

export function getAiSettings(): Promise<AiSettingsResponse> {
  return fetchJson<AiSettingsResponse>('/api/settings/ai');
}

export function saveAiSettings(patch: AiSettingsPatch): Promise<AiSettingsResponse> {
  return fetchJson<AiSettingsResponse>('/api/settings/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function testAiConnection(patch: AiSettingsPatch): Promise<AiHealthStatus> {
  return fetchJson<AiHealthStatus>('/api/settings/ai/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function getQuoteSettings(): Promise<{ config: QuoteSettings }> {
  return fetchJson<{ config: QuoteSettings }>('/api/settings/quotes');
}

export function saveQuoteSettings(patch: QuoteSettingsPatch): Promise<{ config: QuoteSettings }> {
  return fetchJson<{ config: QuoteSettings }>('/api/settings/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function testQuoteSettings(patch: QuoteSettingsPatch): Promise<QuoteTestStatus> {
  return fetchJson<QuoteTestStatus>('/api/settings/quotes/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
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

export function createIncome(body: Record<string, unknown>): Promise<FinancePayload> {
  return fetchJson('/api/incomes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function updateIncome(id: string, body: Record<string, unknown>): Promise<FinancePayload> {
  return fetchJson(`/api/incomes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function deleteIncome(id: string): Promise<FinancePayload> {
  return fetchJson(`/api/incomes/${id}`, { method: 'DELETE' });
}

export function createInvestment(body: Record<string, unknown>): Promise<FinancePayload> {
  return fetchJson('/api/investments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function createInvestmentAsset(symbol: string, label?: string): Promise<FinancePayload> {
  return fetchJson('/api/investment-assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, label }),
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

async function fetchBlob(path: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError((data as { error?: string }).error || res.statusText, res.status);
  }
  return res.blob();
}

async function fetchAssetBlob(path: string): Promise<Blob> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new ApiError(res.statusText, res.status);
  }
  return res.blob();
}

export function exportInvestmentsCsv(): Promise<Blob> {
  return fetchBlob('/api/investments/export.csv');
}

export function downloadInvestmentsTemplateCsv(): Promise<Blob> {
  return fetchAssetBlob('/plantillas/plantilla-inversiones.csv');
}

export function exportInvestmentsXlsx(): Promise<Blob> {
  return fetchBlob('/api/investments/export.xlsx');
}

export function importInvestmentsCsv(file: File, confirm = false): Promise<ImportPreviewResponse & FinancePayload> {
  return importCsvBulk('investments', file, confirm);
}

const IMPORT_PATHS: Record<BulkImportKind, string> = {
  investments: '/api/investments/import.csv',
  expenses: '/api/expenses/import.csv',
  incomes: '/api/incomes/import.csv',
  notes: '/api/notes/import.csv',
  accounts: '/api/accounts/import.csv',
};

export function importCsvBulk(
  kind: BulkImportKind,
  file: File,
  confirm = false,
): Promise<ImportPreviewResponse & FinancePayload> {
  const form = new FormData();
  form.append('file', file);
  const q = confirm ? '?confirm=true' : '';
  return fetch(`${API_BASE}${IMPORT_PATHS[kind]}${q}`, {
    method: 'POST',
    body: form,
  }).then(async (res) => {
    const data = (await res.json()) as ImportPreviewResponse & FinancePayload & { error?: string };
    if (!res.ok) {
      throw new ApiError(data.error || res.statusText, res.status);
    }
    return data;
  });
}

export function importExpensesCsv(file: File, confirm = false): Promise<ImportPreviewResponse & FinancePayload> {
  return importCsvBulk('expenses', file, confirm);
}

export function importIncomesCsv(file: File, confirm = false): Promise<ImportPreviewResponse & FinancePayload> {
  return importCsvBulk('incomes', file, confirm);
}

export function importNotesCsv(file: File, confirm = false): Promise<ImportPreviewResponse & FinancePayload> {
  return importCsvBulk('notes', file, confirm);
}

export function ocrInvestmentImage(file: File): Promise<OcrPreviewResponse> {
  const form = new FormData();
  form.append('image', file);
  return fetch(`${API_BASE}/api/investments/ocr`, {
    method: 'POST',
    body: form,
  }).then(async (res) => {
    const data = (await res.json()) as OcrPreviewResponse & { error?: string; hint?: string };
    if (!res.ok) {
      const message = data.hint ? `${data.error || res.statusText}. ${data.hint}` : data.error || res.statusText;
      throw new ApiError(message, res.status);
    }
    return data;
  });
}

export function confirmOcrRows(rows: InvestmentLedgerRow[]): Promise<FinancePayload & { saved?: number }> {
  return fetchJson('/api/investments/ocr/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  });
}
