<script lang="ts">
  import { onMount } from 'svelte';
  import HeaderIsland from '@common/molecules/HeaderIsland.svelte';
  import InvestmentActionBar from '@features/inversiones/components/molecules/InvestmentActionBar.svelte';
  import InvestmentInsights from '@features/inversiones/components/molecules/InvestmentInsights.svelte';
  import InvestmentCharts from '@features/inversiones/components/organisms/InvestmentCharts.svelte';
  import InvestmentLedger from '@features/inversiones/components/organisms/InvestmentLedger.svelte';
  import InvestmentCsvImportModal from '@features/inversiones/components/molecules/InvestmentCsvImportModal.svelte';
  import InvestmentOcrModal from '@features/inversiones/components/molecules/InvestmentOcrModal.svelte';
  import InvestmentExportModal from '@features/inversiones/components/molecules/InvestmentExportModal.svelte';
  import InvestmentNewRowModal from '@features/inversiones/components/molecules/InvestmentNewRowModal.svelte';
  import EditModal from '@common/organisms/EditModal.svelte';
  import SettingsPanel from '@common/organisms/SettingsPanel.svelte';
  import { deleteInvestment, fetchPortfolioInsights } from '@common/lib/api';
  import { applyFinancePayload, finance, refreshFinanceData } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import type {
    Account,
    EditRecordType,
    ExpenseRecord,
    InvestmentRecord,
    NoteRecord,
    PortfolioInsights,
  } from '@common/lib/types';

  let settingsOpen = false;
  let editOpen = false;
  let editType: EditRecordType | null = null;
  let editRecord: Account | ExpenseRecord | InvestmentRecord | NoteRecord | null = null;

  let csvModalOpen = false;
  let ocrModalOpen = false;
  let exportModalOpen = false;
  let newRowModalOpen = false;
  let chartAssetFilter = '';

  let portfolioInsights: PortfolioInsights | null = null;
  let portfolioLoading = false;

  $: investments = $finance?.investments ?? [];

  onMount(() => {
    refreshFinanceData().catch(() => showToast('No se pudo cargar los datos', { type: 'error' }));
    refreshPortfolioInsights();
  });

  async function refreshPortfolioInsights() {
    portfolioLoading = true;
    try {
      portfolioInsights = await fetchPortfolioInsights();
    } catch {
      portfolioInsights = null;
    } finally {
      portfolioLoading = false;
    }
  }

  function findRecord(type: string, id: string) {
    const data = $finance;
    if (!data) return null;
    if (type === 'investment') return data.investments.find((r) => r.id === id) || null;
    return null;
  }

  function openEdit(type: string, id: string) {
    const record = findRecord(type, id);
    if (!record) {
      showToast('Registro no encontrado');
      return;
    }
    editType = type as EditRecordType;
    editRecord = record as InvestmentRecord;
    editOpen = true;
  }

  async function handleDelete(type: string, id: string) {
    if (type !== 'investment') return;
    if (!confirm('¿Eliminar esta inversión?')) return;
    try {
      const data = await deleteInvestment(id);
      applyFinancePayload(data);
      showToast('Eliminado', { type: 'success' });
      refreshPortfolioInsights();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al eliminar', { type: 'error' });
    }
  }

  function closeEdit() {
    editOpen = false;
    editType = null;
    editRecord = null;
  }

  function onEditSaved() {
    closeEdit();
    refreshPortfolioInsights();
  }

  function scrollToLedger() {
    document.getElementById('libro-inversiones')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openNewRow() {
    newRowModalOpen = true;
  }

  function onChartFilter(e: CustomEvent<{ asset: string }>) {
    chartAssetFilter = e.detail.asset;
    if (e.detail.asset) scrollToLedger();
  }

  function onDataRefreshed() {
    refreshFinanceData();
    refreshPortfolioInsights();
  }
</script>

<div class="app-shell">
  <HeaderIsland summary={$finance?.summary ?? null} on:openSettings={() => (settingsOpen = true)} />

  <div class="investments-page-top">
    <section class="investments-hero section">
      <h1 class="investments-hero__title">Inversiones</h1>
      <p class="investments-hero__subtitle">Libro de operaciones, análisis visual e importación rápida.</p>
      <InvestmentInsights insights={portfolioInsights} loading={portfolioLoading} />
    </section>

    <InvestmentActionBar
      on:importCsv={() => (csvModalOpen = true)}
      on:ocr={() => (ocrModalOpen = true)}
      on:export={() => (exportModalOpen = true)}
      on:newRow={openNewRow}
    />
  </div>

  <div class="investments-layout">
    <InvestmentCharts {investments} on:filterAsset={onChartFilter} />

    <InvestmentLedger
      {investments}
      assetFilter={chartAssetFilter}
      on:edit={(e) => openEdit(e.detail.type, e.detail.id)}
      on:newRow={openNewRow}
      on:refreshed={onDataRefreshed}
    />
  </div>

  <nav class="bottom-nav" aria-label="Navegación principal">
    <a href="/" class="bottom-nav__item">
      <span class="bottom-nav__icon" aria-hidden="true">⌂</span>
      Inicio
    </a>
    <a href="/inversiones" class="bottom-nav__item is-active">
      <span class="bottom-nav__icon" aria-hidden="true">📈</span>
      Inversiones
    </a>
    <a href="/#movimientos" class="bottom-nav__item">
      <span class="bottom-nav__icon" aria-hidden="true">≡</span>
      Movimientos
    </a>
    <a href="/#registrar" class="bottom-nav__item">
      <span class="bottom-nav__icon" aria-hidden="true">+</span>
      Registrar
    </a>
  </nav>
</div>

<SettingsPanel bind:open={settingsOpen} categories={$finance?.categories ?? []} />

<EditModal
  bind:open={editOpen}
  recordType={editType}
  record={editRecord}
  accounts={$finance?.accounts ?? []}
  categories={$finance?.categories ?? []}
  investmentAssets={$finance?.investment_assets ?? []}
  on:close={closeEdit}
  on:saved={onEditSaved}
  on:deleted={onEditSaved}
/>

<InvestmentCsvImportModal bind:open={csvModalOpen} on:refreshed={onDataRefreshed} />

<InvestmentOcrModal bind:open={ocrModalOpen} on:refreshed={onDataRefreshed} />

<InvestmentExportModal bind:open={exportModalOpen} />

<InvestmentNewRowModal bind:open={newRowModalOpen} on:refreshed={onDataRefreshed} />
