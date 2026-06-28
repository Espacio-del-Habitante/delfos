<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Modal from '@common/atoms/Modal.svelte';
  import { importCsvBulk } from '@common/lib/api';
  import { applyFinancePayload } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import IconDownload from '@common/atoms/icons/IconDownload.svelte';
  import IconCheck from '@common/atoms/icons/IconCheck.svelte';
  import IconX from '@common/atoms/icons/IconX.svelte';
  import type { FinanceBulkImportKind, ImportPreviewResponse } from '@common/lib/types';

  export let open = false;

  const dispatch = createEventDispatcher<{ refreshed: void; close: void }>();

  const tabs: { id: FinanceBulkImportKind; label: string; hint: string }[] = [
    {
      id: 'expenses',
      label: 'Gastos',
      hint: 'Fecha, Cuenta, Monto, Moneda, Categoría, Emoji, Descripción, Método de pago',
    },
    {
      id: 'incomes',
      label: 'Ingresos',
      hint: 'Fecha, Cuenta, Monto, Moneda, Categoría, Emoji, Descripción, Fuente',
    },
    {
      id: 'notes',
      label: 'Notas',
      hint: 'Fecha, Cuenta, Texto, Tags',
    },
  ];

  let activeTab: FinanceBulkImportKind = 'expenses';
  let dragOver = false;
  let importing = false;
  let importPreview: ImportPreviewResponse | null = null;
  let pendingFile: File | null = null;
  let fileInput: HTMLInputElement;

  function close() {
    open = false;
    cancelImport();
    dispatch('close');
  }

  function switchTab(tab: FinanceBulkImportKind) {
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
      close();
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

<Modal bind:open title="Importar CSV" onClose={close}>
  <div class="bulk-import-panel bulk-import-panel--modal">
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
          {tab.label}
        </button>
      {/each}
    </div>

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
  </div>

  <div slot="footer" class="modal__actions modal__actions-right">
    <button type="button" class="ghost-button" on:click={close}>Cerrar</button>
  </div>
</Modal>
