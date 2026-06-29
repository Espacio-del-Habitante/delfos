<script lang="ts">
  import { onMount } from 'svelte';
  import HeaderIsland from '@common/molecules/HeaderIsland.svelte';
  import SummaryCards from '@features/dashboard/components/organisms/SummaryCards.svelte';
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
  } from '@common/lib/api';
  import { applyFinancePayload, finance, refreshFinanceData } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import type {
    Account,
    AnalysisPreview,
    EditRecordType,
    ExpenseRecord,
    IncomeRecord,
    InvestmentRecord,
    NoteRecord,
  } from '@common/lib/types';

  let draftText = '';
  let analysisPreview: AnalysisPreview | null = null;

  let editOpen = false;
  let editType: EditRecordType | null = null;
  let editRecord: Account | ExpenseRecord | IncomeRecord | InvestmentRecord | NoteRecord | null = null;

  let expenseModalOpen = false;
  let incomeModalOpen = false;
  let importModalOpen = false;

  onMount(() => {
    refreshFinanceData().catch(() => showToast('No se pudo cargar los datos', { type: 'error' }));
  });

  function handleAnalyzed(e: CustomEvent<AnalysisPreview>) {
    analysisPreview = e.detail;
  }

  function clearPreview() {
    analysisPreview = null;
  }

  function onPreviewConfirmed() {
    analysisPreview = null;
    draftText = '';
    refreshFinanceData();
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
  <HeaderIsland summary={$finance?.summary ?? null} />

  <div class="dashboard-grid">
    <div class="dashboard-col-left" id="inicio">
      <SummaryCards summary={$finance?.summary ?? null} />
      <AccountsPanel
        accounts={$finance?.accounts ?? []}
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
        on:openIncome={() => (incomeModalOpen = true)}
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
  on:close={closeEdit}
  on:saved={closeEdit}
  on:deleted={closeEdit}
/>

<ManualEntryModals
  bind:expenseOpen={expenseModalOpen}
  bind:incomeOpen={incomeModalOpen}
  accounts={$finance?.accounts ?? []}
  categories={$finance?.categories ?? []}
/>

<FinanceBulkImportModal
  bind:open={importModalOpen}
  on:refreshed={refreshFinanceData}
/>
