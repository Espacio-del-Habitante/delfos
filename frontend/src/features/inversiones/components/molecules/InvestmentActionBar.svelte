<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import IconUpload from '@common/atoms/icons/IconUpload.svelte';
  import IconCamera from '@common/atoms/icons/IconCamera.svelte';
  import IconDownload from '@common/atoms/icons/IconDownload.svelte';
  import IconPlus from '@common/atoms/icons/IconPlus.svelte';

  const dispatch = createEventDispatcher<{
    importCsv: void;
    ocr: void;
    export: void;
    newRow: void;
  }>();
</script>

<section class="investment-actions section" aria-label="Acciones de inversiones">
  <div class="action-bar" role="toolbar" aria-label="Acciones rápidas">
    <button type="button" class="action-bar__btn" on:click={() => dispatch('importCsv')}>
      <span class="action-bar__icon" aria-hidden="true"><IconUpload size={18} /></span>
      <span class="action-bar__label">Importar CSV</span>
    </button>

    <button type="button" class="action-bar__btn" on:click={() => dispatch('ocr')}>
      <span class="action-bar__icon" aria-hidden="true"><IconCamera size={18} /></span>
      <span class="action-bar__label">OCR pantallazo</span>
    </button>

    <button type="button" class="action-bar__btn" on:click={() => dispatch('export')}>
      <span class="action-bar__icon" aria-hidden="true"><IconDownload size={18} /></span>
      <span class="action-bar__label">Exportar</span>
    </button>

    <button type="button" class="action-bar__btn" on:click={() => dispatch('newRow')}>
      <span class="action-bar__icon" aria-hidden="true"><IconPlus size={18} /></span>
      <span class="action-bar__label">Nueva fila</span>
    </button>
  </div>
</section>
