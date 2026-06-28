<script lang="ts">
  import EmojiPickerField from '@common/molecules/EmojiPickerField.svelte';
  import CustomSelect from '@common/molecules/CustomSelect.svelte';
  import {
    createCategory,
    deleteCategory,
    getAiSettings,
    resetData,
    saveAiSettings,
    testAiConnection,
    updateCategory,
  } from '@common/lib/api';
  import { KIND_LABELS } from '@common/lib/categories';
  import { applyFinancePayload } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import { createModalShellState, hideModalShell, showModalShell } from '@common/lib/modalShell';
  import type {
    AiHealthStatus,
    AiProviderId,
    AiProviderOption,
    AiSettings,
    AiSettingsPatch,
    Category,
    SelectOption,
  } from '@common/lib/types';

  export let open = false;
  export let categories: Category[] = [];

  let aiLoaded = false;
  let aiLoading = false;
  let aiSaving = false;
  let aiTesting = false;
  let aiProviders: AiProviderOption[] = [];
  let aiCloudEnabled = false;
  let aiProvider: AiProviderId = 'local';
  let aiTextModel = '';
  let aiVisionModel = '';
  let aiBaseUrl = '';
  let aiApiKey = '';
  let aiHasKey = false;
  let aiMaskedKey = '';
  let aiTestStatus: AiHealthStatus | null = null;

  $: if (open && !aiLoaded && !aiLoading) void loadAiSettings();
  $: providerOptions = aiProviders.map<SelectOption>((p) => ({ value: p.id, label: p.label }));
  $: providerMeta = aiProviders.find((p) => p.id === aiProvider) ?? null;

  function applyAiConfig(cfg: AiSettings) {
    aiCloudEnabled = cfg.cloud_enabled;
    aiProvider = cfg.provider;
    aiTextModel = cfg.text_model;
    aiVisionModel = cfg.vision_model;
    aiBaseUrl = cfg.base_url;
    aiHasKey = cfg.has_api_key;
    aiMaskedKey = cfg.masked_key;
    aiApiKey = '';
  }

  async function loadAiSettings() {
    aiLoading = true;
    try {
      const data = await getAiSettings();
      aiProviders = data.providers;
      applyAiConfig(data.config);
      aiLoaded = true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo cargar la configuración de IA', { type: 'error' });
    } finally {
      aiLoading = false;
    }
  }

  function onProviderChange(value: string) {
    aiProvider = value as AiProviderId;
    aiTestStatus = null;
    const meta = aiProviders.find((p) => p.id === aiProvider);
    if (meta) {
      if (!aiTextModel.trim() && meta.suggested_text_model) aiTextModel = meta.suggested_text_model;
      if (!aiVisionModel.trim() && meta.suggested_vision_model) aiVisionModel = meta.suggested_vision_model;
    }
  }

  function buildAiPatch(): AiSettingsPatch {
    const patch: AiSettingsPatch = {
      cloud_enabled: aiCloudEnabled,
      provider: aiProvider,
      text_model: aiTextModel.trim(),
      vision_model: aiVisionModel.trim(),
      base_url: aiBaseUrl.trim(),
    };
    if (aiApiKey.trim()) patch.api_key = aiApiKey.trim();
    return patch;
  }

  async function saveAi() {
    aiSaving = true;
    try {
      const data = await saveAiSettings(buildAiPatch());
      aiProviders = data.providers;
      applyAiConfig(data.config);
      showToast('Configuración de IA guardada', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al guardar la configuración de IA', { type: 'error' });
    } finally {
      aiSaving = false;
    }
  }

  async function testAi() {
    aiTesting = true;
    aiTestStatus = null;
    try {
      aiTestStatus = await testAiConnection(buildAiPatch());
    } catch (err) {
      aiTestStatus = { ok: false, error: err instanceof Error ? err.message : 'Error al probar la conexión' };
    } finally {
      aiTesting = false;
    }
  }

  let shell = createModalShellState();
  let resetShell = createModalShellState();
  let resetOpen = false;
  let resetInput = '';
  let newName = '';
  let newKind = 'expense';
  let newEmoji = '🏷️';

  $: syncSettingsOpen(open);
  $: syncResetOpen(resetOpen);

  function syncSettingsOpen(isOpen: boolean) {
    if (isOpen) {
      void showSettingsModal();
    } else if (shell.rendered && !shell.exiting) {
      void hideSettingsModal();
    }
  }

  function syncResetOpen(isOpen: boolean) {
    if (isOpen) {
      void showResetModal();
    } else if (resetShell.rendered && !resetShell.exiting) {
      void hideResetModal();
    }
  }

  async function showSettingsModal() {
    document.body.classList.add('modal-open');
    shell = { rendered: true, exiting: false, visible: false };
    shell = await showModalShell(shell);
  }

  async function hideSettingsModal() {
    shell = { ...shell, exiting: true, visible: false };
    shell = await hideModalShell(shell);
    if (!resetShell.rendered) document.body.classList.remove('modal-open');
  }

  async function showResetModal() {
    document.body.classList.add('modal-open');
    resetShell = { rendered: true, exiting: false, visible: false };
    resetShell = await showModalShell(resetShell);
  }

  async function hideResetModal() {
    resetShell = { ...resetShell, exiting: true, visible: false };
    resetShell = await hideModalShell(resetShell);
    if (!shell.rendered) document.body.classList.remove('modal-open');
  }

  const kindOptions = [
    { value: 'expense', label: 'Gasto' },
    { value: 'investment', label: 'Inversión' },
    { value: 'note', label: 'Nota' },
    { value: 'general', label: 'General' },
  ];

  function close() {
    open = false;
  }

  function onSettingsOverlay(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  async function addCategory(e: Event) {
    e.preventDefault();
    try {
      const data = await createCategory({ name: newName.trim(), emoji: newEmoji, kind: newKind });
      applyFinancePayload(data);
      categories = data.categories;
      newName = '';
      newEmoji = '🏷️';
      showToast('Categoría creada', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al crear categoría', { type: 'error' });
    }
  }

  async function editCategory(cat: Category) {
    const newNamePrompt = prompt('Nombre de categoría', cat.name);
    if (newNamePrompt === null) return;
    const trimmed = newNamePrompt.trim();
    if (!trimmed) {
      showToast('El nombre no puede estar vacío', { type: 'error' });
      return;
    }
    const newEmojiPrompt = prompt('Emoji', cat.emoji);
    if (newEmojiPrompt === null) return;
    try {
      const data = await updateCategory(cat.id, { name: trimmed, emoji: newEmojiPrompt.trim() || cat.emoji });
      applyFinancePayload(data);
      categories = data.categories;
      showToast('Categoría actualizada', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al actualizar', { type: 'error' });
    }
  }

  async function removeCategory(cat: Category) {
    if (!confirm(`¿Eliminar la categoría "${cat.name}"?`)) return;
    try {
      const data = await deleteCategory(cat.id);
      applyFinancePayload(data);
      categories = data.categories;
      showToast('Categoría eliminada', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al eliminar', { type: 'error' });
    }
  }

  async function confirmReset() {
    try {
      const data = await resetData();
      applyFinancePayload(data);
      resetOpen = false;
      open = false;
      resetInput = '';
      showToast('Delfos restablecido', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al restablecer', { type: 'error' });
    }
  }
</script>

{#if shell.rendered}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="modal-overlay"
    class:is-visible={shell.visible}
    class:is-exiting={shell.exiting}
    aria-hidden={!shell.visible}
    on:click={onSettingsOverlay}
  >
    <div
      class="modal"
      class:is-visible={shell.visible}
      class:is-exiting={shell.exiting}
      role="dialog"
      aria-labelledby="settings-modal-title"
      aria-modal="true"
    >
      <div class="modal__header">
        <h2 class="modal__title" id="settings-modal-title">Configuración</h2>
        <button type="button" class="modal__close" aria-label="Cerrar" on:click={close}>&times;</button>
      </div>
      <div class="modal__body modal__body--scroll">
        <p class="settings-intro">Ajustes de Delfos. Los cambios en cuentas y movimientos se gestionan desde sus tarjetas.</p>

        <section class="settings-section" aria-label="Categorías">
          <h3 class="settings-section__title">Categorías</h3>
          <p class="settings-section__hint">Organiza tus gastos, inversiones y notas con categorías reutilizables.</p>
          <div class="category-admin-list">
            {#if categories.length}
              {#each categories as cat (cat.id)}
                <div class="category-admin-item" data-category-id={cat.id}>
                  <span class="category-admin-item__emoji">{cat.emoji}</span>
                  <div class="category-admin-item__info">
                    <p class="category-admin-item__name">{cat.name}</p>
                    <p class="category-admin-item__kind">{KIND_LABELS[cat.kind] || cat.kind}</p>
                  </div>
                  <div class="category-admin-item__actions">
                    <button type="button" class="card-action-btn" on:click={() => editCategory(cat)}>Editar</button>
                    <button type="button" class="card-action-btn card-action-btn--danger" on:click={() => removeCategory(cat)}>Eliminar</button>
                  </div>
                </div>
              {/each}
            {:else}
              <p class="muted" style="font-size:0.85rem;margin:0;">Sin categorías. Agrega la primera abajo.</p>
            {/if}
          </div>
          <form class="category-admin-form" on:submit={addCategory}>
            <div class="category-admin-form__row">
              <input type="text" bind:value={newName} placeholder="Nueva categoría" required class="form-control" />
              <CustomSelect options={kindOptions} bind:value={newKind} />
            </div>
            <div class="category-admin-form__emoji">
              <EmojiPickerField value={newEmoji} ariaLabel="Emoji de categoría" on:change={(e) => (newEmoji = e.detail)} />
            </div>
            <button type="submit" class="secondary-button category-admin-form__submit">Agregar categoría</button>
          </form>
        </section>

        <section class="settings-section" aria-label="Inteligencia artificial">
          <h3 class="settings-section__title">Inteligencia artificial</h3>
          <p class="settings-section__hint">
            Elige el motor que analiza tus textos y hace OCR de inversiones. Usa Ollama local o un modelo en la nube si tu equipo no rinde.
          </p>

          {#if aiLoading && !aiLoaded}
            <p class="muted" style="font-size:0.85rem;margin:0;">Cargando configuración…</p>
          {:else}
            <label class="ai-switch">
              <input type="checkbox" bind:checked={aiCloudEnabled} on:change={() => (aiTestStatus = null)} />
              <span class="ai-switch__track" aria-hidden="true"><span class="ai-switch__thumb"></span></span>
              <span class="ai-switch__label">
                Habilitar modelo en la nube
                <span class="ai-switch__hint">Apagado = se usa Ollama local.</span>
              </span>
            </label>

            {#if aiCloudEnabled}
              <div class="ai-field">
                <span class="ai-field__label">Proveedor</span>
                <CustomSelect options={providerOptions} value={aiProvider} on:change={(e) => onProviderChange(e.detail.value)} />
              </div>

              {#if providerMeta?.needs_api_key}
                <div class="ai-field">
                  <span class="ai-field__label">API key</span>
                  <input
                    type="password"
                    class="form-control"
                    bind:value={aiApiKey}
                    autocomplete="off"
                    placeholder={aiHasKey ? `Guardada (${aiMaskedKey}). Pegar nueva key para reemplazar` : 'Pegar nueva key'}
                  />
                </div>
              {/if}

              {#if providerMeta?.needs_base_url}
                <div class="ai-field">
                  <span class="ai-field__label">Base URL</span>
                  <input
                    type="text"
                    class="form-control"
                    bind:value={aiBaseUrl}
                    autocomplete="off"
                    placeholder="https://openrouter.ai/api/v1"
                  />
                </div>
              {/if}

              <div class="ai-field">
                <span class="ai-field__label">Modelo de texto</span>
                <input
                  type="text"
                  class="form-control"
                  bind:value={aiTextModel}
                  autocomplete="off"
                  placeholder={providerMeta?.suggested_text_model || 'Modelo de texto'}
                />
              </div>

              <div class="ai-field">
                <span class="ai-field__label">Modelo de visión (OCR)</span>
                <input
                  type="text"
                  class="form-control"
                  bind:value={aiVisionModel}
                  autocomplete="off"
                  placeholder={providerMeta?.suggested_vision_model || 'Modelo de visión'}
                />
              </div>
            {/if}

            <div class="ai-actions">
              <button type="button" class="secondary-button" on:click={testAi} disabled={aiTesting}>
                {aiTesting ? 'Probando…' : 'Probar conexión'}
              </button>
              <button type="button" class="secondary-button" on:click={saveAi} disabled={aiSaving}>
                {aiSaving ? 'Guardando…' : 'Guardar'}
              </button>
              {#if aiTestStatus}
                <span class="ai-status-pill" class:is-ok={aiTestStatus.ok} class:is-error={!aiTestStatus.ok}>
                  {aiTestStatus.ok ? 'Conexión OK' : aiTestStatus.error || 'Error de conexión'}
                </span>
              {/if}
            </div>
            {#if aiTestStatus && !aiTestStatus.ok && aiTestStatus.hint}
              <p class="ai-status-hint">{aiTestStatus.hint}</p>
            {/if}
          {/if}
        </section>

        <div class="danger-zone">
          <p class="danger-zone__label">Zona de riesgo</p>
          <p class="danger-zone__text">Elimina todas las cuentas, movimientos y notas. Esta acción no se puede deshacer.</p>
          <button type="button" class="danger-button" on:click={() => { resetOpen = true; resetInput = ''; }}>Restablecer Delfos</button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if resetShell.rendered}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="modal-overlay"
    class:is-visible={resetShell.visible}
    class:is-exiting={resetShell.exiting}
    aria-hidden={!resetShell.visible}
    on:click={(e) => { if (e.target === e.currentTarget) resetOpen = false; }}
  >
    <div
      class="modal modal--narrow"
      class:is-visible={resetShell.visible}
      class:is-exiting={resetShell.exiting}
      role="dialog"
      aria-labelledby="reset-modal-title"
      aria-modal="true"
    >
      <div class="modal__header">
        <h2 class="modal__title" id="reset-modal-title">Restablecer Delfos</h2>
        <button type="button" class="modal__close" aria-label="Cerrar" on:click={() => (resetOpen = false)}>&times;</button>
      </div>
      <div class="modal__body">
        <p class="danger-zone__text">Se borrarán todos los datos. Escribe <strong>RESTABLECER</strong> para confirmar.</p>
        <input type="text" class="edit-form__input" bind:value={resetInput} placeholder="RESTABLECER" autocomplete="off" />
        <div class="modal__actions">
          <button type="button" class="secondary-button" on:click={() => (resetOpen = false)}>Cancelar</button>
          <button type="button" class="danger-button" disabled={resetInput.trim() !== 'RESTABLECER'} on:click={confirmReset}>Restablecer</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .ai-switch {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    cursor: pointer;
    margin-bottom: 14px;
  }

  .ai-switch input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .ai-switch__track {
    position: relative;
    flex: 0 0 auto;
    width: 42px;
    height: 24px;
    border-radius: 999px;
    background: rgba(120, 120, 128, 0.32);
    transition: background 0.2s ease;
    margin-top: 2px;
  }

  .ai-switch__thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: transform 0.2s ease;
  }

  .ai-switch input:checked + .ai-switch__track {
    background: #34c759;
  }

  .ai-switch input:checked + .ai-switch__track .ai-switch__thumb {
    transform: translateX(18px);
  }

  .ai-switch input:focus-visible + .ai-switch__track {
    outline: 2px solid rgba(52, 199, 89, 0.5);
    outline-offset: 2px;
  }

  .ai-switch__label {
    display: flex;
    flex-direction: column;
    font-size: 0.92rem;
    font-weight: 600;
    line-height: 1.3;
  }

  .ai-switch__hint {
    font-size: 0.78rem;
    font-weight: 400;
    opacity: 0.7;
  }

  .ai-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 12px;
  }

  .ai-field__label {
    font-size: 0.8rem;
    font-weight: 600;
    opacity: 0.8;
  }

  .ai-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 6px;
  }

  .ai-status-pill {
    display: inline-flex;
    align-items: center;
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 600;
    max-width: 100%;
  }

  .ai-status-pill.is-ok {
    background: rgba(52, 199, 89, 0.16);
    color: #1a7f37;
  }

  .ai-status-pill.is-error {
    background: rgba(255, 59, 48, 0.14);
    color: #c0392b;
  }

  .ai-status-hint {
    margin: 8px 0 0;
    font-size: 0.8rem;
    opacity: 0.75;
  }
</style>
