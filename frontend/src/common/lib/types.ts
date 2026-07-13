export type RecordKind = 'expense' | 'income' | 'investment' | 'note' | 'account';

export interface Summary {
  monthly_expenses: Record<string, string>;
  monthly_incomes?: Record<string, string>;
  investments_total: Record<string, string>;
  balances_by_currency: Record<string, string>;
  total_movements: number;
  total_accounts: number;
  last_note: string;
  status: string;
  has_data: boolean;
}

export interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
  emoji: string;
  initial_balance?: number;
  current_balance?: number;
  type_label?: string;
  movement_count?: number;
  balance_display?: string;
  is_negative?: boolean;
}

export interface Category {
  id: string;
  name: string;
  emoji: string;
  kind: string;
}

export interface Movement {
  id: string;
  type: RecordKind;
  type_label: string;
  icon: string;
  description: string;
  amount: string | null;
  category?: string;
  category_emoji?: string;
  account_id?: string | null;
  account_name?: string;
  date: string;
  created_at?: string;
}

export interface ExpenseRecord {
  id: string;
  account_id?: string | null;
  amount: number;
  currency: string;
  category?: string;
  category_emoji?: string;
  description?: string;
  payment_method?: string;
  date?: string;
  created_at?: string;
}

export interface IncomeRecord {
  id: string;
  account_id?: string | null;
  amount: number;
  currency: string;
  category?: string;
  category_emoji?: string;
  description?: string;
  income_source?: string;
  date?: string;
  created_at?: string;
}

export type OperationType = 'deposit' | 'buy' | 'sell' | 'dividend';

export interface InvestmentAsset {
  id: string;
  symbol: string;
  label?: string;
}

export interface InvestmentRecord {
  id: string;
  account_id?: string | null;
  asset?: string;
  asset_type?: string;
  amount: number;
  currency: string;
  action?: string;
  operation_type?: OperationType | string;
  quantity?: number | null;
  amount_usd?: number | null;
  amount_cop?: number | null;
  unit_price?: number | null;
  closing_cost?: number | null;
  pnl_usd?: number | null;
  total?: number | null;
  source_image?: string | null;
  category?: string;
  category_emoji?: string;
  notes?: string;
  date?: string;
  created_at?: string;
}

export interface InvestmentLedgerRow {
  operation_type?: OperationType | string;
  date?: string;
  asset?: string;
  quantity?: number | null;
  amount_usd?: number | null;
  amount_cop?: number | null;
  unit_price?: number | null;
  closing_cost?: number | null;
  pnl_usd?: number | null;
  total?: number | null;
  source_image?: string | null;
  account_id?: string | null;
}

export interface OcrPreviewResponse {
  rows: InvestmentLedgerRow[];
  warnings: string[];
  hint?: string;
  ai_available?: boolean;
  error?: string;
}

export type BulkImportKind = 'investments' | 'expenses' | 'incomes' | 'notes' | 'accounts';

export type FinanceBulkImportKind = 'expenses' | 'incomes' | 'notes';

export interface ImportPreviewResponse {
  preview?: Record<string, unknown>[];
  rows?: Record<string, unknown>[];
  count?: number;
  warnings?: string[];
  error?: string;
  imported?: number;
}

export interface NoteRecord {
  id: string;
  text: string;
  account_id?: string | null;
  tags?: string[];
  date?: string;
  created_at?: string;
}

export interface MovementFilterOption {
  id: string;
  label: string;
}

export interface FinancePayload {
  summary: Summary;
  accounts: Account[];
  movements: Movement[];
  movement_filters?: MovementFilterOption[];
  categories: Category[];
  expenses: ExpenseRecord[];
  incomes: IncomeRecord[];
  investments: InvestmentRecord[];
  investment_assets?: InvestmentAsset[];
  notes: NoteRecord[];
  charts?: unknown;
}

export interface PreviewItem {
  kind: 'expense' | 'investment' | 'note';
  title?: string;
  amount?: number;
  currency?: string;
  category?: string;
  category_emoji?: string;
  description?: string;
  text?: string;
  asset?: string;
  asset_type?: string;
  action?: string;
  payment_method?: string;
  account_id?: string | null;
  account_name_hint?: string;
  suggested_new_category?: string | null;
  accept_category_suggestion?: boolean;
  needs_review?: boolean;
  tags?: string[];
}

