<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Modal from '@common/atoms/Modal.svelte';
  import Dropzone from '@common/molecules/Dropzone.svelte';
  import { importCsvBulk } from '@common/lib/api';
  import { applyFinancePayload } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import IconDownload from '@common/atoms/icons/IconDownload.svelte';
  import IconCheck from '@common/atoms/icons/IconCheck.svelte';
  import IconX from '@common/atoms/icons/IconX.svelte';
  import type { ImportPreviewResponse } from '@common/lib/types';

  export let open = false;

  const dispatch = createEventDispatcher<{ refreshed: void; close: void }>();

  const hint =
    'Tipo de Operación, Fecha, Activo, Cantidad, Monto USD, Monto COP, Precio unitario, Costo cierre, P/G USD, Total';

  let importing = false;
  let importPreview: ImportPreviewResponse | null = null;
  let pendingFile: File | null = null;

  function close() {
    open = false;
    cancelImport();
    dispatch('close');
  }

  async function processFile(file: File) {
    importing = true;
    importPreview = null;
    pendingFile = file;
    try {
      const data = await importCsvBulk('investments', file, false);
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

  function onReject() {
    showToast('Selecciona un archivo CSV', { type: 'error' });
  }

  async function confirmImport() {
    if (!pendingFile) return;
    importing = true;
    try {
      const data = await importCsvBulk('investments', pendingFile, true);
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
</script>

<Modal bind:open title="Importar inversiones (CSV)" onClose={close}>
  <div class="bulk-import-panel bulk-import-panel--modal">
    <p class="bulk-import-panel__subtitle investment-actions__export-hint">
      Solo libro de inversiones. Columnas esperadas: {hint}
    </p>

    <Dropzone
      class="bulk-import-panel__dropzone"
      accept=".csv,text/csv"
      on:file={(e) => processFile(e.detail)}
      on:reject={onReject}
    >
      <IconDownload slot="icon" size={28} />
      <span slot="title">
        {importing && !importPreview ? 'Leyendo CSV…' : 'Arrastra tu CSV aquí o haz clic'}
      </span>
      <span slot="hint">{hint}</span>
    </Dropzone>

    {#if importPreview?.count}
      <div class="ledger-import-preview bulk-import-panel__preview">
        <p class="ledger-import-preview__text">
          {importPreview.count} fila{importPreview.count !== 1 ? 's' : ''} lista{importPreview.count !== 1
            ? 's'
            : ''} para importar.
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
