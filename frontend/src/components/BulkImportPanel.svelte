<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    exportInvestmentsCsv,
    exportInvestmentsXlsx,
    importCsvBulk,
  } from '@/lib/api';
  import { applyFinancePayload } from '@/stores/finance';
  import { showToast } from '@/lib/toast';
  import IconUpload from './icons/IconUpload.svelte';
  import IconDownload from './icons/IconDownload.svelte';
  import IconFileCsv from './icons/IconFileCsv.svelte';
  import IconFileExcel from './icons/IconFileExcel.svelte';
  import IconCheck from './icons/IconCheck.svelte';
  import IconX from './icons/IconX.svelte';
  import type { BulkImportKind, ImportPreviewResponse } from '@/lib/types';

  const dispatch = createEventDispatcher<{ refreshed: void }>();

  type Tab = BulkImportKind;

  const tabs: { id: Tab; label: string; hint: string; icon: string }[] = [
    {
      id: 'investments',
      label: 'Inversiones',
      hint: 'Tipo de Operación, Fecha, Activo, Cantidad, Monto USD…',
      icon: '📈',
    },
    {
      id: 'expenses',
      label: 'Gastos',
      hint: 'Fecha, Cuenta, Monto, Moneda, Categoría, Emoji, Descripción, Método de pago',
      icon: '💸',
    },
    {
      id: 'notes',
      label: 'Notas',
      hint: 'Fecha, Cuenta, Texto, Tags',
      icon: '📝',
    },
  ];

  let activeTab: Tab = 'investments';
  let dragOver = false;
  let importing = false;
  let exportBusy: 'csv' | 'xlsx' | null = null;
  let importPreview: ImportPreviewResponse | null = null;
  let pendingFile: File | null = null;
  let fileInput: HTMLInputElement;

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadCsv() {
    exportBusy = 'csv';
    try {
      const blob = await exportInvestmentsCsv();
      downloadBlob(blob, 'inversiones.csv');
      showToast('CSV descargado', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al exportar CSV', { type: 'error' });
    } finally {
      exportBusy = null;
    }
  }

  async function downloadXlsx() {
    exportBusy = 'xlsx';
    try {
      const blob = await exportInvestmentsXlsx();
      downloadBlob(blob, 'inversiones.xlsx');
      showToast('Excel descargado', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al exportar Excel', { type: 'error' });
    } finally {
      exportBusy = null;
    }
  }

  function switchTab(tab: Tab) {
    if (tab === activeTab) return;
    activeTab = tab;
    cancelImport();
  }

  function openPicker() {
    fileInput?.click();
  }

  async function processFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      showToast('Selecciona un archivo CSV', { type: 'error' });
      return;
    }

    importing = true;
    importPreview = null;
    pendingFile = file;
    try {
      const data = await importCsvBulk(activeTab, file, false);
      importPreview = {
        preview: data.preview || data.rows,
        count: data.count ?? (data.preview || data.rows)?.length ?? 0,
        warnings: data.warnings,
      };
      if (!importPreview.count) {
        showToast('No se encontraron filas en el CSV', { type: 'info' });
        pendingFile = null;
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al leer CSV', { type: 'error' });
      pendingFile = null;
    } finally {
      importing = false;
    }
  }

  function onFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (file) processFile(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) processFile(file);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function onDragLeave() {
    dragOver = false;
  }

  async function confirmImport() {
    if (!pendingFile) return;
    importing = true;
    try {
      const data = await importCsvBulk(activeTab, pendingFile, true);
      applyFinancePayload(data);
      importPreview = null;
      pendingFile = null;
      dispatch('refreshed');
      showToast('Importación completada', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al importar', { type: 'error' });
    } finally {
      importing = false;
    }
  }

  function cancelImport() {
    importPreview = null;
    pendingFile = null;
  }

  function previewColumns(rows: Record<string, unknown>[]): string[] {
    if (!rows.length) return [];
    const keys = Object.keys(rows[0]).filter((k) => !k.startsWith('_'));
    return keys.slice(0, 8);
  }

  function cellValue(row: Record<string, unknown>, key: string): string {
    const val = row[key];
    if (val == null || val === '') return '—';
    if (Array.isArray(val)) return val.join(', ');
    return String(val);
  }

  $: previewRows = (importPreview?.preview || importPreview?.rows || []) as Record<string, unknown>[];
  $: columns = previewColumns(previewRows);
  $: activeHint = tabs.find((t) => t.id === activeTab)?.hint ?? '';
</script>

<section class="bulk-import-panel section" id="importar-csv">
  <div class="bulk-import-panel__header">
    <h2 class="card-title">
      <span class="bulk-import-panel__title-icon" aria-hidden="true"><IconUpload size={22} /></span>
      Importar CSV
    </h2>
    <p class="bulk-import-panel__subtitle">Carga masiva rápida con vista previa antes de confirmar.</p>
  </div>

  <div class="bulk-import-panel__tabs" role="tablist" aria-label="Tipo de importación">
    {#each tabs as tab}
      <button
        type="button"
        role="tab"
        class="bulk-import-panel__tab"
        class:is-active={activeTab === tab.id}
        aria-selected={activeTab === tab.id}
        on:click={() => switchTab(tab.id)}
      >
        <span aria-hidden="true">{tab.icon}</span>
        {tab.label}
      </button>
    {/each}
  </div>

  {#if activeTab === 'investments'}
    <div class="bulk-import-panel__exports">
      <button
        type="button"
        class="secondary-button icon-button"
        disabled={exportBusy === 'csv'}
        on:click={downloadCsv}
      >
        <IconFileCsv size={18} />
        {exportBusy === 'csv' ? 'Descargando…' : 'Descargar CSV'}
      </button>
      <button
        type="button"
        class="secondary-button icon-button"
        disabled={exportBusy === 'xlsx'}
        on:click={downloadXlsx}
      >
        <IconFileExcel size={18} />
        {exportBusy === 'xlsx' ? 'Descargando…' : 'Descargar Excel'}
      </button>
    </div>
  {/if}

  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="ledger-ocr__dropzone bulk-import-panel__dropzone"
    class:is-dragover={dragOver}
    on:click={openPicker}
    on:drop={onDrop}
    on:dragover={onDragOver}
    on:dragleave={onDragLeave}
    on:keydown={(e) => e.key === 'Enter' && openPicker()}
    role="button"
    tabindex="0"
  >
    <span class="ledger-ocr__dropzone-icon" aria-hidden="true"><IconDownload size={28} /></span>
    <p class="ledger-ocr__dropzone-title">
      {importing && !importPreview ? 'Leyendo CSV…' : 'Arrastra tu CSV aquí o haz clic'}
    </p>
    <p class="ledger-ocr__dropzone-hint">{activeHint}</p>
  </div>

  <input
    bind:this={fileInput}
    type="file"
    accept=".csv,text/csv"
    class="sr-only"
    on:change={onFileChange}
  />

  {#if importPreview?.count}
    <div class="ledger-import-preview bulk-import-panel__preview">
      <p class="ledger-import-preview__text">
        {importPreview.count} fila{importPreview.count !== 1 ? 's' : ''} lista{importPreview.count !== 1 ? 's' : ''}
        para importar.
      </p>
      {#if importPreview.warnings?.length}
        <ul class="ledger-import-preview__warnings">
          {#each importPreview.warnings.slice(0, 8) as warning}
            <li>{warning}</li>
          {/each}
          {#if importPreview.warnings.length > 8}
            <li>… y {importPreview.warnings.length - 8} avisos más</li>
          {/if}
        </ul>
      {/if}

      {#if previewRows.length}
        <div class="bulk-import-panel__table-wrap">
          <table class="bulk-import-panel__table">
            <thead>
              <tr>
                {#each columns as col}
                  <th>{col}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each previewRows.slice(0, 6) as row}
                <tr>
                  {#each columns as col}
                    <td>{cellValue(row, col)}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
          {#if previewRows.length > 6}
            <p class="bulk-import-panel__table-more">Mostrando 6 de {previewRows.length} filas</p>
          {/if}
        </div>
      {/if}

      <div class="ledger-import-preview__actions">
        <button type="button" class="primary-button icon-button" disabled={importing} on:click={confirmImport}>
          <IconCheck size={18} />
          {importing ? 'Importando…' : 'Confirmar importación'}
        </button>
        <button type="button" class="ghost-button icon-button" on:click={cancelImport}>
          <IconX size={18} />
          Cancelar
        </button>
      </div>
    </div>
  {/if}
</section>
