<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { analyzeText, createNote } from '@/lib/api';
  import { applyFinancePayload } from '@/stores/finance';
  import { showToast } from '@/lib/toast';
  import type { AnalysisPreview } from '@/lib/types';

  export let text = '';

  const dispatch = createEventDispatcher<{
    analyzed: AnalysisPreview;
    clearPreview: void;
  }>();

  let analyzing = false;

  async function analyze() {
    const trimmed = text.trim();
    if (!trimmed) {
      showToast('Escribe algo para analizar');
      return;
    }
    analyzing = true;
    try {
      const data = await analyzeText(trimmed);
      if (data.error && !data.items?.length && !data.expenses?.length && !data.can_save_as_note) {
        showToast(data.error, { type: 'error' });
        if (data.ai_available === false) dispatch('analyzed', data);
        return;
      }
      if (data.can_save_as_note && data.notes?.length) {
        dispatch('analyzed', data);
        showToast('Clasificación parcial — puedes guardar como nota o editar');
        return;
      }
      const total = (data.items?.length ?? 0) + (data.expenses?.length ?? 0) + (data.investments?.length ?? 0) + (data.notes?.length ?? 0);
      if (!total) {
        showToast('No detecté movimientos claros. Intenta ser más específico o guarda como nota.');
        return;
      }
      dispatch('analyzed', data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delfos no pudo contactar el modelo local.', { type: 'error' });
    } finally {
      analyzing = false;
    }
  }

  async function saveNote() {
    const trimmed = text.trim();
    if (!trimmed) {
      showToast('Escribe una nota primero');
      return;
    }
    try {
      const data = await createNote(trimmed);
      text = '';
      applyFinancePayload(data);
      dispatch('clearPreview');
      showToast('Nota guardada', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al guardar', { type: 'error' });
    }
  }

  function clearText() {
    text = '';
    dispatch('clearPreview');
  }
</script>

<section class="quick-entry-card section" id="registrar" aria-label="Registro rápido">
  <h2 class="card-title">Registro rápido</h2>
  <label for="quick-text" class="sr-only">Describe tu movimiento</label>
  <textarea
    id="quick-text"
    bind:value={text}
    placeholder="Ej: Me gasté 45 mil en comida y compré 100 dólares de VOO."
    rows="5"
  ></textarea>
  <div class="quick-entry-card__actions">
    <button type="button" class="primary-button" disabled={analyzing} on:click={analyze}>
      {#if analyzing}
        Analizando…
      {:else}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v1a3 3 0 0 1-3 3h-1v1a4 4 0 0 1-8 0v-1H7a3 3 0 0 1-3-3v-1a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z" />
        </svg>
        Analizar con IA
      {/if}
    </button>
    <button type="button" class="secondary-button" on:click={saveNote}>Guardar nota</button>
    <button type="button" class="ghost-button" on:click={clearText}>Limpiar</button>
  </div>
</section>
