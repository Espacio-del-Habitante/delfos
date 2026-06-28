<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Modal from '@common/atoms/Modal.svelte';
  import { exportInvestmentsCsv, exportInvestmentsXlsx } from '@common/lib/api';
  import { showToast } from '@common/lib/toast';
  import IconFileCsv from '@common/atoms/icons/IconFileCsv.svelte';
  import IconFileExcel from '@common/atoms/icons/IconFileExcel.svelte';

  export let open = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  let exportBusy: 'csv' | 'xlsx' | null = null;

  function close() {
    open = false;
    dispatch('close');
  }

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
      close();
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
      close();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al exportar Excel', { type: 'error' });
    } finally {
      exportBusy = null;
    }
  }
</script>

<Modal bind:open title="Exportar inversiones" narrow onClose={close}>
  <p class="muted investment-actions__export-hint">
    Descarga el libro de inversiones completo en el formato que prefieras.
  </p>

  <div class="investment-export-modal__actions">
    <button
      type="button"
      class="secondary-button icon-button investment-export-modal__btn"
      disabled={exportBusy === 'csv'}
      on:click={downloadCsv}
    >
      <IconFileCsv size={20} />
      {exportBusy === 'csv' ? 'Descargando…' : 'Descargar CSV'}
    </button>
    <button
      type="button"
      class="secondary-button icon-button investment-export-modal__btn"
      disabled={exportBusy === 'xlsx'}
      on:click={downloadXlsx}
    >
      <IconFileExcel size={20} />
      {exportBusy === 'xlsx' ? 'Descargando…' : 'Descargar Excel'}
    </button>
  </div>

  <div slot="footer" class="modal__actions modal__actions-right">
    <button type="button" class="ghost-button" on:click={close}>Cerrar</button>
  </div>
</Modal>
