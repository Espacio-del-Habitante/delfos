<script lang="ts">
  import { onMount } from 'svelte';
  import HeaderIsland from './island/HeaderIsland.svelte';
  import BulkImportPanel from './BulkImportPanel.svelte';
  import InvestmentOcrUpload from './InvestmentOcrUpload.svelte';
  import InvestmentLedger from './InvestmentLedger.svelte';
  import EditModal from './EditModal.svelte';
  import SettingsPanel from './SettingsPanel.svelte';
  import { deleteInvestment } from '@/lib/api';
  import { applyFinancePayload, finance, refreshFinanceData } from '@/stores/finance';
  import { showToast } from '@/lib/toast';
  import type {
    Account,
    EditRecordType,
    ExpenseRecord,
    InvestmentRecord,
    NoteRecord,
  } from '@/lib/types';

  let settingsOpen = false;
  let editOpen = false;
  let editType: EditRecordType | null = null;
  let editRecord: Account | ExpenseRecord | InvestmentRecord | NoteRecord | null = null;

  $: investments = $finance?.investments ?? [];
  $: totalRows = investments.length;
  $: lastOperation = [...investments]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];

  onMount(() => {
    refreshFinanceData().catch(() => showToast('No se pudo cargar los datos', { type: 'error' }));
  });

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
  <HeaderIsland summary={$finance?.summary ?? null} on:openSettings={() => (settingsOpen = true)} />

  <section class="investments-hero section">
    <h1 class="investments-hero__title">Inversiones</h1>
    <p class="investments-hero__subtitle">Libro de operaciones, importación CSV y OCR de pantallazos.</p>
    <div class="investments-hero__stats">
      <div class="investments-hero__stat">
        <span class="investments-hero__stat-label">Filas registradas</span>
        <span class="investments-hero__stat-value">{totalRows}</span>
      </div>
      <div class="investments-hero__stat">
        <span class="investments-hero__stat-label">Última operación</span>
        <span class="investments-hero__stat-value">
          {#if lastOperation}
            {lastOperation.date || '—'} · {lastOperation.asset || lastOperation.operation_type || '—'}
          {:else}
            —
          {/if}
        </span>
      </div>
    </div>
  </section>

  <div class="dashboard-grid">
    <BulkImportPanel on:refreshed={refreshFinanceData} />
    <InvestmentOcrUpload on:refreshed={refreshFinanceData} />
    <InvestmentLedger
      investments={investments}
      on:edit={(e) => openEdit(e.detail.type, e.detail.id)}
      on:refreshed={refreshFinanceData}
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
  on:close={closeEdit}
  on:saved={closeEdit}
  on:deleted={closeEdit}
/>
