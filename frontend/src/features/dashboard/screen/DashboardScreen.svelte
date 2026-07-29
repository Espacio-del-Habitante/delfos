<script lang="ts">
  import { onMount } from 'svelte';
  import HeaderIsland from '@common/molecules/HeaderIsland.svelte';
  import SummaryCards from '@features/dashboard/components/organisms/SummaryCards.svelte';
  import ProfilePeek from '@features/dashboard/components/organisms/ProfilePeek.svelte';
  import AccountsPanel from '@features/dashboard/components/organisms/AccountsPanel.svelte';
  import QuickEntry from '@features/dashboard/components/organisms/QuickEntry.svelte';
  import VoiceEntry from '@features/dashboard/components/organisms/VoiceEntry.svelte';
  import ControlCenterPanel from '@features/dashboard/components/organisms/ControlCenterPanel.svelte';
  import ManualEntryModals from '@features/dashboard/components/organisms/ManualEntryModals.svelte';
  import FinanceBulkImportModal from '@features/dashboard/components/organisms/FinanceBulkImportModal.svelte';
  import AiPreview from '@features/dashboard/components/organisms/AiPreview.svelte';
  import MovementsList from '@features/dashboard/components/organisms/MovementsList.svelte';
  import BottomNav from '@common/molecules/BottomNav.svelte';
  import EditModal from '@common/organisms/EditModal.svelte';
  import {
    deleteAccount,
    deleteExpense,
    deleteIncome,
    deleteInvestment,
    deleteNote,
    updateAssistantProfile,
  } from '@common/lib/api';
  import { applyFinancePayload, finance, financeStatus, refreshFinanceData } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import { findCategoryByName } from '@common/lib/categories';
  import type {
    Account,
    AnalysisPreview,
    EditRecordType,
    ExpenseRecord,
    IncomeRecord,
    InvestmentRecord,
    NoteRecord,
  } from '@common/lib/types';

  const LIQUID_TYPES = new Set(['cash', 'bank', 'wallet', 'savings', 'debit_card']);

  let draftText = '';
  let analysisPreview: AnalysisPreview | null = null;

  let editOpen = false;
  let editType: EditRecordType | null = null;
  let editRecord: Account | ExpenseRecord | IncomeRecord | InvestmentRecord | NoteRecord | null = null;

  let expenseModalOpen = false;
  let incomeModalOpen = false;
  let incomePrefill: {
    amount?: number | null;
    accountId?: string | null;
    category?: string | null;
    categoryEmoji?: string | null;
    description?: string | null;
    currency?: string | null;
  } | null = null;
  let importModalOpen = false;
  let dismissingPayday = false;

  onMount(() => {
    refreshFinanceData().catch(() => showToast('No se pudo cargar los datos', { type: 'error' }));
  });

  $: profile = $finance?.financial_profile ?? null;
  $: baseCurrency =
    Object.keys($finance?.summary?.balances_by_currency ?? {})[0] || 'COP';
  $: today = new Date();
  $: monthYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  $: todayDay = today.getDate();
  $: todayIso = `${monthYm}-${String(todayDay).padStart(2, '0')}`;
  $: payFrequency = String(profile?.pay_frequency || 'monthly').toLowerCase();
  $: periodDivisor = payFrequency === 'biweekly' ? 2 : payFrequency === 'weekly' ? 4 : 1;
  $: biweeklyHalf = todayDay <= 14 ? 1 : 2;
  $: paydayDismissKey =
    payFrequency === 'biweekly'
      ? `${monthYm}-H${biweeklyHalf}`
      : payFrequency === 'weekly'
        ? todayIso
        : monthYm;

  function incomeInRange(
    incomes: IncomeRecord[],
    currency: string,
    start: string,
    end: string,
  ): boolean {
    return incomes.some((inc) => {
      const d = String(inc.date || '').slice(0, 10);
      return (
        d >= start &&
        d <= end &&
        (inc.currency || currency) === currency &&
        Number(inc.amount) > 0
      );
    });
  }

  $: showPaydayBanner = (() => {
    if (!profile?.onboarding_completed) return false;
    if (profile.income_prompt_dismissed_ym === paydayDismissKey) return false;
    const incomes = $finance?.incomes ?? [];

    if (payFrequency === 'weekly') {
      const wd = profile.income_payday_weekday;
      if (wd == null || wd < 0 || wd > 6) return false;
      // perfil 0=lun…6=dom → JS getDay 0=dom…6=sáb
      const jsDow = (Number(wd) + 1) % 7;
      if (today.getDay() !== jsDow) return false;
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      const startIso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
      return !incomeInRange(incomes, baseCurrency, startIso, todayIso);
    }

    if (payFrequency === 'biweekly') {
      const paydayConfigured = profile.income_payday_day;
      const halfPayday =
        biweeklyHalf === 1
          ? paydayConfigured != null && paydayConfigured <= 14
            ? paydayConfigured
            : 1
          : 15;
      if (todayDay < halfPayday) return false;
      const start = biweeklyHalf === 1 ? `${monthYm}-01` : `${monthYm}-15`;
      const end = biweeklyHalf === 1 ? `${monthYm}-14` : `${monthYm}-31`;
      return !incomeInRange(incomes, baseCurrency, start, end);
    }

    // monthly
    if (profile.income_payday_day == null) return false;
    if (todayDay < profile.income_payday_day) return false;
    return !incomeInRange(incomes, baseCurrency, `${monthYm}-01`, `${monthYm}-31`);
  })();

  $: paydayBannerCopy =
    payFrequency === 'weekly'
      ? 'Registra el ingreso de la semana para repartir el cheque.'
      : payFrequency === 'biweekly'
        ? 'Registra el ingreso de la quincena para ver el % de ahorro y repartir.'
        : 'Registra el ingreso del mes para ver el % de ahorro real y repartir el salario.';

  function pickPaydayAccount(accounts: Account[], currency: string): string {
    const sameCur = (a: Account) => (a.currency || 'COP') === currency;
    const operating = accounts.find((a) => a.role === 'operating' && sameCur(a));
    if (operating) return operating.id;
    const liquid = accounts.find((a) => LIQUID_TYPES.has(a.type) && sameCur(a));
    if (liquid) return liquid.id;
    return accounts.find(sameCur)?.id ?? '';
  }

  function openPaydayIncome() {
    const accounts = $finance?.accounts ?? [];
    const categories = $finance?.categories ?? [];
    const fixed = Number(profile?.monthly_income_fixed) || 0;
    const variable = Number(profile?.monthly_income_variable_avg) || 0;
    const monthly = fixed + variable;
    const amount = monthly > 0 ? Math.round((monthly / periodDivisor) * 100) / 100 : null;
    const salaryCat = findCategoryByName(categories, 'Salario', 'income');
    incomePrefill = {
      amount,
      accountId: pickPaydayAccount(accounts, baseCurrency) || null,
      category: 'Salario',
      categoryEmoji: salaryCat?.emoji || '💰',
      description: 'Salario',
      currency: baseCurrency,
    };
    incomeModalOpen = true;
  }

  async function dismissPaydayPrompt() {
    if (dismissingPayday) return;
    dismissingPayday = true;
    try {
      const { profile: updated } = await updateAssistantProfile({
        income_prompt_dismissed_ym: paydayDismissKey,
      });
      if ($finance) {
        applyFinancePayload({ ...$finance, financial_profile: updated });
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo omitir', { type: 'error' });
    } finally {
      dismissingPayday = false;
    }
  }

  function handleAnalyzed(e: CustomEvent<AnalysisPreview>) {
    analysisPreview = e.detail;
  }

  function clearPreview() {
    analysisPreview = null;
  }

  function onPreviewConfirmed() {
    analysisPreview = null;
    draftText = '';
  }

  function findRecord(type: string, id: string) {
    const data = $finance;
    if (!data) return null;
    if (type === 'account') return data.accounts.find((a) => a.id === id) ?? null;
    if (type === 'expense') return data.expenses.find((r) => r.id === id) || null;
    if (type === 'income') return data.incomes?.find((r) => r.id === id) || null;
    if (type === 'investment') return data.investments.find((r) => r.id === id) || null;
    if (type === 'note') return data.notes.find((r) => r.id === id) || null;
    return null;
  }

  function openEdit(type: string, id: string) {
    const record = findRecord(type, id);
    if (!record) {
      showToast('Registro no encontrado');
      return;
    }
    editType = type as EditRecordType;
    editRecord = record as Account | ExpenseRecord | IncomeRecord | InvestmentRecord | NoteRecord;
    editOpen = true;
  }

  async function handleDelete(type: string, id: string) {
    const messages: Record<string, string> = {
      account: '¿Eliminar esta cuenta? Los movimientos asociados quedarán sin cuenta.',
      expense: '¿Eliminar este gasto?',
      income: '¿Eliminar este ingreso?',
      investment: '¿Eliminar esta inversión?',
      note: '¿Eliminar esta nota?',
    };
    if (!confirm(messages[type] || '¿Eliminar este registro?')) return;
    try {
      let data;
      if (type === 'account') data = await deleteAccount(id);
      else if (type === 'expense') data = await deleteExpense(id);
      else if (type === 'income') data = await deleteIncome(id);
      else if (type === 'investment') data = await deleteInvestment(id);
      else data = await deleteNote(id);
      applyFinancePayload(data);
      showToast('Eliminado', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al eliminar', { type: 'error' });
    }
  }

  function closeEdit() {
    editOpen = false;
    editType = null;
    editRecord = null;
  }
</script>

<div class="app-shell">
  <HeaderIsland
    summary={$finance?.summary ?? null}
    kpis={$finance?.assistant_kpis ?? null}
  />

  {#if $financeStatus === 'loading' && !$finance}
    <p class="finance-loading" role="status">Cargando finanzas…</p>
  {:else if $financeStatus === 'error' && !$finance}
    <p class="finance-loading finance-loading--error" role="alert">
      No se pudieron cargar los datos.
      <button type="button" class="linkish" on:click={() => refreshFinanceData()}>Reintentar</button>
    </p>
  {/if}

  {#if $finance && $finance.financial_profile && !$finance.financial_profile.onboarding_completed}
    <aside class="onboarding-banner" aria-label="Alta de perfil">
      <div>
        <strong>Configura tu perfil financiero</strong>
        <p>Ingresos, metas y preferencias para que el asistente tenga contexto.</p>
      </div>
      <a class="onboarding-banner__cta" href="/perfil">Empezar</a>
    </aside>
  {:else if showPaydayBanner}
    <aside class="onboarding-banner" aria-label="Recordatorio de ingreso">
      <div>
        <strong>¿Ya te pagaron?</strong>
        <p>{paydayBannerCopy}</p>
      </div>
      <div class="onboarding-banner__actions">
        <button
          type="button"
          class="onboarding-banner__ghost"
          disabled={dismissingPayday}
          on:click={dismissPaydayPrompt}
        >
          Ahora no
        </button>
        <button type="button" class="onboarding-banner__cta" on:click={openPaydayIncome}>
          Registrar ingreso
        </button>
      </div>
    </aside>
  {/if}

  <div class="dashboard-grid">
    <div class="dashboard-col-left" id="inicio">
      <SummaryCards summary={$finance?.summary ?? null} />
      <ProfilePeek
        profile={$finance?.financial_profile}
        goals={$finance?.goals ?? []}
        kpis={$finance?.assistant_kpis}
      />
      <AccountsPanel
        accounts={$finance?.accounts ?? []}
        goals={$finance?.goals ?? []}
        on:edit={(e) => openEdit(e.detail.type, e.detail.id)}
        on:delete={(e) => handleDelete(e.detail.type, e.detail.id)}
        on:refresh={refreshFinanceData}
      />
    </div>

    <div class="dashboard-col-right" id="registrar">
      <QuickEntry
        bind:text={draftText}
        on:analyzed={handleAnalyzed}
        on:clearPreview={clearPreview}
      />
      <VoiceEntry bind:text={draftText} on:transcript={(e) => (draftText = e.detail)} />
      <ControlCenterPanel
        on:openExpense={() => (expenseModalOpen = true)}
        on:openIncome={() => {
          incomePrefill = null;
          incomeModalOpen = true;
        }}
        on:openImport={() => (importModalOpen = true)}
      />
    </div>
  </div>

  <MovementsList
    movements={$finance?.movements ?? []}
    movementFilters={$finance?.movement_filters ?? []}
    on:edit={(e) => openEdit(e.detail.type, e.detail.id)}
    on:delete={(e) => handleDelete(e.detail.type, e.detail.id)}
  />

  <BottomNav active="inicio" />
</div>

<AiPreview
  preview={analysisPreview}
  accounts={$finance?.accounts ?? analysisPreview?.accounts ?? []}
  categories={$finance?.categories ?? []}
  on:confirmed={onPreviewConfirmed}
  on:cancelled={clearPreview}
/>

<EditModal
  bind:open={editOpen}
  recordType={editType}
  record={editRecord}
  accounts={$finance?.accounts ?? []}
  categories={$finance?.categories ?? []}
  investmentAssets={$finance?.investment_assets ?? []}
  goals={$finance?.goals ?? []}
  on:close={closeEdit}
  on:saved={closeEdit}
  on:deleted={closeEdit}
/>

<ManualEntryModals
  bind:expenseOpen={expenseModalOpen}
  bind:incomeOpen={incomeModalOpen}
  bind:incomePrefill
  accounts={$finance?.accounts ?? []}
  categories={$finance?.categories ?? []}
/>

<FinanceBulkImportModal
  bind:open={importModalOpen}
  on:refreshed={refreshFinanceData}
/>

<style>
  .finance-loading {
    margin: 0 0 1rem;
    padding: 0.75rem 1rem;
    color: var(--text-muted);
    font-size: 0.92rem;
  }

  .finance-loading--error {
    color: var(--danger, #b42318);
  }

  .finance-loading .linkish {
    margin-left: 0.35rem;
    background: none;
    border: none;
    padding: 0;
    color: inherit;
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
  }

  .onboarding-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.85rem;
    margin: 0 0 1.1rem;
    padding: 1rem 1.15rem;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-soft);
    background: rgba(255, 255, 255, 0.9);
    box-shadow: var(--shadow-soft);
  }

  .onboarding-banner strong {
    display: block;
    margin-bottom: 0.2rem;
  }

  .onboarding-banner p {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .onboarding-banner__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .onboarding-banner__cta {
    display: inline-flex;
    align-items: center;
    padding: 0.6rem 1rem;
    border-radius: var(--radius-sm);
    border: none;
    background: var(--text-strong);
    color: #fff;
    font: inherit;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    transition: transform 140ms var(--ease-out);
  }

  .onboarding-banner__ghost {
    display: inline-flex;
    align-items: center;
    padding: 0.6rem 1rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-soft);
    background: var(--surface);
    color: var(--text-strong);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: transform 140ms var(--ease-out);
  }

  .onboarding-banner__cta:active,
  .onboarding-banner__ghost:active {
    transform: scale(0.97);
  }

  .onboarding-banner__cta:disabled,
  .onboarding-banner__ghost:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
