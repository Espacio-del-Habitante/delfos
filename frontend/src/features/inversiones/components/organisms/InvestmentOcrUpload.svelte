<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ApiError, confirmOcrRows, ocrInvestmentImage } from '@common/lib/api';
  import { applyFinancePayload, finance } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import IconCamera from '@common/atoms/icons/IconCamera.svelte';
  import Dropzone from '@common/molecules/Dropzone.svelte';
  import InvestmentOcrReviewForm from '@features/inversiones/components/organisms/InvestmentOcrReviewForm.svelte';
  import type { InvestmentLedgerRow } from '@common/lib/types';

  const dispatch = createEventDispatcher<{ refreshed: void }>();

  export let embedded = false;

  let scanning = false;
  let confirming = false;
  let previewUrl: string | null = null;
  let rows: InvestmentLedgerRow[] = [];
  let warnings: string[] = [];

  $: investmentAssets = $finance?.investment_assets ?? [];

  function resetPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    rows = [];
    warnings = [];
  }

  async function processFile(file: File) {
    resetPreview();
    previewUrl = URL.createObjectURL(file);
    scanning = true;
    try {
      const data = await ocrInvestmentImage(file);
      rows = data.rows || [];
      warnings = data.warnings || [];
      if (!rows.length) {
        showToast('No se detectaron filas en la imagen', { type: 'info' });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        showToast(
          err.message.includes('ollama pull')
            ? err.message
            : `${err.message}. Instala un modelo de visión: ollama pull llava`,
          { type: 'error', duration: 8000 },
        );
      } else {
        showToast(err instanceof Error ? err.message : 'Error en OCR', { type: 'error' });
      }
      resetPreview();
    } finally {
      scanning = false;
    }
  }

  function onReject(reason: string) {
    showToast(reason === 'size' ? 'La imagen supera 5 MB' : 'Selecciona una imagen PNG, JPG o WEBP', {
      type: 'error',
    });
  }

  async function confirmRows(confirmedRows: InvestmentLedgerRow[]) {
    if (!confirmedRows.length) return;
    confirming = true;
    try {
      const data = await confirmOcrRows(confirmedRows);
      applyFinancePayload(data);
      resetPreview();
      dispatch('refreshed');
      const count = data.saved ?? confirmedRows.length;
      showToast(`${count} fila${count !== 1 ? 's' : ''} guardada${count !== 1 ? 's' : ''}`, { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al guardar filas', { type: 'error' });
    } finally {
      confirming = false;
    }
  }
</script>

{#if embedded}
  <Dropzone
    accept="image/png,image/jpeg,image/webp"
    maxSizeMb={5}
    on:file={(e) => processFile(e.detail)}
    on:reject={(e) => onReject(e.detail.reason)}
  >
    <IconCamera slot="icon" size={28} />
    <span slot="title">Subir pantallazo del broker</span>
    <span slot="hint">Arrastra una imagen o haz clic · PNG, JPG, WEBP · máx. 5 MB</span>
    {#if scanning}
      <p class="ledger-ocr__status">Analizando con visión IA…</p>
    {/if}
  </Dropzone>

  {#if rows.length && previewUrl}
    <InvestmentOcrReviewForm
      {rows}
      imageUrl={previewUrl}
      {warnings}
      assets={investmentAssets}
      on:confirm={(e) => confirmRows(e.detail)}
      on:discard={resetPreview}
    />
  {:else if previewUrl && !scanning}
    <p class="muted ledger-ocr__empty">Sin filas detectadas. Prueba otra captura o agrega filas manualmente.</p>
  {/if}
{:else}
<section class="ledger-ocr section" id="ocr-inversiones" aria-label="OCR de inversiones">
  <h2 class="card-title">OCR — pantallazo del broker</h2>

  <Dropzone
    accept="image/png,image/jpeg,image/webp"
    maxSizeMb={5}
    on:file={(e) => processFile(e.detail)}
    on:reject={(e) => onReject(e.detail.reason)}
  >
    <IconCamera slot="icon" size={28} />
    <span slot="title">Subir pantallazo del broker</span>
    <span slot="hint">Arrastra una imagen o haz clic · PNG, JPG, WEBP · máx. 5 MB</span>
    {#if scanning}
      <p class="ledger-ocr__status">Analizando con visión IA…</p>
    {/if}
  </Dropzone>

  {#if rows.length && previewUrl}
    <InvestmentOcrReviewForm
      {rows}
      imageUrl={previewUrl}
      {warnings}
      assets={investmentAssets}
      on:confirm={(e) => confirmRows(e.detail)}
      on:discard={resetPreview}
    />
  {:else if previewUrl && !scanning}
    <p class="muted ledger-ocr__empty">Sin filas detectadas. Prueba otra captura o agrega filas manualmente.</p>
  {/if}
</section>
{/if}