export interface AnalysisPreview {
  items?: PreviewItem[];
  expenses?: PreviewItem[];
  investments?: PreviewItem[];
  notes?: PreviewItem[];
  reflection?: string;
  ai_available?: boolean;
  error?: string;
  hint?: string;
  can_save_as_note?: boolean;
  accounts?: Account[];
  counts?: { total?: number };
}

export interface ConfirmPayload {
  expenses?: ConfirmExpenseItem[];
  investments?: ConfirmInvestmentItem[];
  notes?: ConfirmNoteItem[];
  items?: PreviewItem[];
}

export interface ConfirmExpenseItem {
  kind?: string;
  amount: number;
  currency: string;
  category?: string;
  category_emoji?: string;
  description?: string;
  payment_method?: string;
  account_id?: string | null;
  accept_category_suggestion?: boolean;
  suggested_new_category?: string | null;
}

export interface ConfirmInvestmentItem {
  kind?: string;
  amount: number;
  currency: string;
  asset?: string;
  asset_type?: string;
  action?: string;
  category?: string;
  category_emoji?: string;
  notes?: string;
  account_id?: string | null;
  accept_category_suggestion?: boolean;
  suggested_new_category?: string | null;
}

export interface ConfirmNoteItem {
  kind?: string;
  text: string;
  tags?: string[];
  account_id?: string | null;
}

export interface OllamaHealth {
  ok: boolean;
  model?: string;
  model_found?: boolean;
  vision_model?: string;
  vision_model_found?: boolean;
  error?: string;
  hint?: string;
}

export type AiProviderId = 'local' | 'gemini' | 'compatible';

export interface AiSettings {
  provider: AiProviderId;
  cloud_enabled: boolean;
  text_model: string;
  vision_model: string;
  base_url: string;
  has_api_key: boolean;
  masked_key: string;
  effective_provider?: AiProviderId;
}

export interface AiProviderOption {
  id: AiProviderId;
  label: string;
  needs_api_key: boolean;
  needs_base_url: boolean;
  suggested_text_model: string;
  suggested_vision_model: string;
}

export interface AiSettingsResponse {
  config: AiSettings;
  providers: AiProviderOption[];
}

export interface AiHealthStatus {
  ok: boolean;
  provider?: string;
  model?: string;
  model_found?: boolean;
  vision_model?: string;
  vision_model_found?: boolean;
  url?: string;
  error?: string;
  hint?: string;
}

export interface AiSettingsPatch {
  provider?: AiProviderId;
  cloud_enabled?: boolean;
  text_model?: string;
  vision_model?: string;
  base_url?: string;
  api_key?: string;
}

export interface PortfolioPosition {
  asset: string;
  quantity: number;
  cost_basis_usd: number;
  average_cost_usd?: number | null;
  market_price_usd: number | null;
  used_price_usd?: number | null;
  price_source?: 'live_quote' | 'last_imported_unit_price' | null;
  price_source_label?: string | null;
  market_value_usd: number | null;
  unrealized_pnl_usd: number | null;
  unrealized_pnl_percent: number | null;
  realized_pnl_usd?: number;
  dividends_usd?: number;
  fees_paid_usd?: number;
  total_pnl_usd?: number;
  total_return_percent?: number | null;
}

export interface StrongestAsset {
  asset: string;
  market_value_usd: number | null;
  cost_basis_usd: number;
  portfolio_percent: number;
  quote_missing: boolean;
}

export interface PortfolioInsights {
  positions: PortfolioPosition[];
  strongest_asset: StrongestAsset | null;
  total_market_value_usd: number;
  total_assets_value_usd?: number;
  cash_available_usd?: number;
  total_portfolio_value_usd?: number;
  cash_warning?: string | null;
  warnings?: string[];
  total_unrealized_pnl_usd: number;
  total_realized_pnl_usd: number;
  total_dividends_usd?: number;
  total_fees_usd?: number;
  total_pnl_usd: number;
  total_deposits_usd?: number;
  global_gain_by_contributions_usd?: number;
  total_return_percent?: number | null;
  quotes_as_of: string | null;
  quotes_partial: boolean;
  has_positions: boolean;
}

export interface SelectOption {
  value: string;
  label: string;
  emoji?: string;
  name?: string;
}

export type EditRecordType = 'account' | 'expense' | 'income' | 'investment' | 'note';

export interface EditState {
  type: EditRecordType | null;
  id: string | null;
}
