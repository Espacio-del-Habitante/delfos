<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ApiError, confirmOcrRows, ocrInvestmentImage } from '@common/lib/api';
  import { applyFinancePayload, finance } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import IconCamera from '@common/atoms/icons/IconCamera.svelte';
  import InvestmentOcrReviewForm from '@features/inversiones/components/organisms/InvestmentOcrReviewForm.svelte';
  import type { InvestmentLedgerRow } from '@common/lib/types';

  const dispatch = createEventDispatcher<{ refreshed: void }>();

  export let embedded = false;

  let dragOver = false;
  let scanning = false;
  let confirming = false;
  let previewUrl: string | null = null;
  let rows: InvestmentLedgerRow[] = [];
  let warnings: string[] = [];
  let fileInput: HTMLInputElement;

  $: investmentAssets = $finance?.investment_assets ?? [];

  function resetPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    rows = [];
    warnings = [];
  }

  function openPicker() {
    fileInput?.click();
  }

  async function processFile(file: File) {
    if (!file.type.startsWith('image/')) {
      showToast('Selecciona una imagen PNG, JPG o WEBP', { type: 'error' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('La imagen supera 5 MB', { type: 'error' });
      return;
    }

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
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="ledger-ocr__dropzone"
    class:is-dragover={dragOver}
    on:drop={onDrop}
    on:dragover={onDragOver}
    on:dragleave={onDragLeave}
    on:click={openPicker}
    role="button"
    tabindex="0"
    on:keydown={(e) => e.key === 'Enter' && openPicker()}
  >
    <span class="ledger-ocr__dropzone-icon" aria-hidden="true"><IconCamera size={28} /></span>
    <p class="ledger-ocr__dropzone-title">Subir pantallazo del broker</p>
    <p class="ledger-ocr__dropzone-hint">Arrastra una imagen o haz clic · PNG, JPG, WEBP · máx. 5 MB</p>
    {#if scanning}
      <p class="ledger-ocr__status">Analizando con visión IA…</p>
    {/if}
  </div>
  <input
    bind:this={fileInput}
    type="file"
    accept="image/png,image/jpeg,image/webp"
    class="sr-only"
    on:change={onFileChange}
  />

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

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="ledger-ocr__dropzone"
    class:is-dragover={dragOver}
    on:drop={onDrop}
    on:dragover={onDragOver}
    on:dragleave={onDragLeave}
    on:click={openPicker}
    role="button"
    tabindex="0"
    on:keydown={(e) => e.key === 'Enter' && openPicker()}
  >
    <span class="ledger-ocr__dropzone-icon" aria-hidden="true"><IconCamera size={28} /></span>
    <p class="ledger-ocr__dropzone-title">Subir pantallazo del broker</p>
    <p class="ledger-ocr__dropzone-hint">Arrastra una imagen o haz clic · PNG, JPG, WEBP · máx. 5 MB</p>
    {#if scanning}
      <p class="ledger-ocr__status">Analizando con visión IA…</p>
    {/if}
  </div>
  <input
    bind:this={fileInput}
    type="file"
    accept="image/png,image/jpeg,image/webp"
    class="sr-only"
    on:change={onFileChange}
  />

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
