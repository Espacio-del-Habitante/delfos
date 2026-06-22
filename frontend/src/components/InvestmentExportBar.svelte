<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { exportInvestmentsCsv, exportInvestmentsXlsx } from '@/lib/api';
  import { showToast } from '@/lib/toast';

  const dispatch = createEventDispatcher<{ refreshed: void }>();

  let exportBusy: 'csv' | 'xlsx' | null = null;

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
</script>

<div class="ledger-export-bar">
  <div class="ledger-export-bar__actions">
    <button
      type="button"
      class="secondary-button"
      disabled={exportBusy === 'csv'}
      on:click={downloadCsv}
    >
      {exportBusy === 'csv' ? 'Descargando…' : 'Descargar CSV'}
    </button>
    <button
      type="button"
      class="secondary-button"
      disabled={exportBusy === 'xlsx'}
      on:click={downloadXlsx}
    >
      {exportBusy === 'xlsx' ? 'Descargando…' : 'Descargar Excel'}
    </button>
  </div>
</div>
