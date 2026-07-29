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

export type AccountRole = 'operating' | 'goal' | 'general';

export interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
  emoji: string;
  initial_balance?: number;
  current_balance?: number;
  goal_id?: string | null;
  role?: AccountRole | string;
  goal_title?: string | null;
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

export interface MovementsPage {
  items: Movement[];
  total: number;
  page: number;
  page_size: number;
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

export type RiskProfile = 'conservative' | 'moderate' | 'aggressive';
export type InvestmentHorizon = 'short' | 'medium' | 'long';
export type GoalType = 'emergency_fund' | 'savings' | 'investment' | 'debt' | 'custom';
export type GoalStatus = 'active' | 'paused' | 'done' | 'cancelled';

export interface FixedExpenseItem {
  label: string;
  amount: number;
}

export type PayFrequency = 'monthly' | 'biweekly' | 'weekly';

export interface FinancialProfile {
  monthly_income_fixed: number | null;
  monthly_income_variable_avg: number | null;
  /** Total mensual de gastos fijos (perfil base). */
  monthly_fixed_expenses: number | null;
  /** Detalle opcional de fijos: arriendo, internet, etc. */
  fixed_expenses: FixedExpenseItem[];
  savings_target_percent: number | null;
  investment_target_percent: number | null;
  /** % del ingreso no comprometido (colchón / holgura). */
  cushion_percent: number | null;
  emergency_fund_target_months: number | null;
  /** Frecuencia de cobro; montos del perfil siguen siendo totales mensuales. */
  pay_frequency: PayFrequency | string;
  /** Día del mes (1–28) en que suele llegar el salario (mensual/quincenal). */
  income_payday_day: number | null;
  /** Día de la semana del cobro (0=lun … 6=dom); solo weekly. */
  income_payday_weekday: number | null;
  /** Token de dismiss del banner: YYYY-MM | YYYY-MM-H1/H2 | YYYY-MM-DD. */
  income_prompt_dismissed_ym: string | null;
  risk_profile: RiskProfile | null;
  investment_horizon: InvestmentHorizon | null;
  fiscal_country: string | null;
  priorities: string[];
  onboarding_completed: boolean;
  last_reviewed_at: string | null;
}

export interface Goal {
  id: string;
  type: GoalType | string;
  title: string;
  target_amount: number | null;
  target_date: string | null;
  monthly_target: number | null;
  status: GoalStatus | string;
  priority: number;
  notes: string | null;
  current_amount?: number;
  linked_account_ids?: string[];
  linked_account_names?: string[];
  created_at?: string;
  updated_at?: string;
}

export type FinancialProfilePatch = Partial<
  Omit<FinancialProfile, 'priorities' | 'last_reviewed_at' | 'fixed_expenses'>
> & {
  priorities?: string[] | string;
  fixed_expenses?: FixedExpenseItem[];
};

export type GoalInput = {
  title: string;
  type?: GoalType | string;
  target_amount?: number | null;
  target_date?: string | null;
  monthly_target?: number | null;
  status?: GoalStatus | string;
  priority?: number;
  notes?: string | null;
};

export interface AssistantKpis {
  currency?: string;
  month_summary?: {
    income?: number;
    expense?: number;
    income_base?: number;
    liquid_balance?: number;
    emergency_balance?: number;
    fixed_expenses?: number | null;
  };
  savings_actual_percent?: number | null;
  savings_target_percent?: number | null;
  savings_vs_target_delta?: number | null;
  emergency_months_approx?: number | null;
  emergency_fund_target_months?: number | null;
  emergency_vs_target_delta?: number | null;
  cushion_percent?: number | null;
  allocation_sum_percent?: number | null;
  portfolio?: {
    top_asset?: string | null;
    top_weight_percent?: number | null;
    position_count?: number;
    basis?: string;
  };
  active_goals_count?: number;
}

export interface AssistantContextPack {
  profile: FinancialProfile;
  kpis: AssistantKpis;
  goals: Goal[];
  alerts_open?: unknown[];
  memory_summary?: string | null;
  memory_facts?: unknown[];
  thread_tail?: unknown[];
}

export interface ChatThread {
  id: string;
  title: string;
  kind?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  meta?: {
    follow_ups?: string[];
    error?: boolean;
    parse_error?: boolean;
    off_topic?: boolean;
    profile_suggestion?: FinancialProfilePatch;
    movement_draft?: AnalysisPreview | null;
    account_draft?: AccountDraft | null;
    lookup?: MovementLookup | null;
  };
  created_at?: string;
}

export interface AccountDraft {
  name: string;
  type: string;
  currency: string;
  initial_balance: number;
  emoji?: string;
}

export interface MovementLookupHit {
  kind: string;
  id?: string;
  date?: string;
  label?: string;
  amount?: number | null;
  currency?: string | null;
  category?: string | null;
}

export interface MovementLookup {
  query: string;
  kind?: string | null;
  period?: string;
  count: number;
  shown?: number;
  totals?: Record<string, number>;
  hits: MovementLookupHit[];
}

export interface ChatResponse {
  thread: ChatThread;
  assistant_message: ChatMessage;
  follow_ups?: string[];
  messages?: ChatMessage[];
  ai_available?: boolean;
  error?: string;
  off_topic?: boolean;
  profile_suggestion?: FinancialProfilePatch;
  movement_draft?: AnalysisPreview | null;
  account_draft?: AccountDraft | null;
  lookup?: MovementLookup | null;
  profile?: FinancialProfile;
  summarized?: boolean;
  compacted_count?: number;
  memory_summary?: string | null;
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
  transfers?: TransferRecord[];
  charts?: unknown;
  financial_profile?: FinancialProfile;
  goals?: Goal[];
  assistant_kpis?: AssistantKpis | null;
}

export interface TransferRecord {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  currency: string;
  date?: string;
  goal_id?: string | null;
  label?: string;
  source?: string;
  created_at?: string;
}

export type AllocationLineKind =
  | 'fixed_expense'
  | 'emergency'
  | 'goal'
  | 'investment'
  | 'investment_reserve'
  | 'cushion';

export interface AllocationLine {
  id: string;
  kind: AllocationLineKind | string;
  label: string;
  amount: number;
  enabled: boolean;
  disabled_reason?: string | null;
  to_account_id?: string | null;
  goal_id?: string | null;
  accepted: boolean;
  editable: boolean;
  /** Opt-in colchón: al confirmar crear cuenta+meta Colchón y transferir. */
  create_cushion_account?: boolean;
}

export interface AllocationProposal {
  income_amount: number;
  from_account_id: string;
  currency: string;
  /** Echo del flag enviado a propose; default true en backend. */
  income_is_complete?: boolean;
  /** Frecuencia del perfil usada para escalar fijos del periodo. */
  pay_frequency?: PayFrequency | string;
  /** Gastos fijos del periodo (mensual / N). */
  period_fixed_amount?: number;
  /** Total = una línea agregada; desglose = una por ítem del perfil. */
  fixed_mode?: 'total' | 'desglose' | string;
  /** Líneas candidatas para modo desglose (vacío si no hay fixed_expenses). */
  fixed_desglose?: AllocationLine[];
  lines: AllocationLine[];
  summary: {
    to_move: number;
    fixed: number;
    cushion: number;
    liquid_remaining: number;
    warning?: string | null;
    /** Info suave (p. ej. propuesta proporcional); no es shortfall. */
    note?: string | null;
  };
}

export interface PreviewItem {
  kind: 'expense' | 'income' | 'investment' | 'note';
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
  income_source?: string;
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
  incomes?: PreviewItem[];
  investments?: PreviewItem[];
  notes?: PreviewItem[];
  reflection?: string;
  ai_available?: boolean;
  error?: string;
  hint?: string;
  can_save_as_note?: boolean;
  accounts?: Account[];
  counts?: { total?: number; expenses?: number; incomes?: number; investments?: number; notes?: number };
  needs_clarification?: string | null;
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
  /** Si true, intenta STT en la nube antes que Whisper local. */
  prefer_cloud_stt?: boolean;
  local_whisper_model?: string;
  local_whisper?: {
    available?: boolean;
    installed?: boolean;
    loaded?: boolean;
    model?: string;
    error?: string;
    hint?: string;
  };
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
  prefer_cloud_stt?: boolean;
  local_whisper_model?: string;
}

export interface QuoteSettings {
  has_twelve_data_key: boolean;
  masked_twelve_data_key: string;
  has_alpha_vantage_key: boolean;
  masked_alpha_vantage_key: string;
  broker_reference_total_usd: number | null;
}

export interface QuoteSettingsPatch {
  twelve_data_api_key?: string;
  alpha_vantage_api_key?: string;
  broker_reference_total_usd?: number | null;
}

export interface QuoteTestStatus {
  ok: boolean;
  provider?: string;
  symbol?: string;
  price?: number;
  error?: string;
}

export type QuoteConfidence = 'ok' | 'fallback' | 'warning' | 'missing';

export interface QuoteCandidate {
  provider: string;
  price: number;
  timestamp: string;
}

export interface PortfolioPosition {
  asset: string;
  asset_type?: string;
  quantity: number;
  cost_basis_usd: number;
  average_cost_usd?: number | null;
  market_price_usd: number | null;
  used_price_usd?: number | null;
  currency?: string;
  quote_timestamp?: string | null;
  quote_provider?: string | null;
  quote_provider_label?: string | null;
  quote_confidence?: QuoteConfidence;
  quote_confidence_label?: string;
  is_delayed?: boolean;
  delay_label?: string | null;
  quote_warnings?: string[];
  quote_candidates?: QuoteCandidate[] | null;
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

export interface QuoteSourceSummary {
  provider: string;
  provider_label: string;
  symbols: string[];
  fetched_at: string | null;
  delayed_count: number;
}

export interface BrokerComparison {
  reference_total_usd: number;
  diff_usd: number;
  diff_percent: number;
}

export interface ExcludedPosition {
  asset: string;
  reason: string;
}

export interface PortfolioInsights {
  positions: PortfolioPosition[];
  strongest_asset: StrongestAsset | null;
  total_market_value_usd: number;
  total_assets_value_usd?: number;
  total_assets_excluded_usd?: number;
  cash_available_usd?: number;
  total_portfolio_value_usd?: number;
  cash_warning?: string | null;
  warnings?: string[];
  price_alerts?: string[];
  price_problem_assets?: PortfolioPosition[];
  quote_sources?: QuoteSourceSummary[];
  excluded_from_total?: ExcludedPosition[];
  broker_comparison?: BrokerComparison | null;
  total_unrealized_pnl_usd: number;
  total_realized_pnl_usd: number;
  total_dividends_usd?: number;
  total_fees_usd?: number;
  total_pnl_usd: number;
  total_deposits_usd?: number;
  total_withdrawals_usd?: number;
  net_contributions_usd?: number;
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
