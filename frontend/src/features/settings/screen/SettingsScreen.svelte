<script lang="ts">
  import { onMount } from 'svelte';
  import HeaderIsland from '@common/molecules/HeaderIsland.svelte';
  import Modal from '@common/atoms/Modal.svelte';
  import EmojiPickerField from '@common/molecules/EmojiPickerField.svelte';
  import CustomSelect from '@common/molecules/CustomSelect.svelte';
  import BottomNav from '@common/molecules/BottomNav.svelte';
  import IconChevron from '@common/atoms/icons/IconChevron.svelte';
  import {
    createCategory,
    deleteCategory,
    getAiSettings,
    getQuoteSettings,
    resetData,
    saveAiSettings,
    saveQuoteSettings,
    testAiConnection,
    testQuoteSettings,
    updateCategory,
  } from '@common/lib/api';
  import { KIND_LABELS } from '@common/lib/categories';
  import { applyFinancePayload, finance, refreshFinanceData } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import type {
    AiHealthStatus,
    AiProviderId,
    AiProviderOption,
    AiSettings,
    AiSettingsPatch,
    Category,
    QuoteSettings,
    QuoteSettingsPatch,
    QuoteTestStatus,
    SelectOption,
  } from '@common/lib/types';

  $: categories = $finance?.categories ?? [];

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

  let quoteLoaded = false;
  let quoteLoading = false;
  let quoteSaving = false;
  let quoteTesting = false;
  let quoteTwelveKey = '';
  let quoteAlphaKey = '';
  let quoteHasTwelve = false;
  let quoteHasAlpha = false;
  let quoteMaskedTwelve = '';
  let quoteMaskedAlpha = '';
  let quoteBrokerRef = '';
  let quoteTestStatus: QuoteTestStatus | null = null;

  $: providerOptions = aiProviders.map<SelectOption>((p) => ({ value: p.id, label: p.label }));
  $: providerMeta = aiProviders.find((p) => p.id === aiProvider) ?? null;

  let resetOpen = false;
  let resetInput = '';
  let newName = '';
  let newKind = 'expense';
  let newEmoji = '🏷️';

  const kindOptions = [
    { value: 'expense', label: 'Gasto' },
    { value: 'investment', label: 'Inversión' },
    { value: 'note', label: 'Nota' },
    { value: 'general', label: 'General' },
  ];

  onMount(() => {
    refreshFinanceData().catch(() => showToast('No se pudo cargar los datos', { type: 'error' }));
    void loadAiSettings();
    void loadQuoteSettings();
  });

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
    if (aiLoading) return;
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

  function applyQuoteConfig(cfg: QuoteSettings) {
    quoteHasTwelve = cfg.has_twelve_data_key;
    quoteHasAlpha = cfg.has_alpha_vantage_key;
    quoteMaskedTwelve = cfg.masked_twelve_data_key;
    quoteMaskedAlpha = cfg.masked_alpha_vantage_key;
    quoteBrokerRef = cfg.broker_reference_total_usd != null ? String(cfg.broker_reference_total_usd) : '';
    quoteTwelveKey = '';
    quoteAlphaKey = '';
  }

  async function loadQuoteSettings() {
    if (quoteLoading) return;
    quoteLoading = true;
    try {
      const data = await getQuoteSettings();
      applyQuoteConfig(data.config);
      quoteLoaded = true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo cargar cotizaciones', { type: 'error' });
    } finally {
      quoteLoading = false;
    }
  }

  function buildQuotePatch(): QuoteSettingsPatch {
    const patch: QuoteSettingsPatch = {};
    if (quoteTwelveKey.trim()) patch.twelve_data_api_key = quoteTwelveKey.trim();
    if (quoteAlphaKey.trim()) patch.alpha_vantage_api_key = quoteAlphaKey.trim();
    const ref = quoteBrokerRef.trim();
    if (ref) {
      patch.broker_reference_total_usd = parseFloat(ref);
    } else {
      patch.broker_reference_total_usd = null;
    }
    return patch;
  }

  async function saveQuotes() {
    quoteSaving = true;
    try {
      const data = await saveQuoteSettings(buildQuotePatch());
      applyQuoteConfig(data.config);
      showToast('Configuración de cotizaciones guardada', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al guardar cotizaciones', { type: 'error' });
    } finally {
      quoteSaving = false;
    }
  }

  async function testQuotes() {
    quoteTesting = true;
    quoteTestStatus = null;
    try {
      quoteTestStatus = await testQuoteSettings(buildQuotePatch());
    } catch (err) {
      quoteTestStatus = { ok: false, error: err instanceof Error ? err.message : 'Error al probar cotizaciones' };
    } finally {
      quoteTesting = false;
    }
  }

  async function addCategory(e: Event) {
    e.preventDefault();
    try {
      const data = await createCategory({ name: newName.trim(), emoji: newEmoji, kind: newKind });
      applyFinancePayload(data);
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
      resetInput = '';
      showToast('Delfos restablecido', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al restablecer', { type: 'error' });
    }
  }
</script>

<div class="app-shell">
  <HeaderIsland summary={$finance?.summary ?? null} />

  <section class="settings-hero section">
    <div class="hero-titlebar">
      <a href="/" class="hero-back" aria-label="Volver al inicio"><IconChevron size={24} direction="left" /></a>
      <h1 class="settings-hero__title">Configuración</h1>
    </div>
    <p class="settings-hero__subtitle">
      Ajusta categorías, el motor de inteligencia artificial y administra tus datos. Las cuentas y
      movimientos se editan desde sus propias tarjetas.
    </p>
    <p class="settings-hero__subtitle">
      <a href="/perfil">Perfil financiero</a> — ingresos, metas y preferencias del asistente.
    </p>
  </section>

  <div class="settings-layout">
    <section class="settings-card" aria-label="Categorías">
      <header class="settings-card__head">
        <h2 class="settings-card__title">Categorías</h2>
        <p class="settings-card__hint">Organiza tus gastos, inversiones y notas con etiquetas reutilizables.</p>
      </header>

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

    <section class="settings-card" aria-label="Inteligencia artificial">
      <header class="settings-card__head">
        <h2 class="settings-card__title">Inteligencia artificial</h2>
        <p class="settings-card__hint">
          Elige el motor que analiza tus textos y hace OCR de inversiones. Usa Ollama local o un modelo en la nube.
        </p>
      </header>

      <div class="settings-tip" role="note">
        <span class="settings-tip__icon" aria-hidden="true">💡</span>
        <p class="settings-tip__text">
          <strong>¿Local o nube?</strong> Ollama local es privado y gratis, pero exige un equipo capaz. Si el OCR
          va lento o falla, activa un modelo en la nube.
        </p>
      </div>

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
              <span class="ai-field__help">La key se guarda en el backend y nunca se muestra completa. Formato típico: <code>sk-...</code> u <code>sk-or-...</code> según el proveedor.</span>
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
            <span class="ai-field__help">Debe ser un modelo <strong>multimodal</strong> (que acepte imágenes); si no, el OCR de capturas fallará.</span>
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

    <section class="settings-card" aria-label="Cotizaciones de mercado">
      <header class="settings-card__head">
        <h2 class="settings-card__title">Cotizaciones de mercado</h2>
        <p class="settings-card__hint">
          APIs opcionales para precios más precisos. Sin keys, Delfos usa yfinance automáticamente.
        </p>
      </header>

      {#if quoteLoading && !quoteLoaded}
        <p class="muted" style="font-size:0.85rem;margin:0;">Cargando configuración…</p>
      {:else}
        <div class="ai-field">
          <span class="ai-field__label">Twelve Data API key</span>
          <input
            type="password"
            class="form-control"
            bind:value={quoteTwelveKey}
            autocomplete="off"
            placeholder={quoteHasTwelve ? `Guardada (${quoteMaskedTwelve}). Pegar nueva key para reemplazar` : 'Opcional'}
          />
        </div>

        <div class="ai-field">
          <span class="ai-field__label">Alpha Vantage API key</span>
          <input
            type="password"
            class="form-control"
            bind:value={quoteAlphaKey}
            autocomplete="off"
            placeholder={quoteHasAlpha ? `Guardada (${quoteMaskedAlpha}). Pegar nueva key para reemplazar` : 'Opcional'}
          />
        </div>

        <div class="ai-field">
          <span class="ai-field__label">Total de referencia del broker (USD)</span>
          <input
            type="text"
            class="form-control"
            bind:value={quoteBrokerRef}
            inputmode="decimal"
            placeholder="Opcional — para comparar con tu balance en Delfos"
          />
        </div>

        <div class="ai-actions">
          <button type="button" class="secondary-button" on:click={testQuotes} disabled={quoteTesting}>
            {quoteTesting ? 'Probando…' : 'Probar conexión'}
          </button>
          <button type="button" class="secondary-button" on:click={saveQuotes} disabled={quoteSaving}>
            {quoteSaving ? 'Guardando…' : 'Guardar'}
          </button>
          {#if quoteTestStatus}
            <span class="ai-status-pill" class:is-ok={quoteTestStatus.ok} class:is-error={!quoteTestStatus.ok}>
              {quoteTestStatus.ok
                ? `OK · ${quoteTestStatus.provider ?? ''} ${quoteTestStatus.symbol ?? ''}`
                : quoteTestStatus.error || 'Error de conexión'}
            </span>
          {/if}
        </div>
      {/if}
    </section>

    <section class="settings-card settings-card--danger" aria-label="Zona de riesgo">
      <div class="danger-zone">
        <p class="danger-zone__label">Zona de riesgo</p>
        <p class="danger-zone__text">Elimina todas las cuentas, movimientos y notas. Esta acción no se puede deshacer.</p>
        <button type="button" class="danger-button" on:click={() => { resetOpen = true; resetInput = ''; }}>Restablecer Delfos</button>
      </div>
    </section>
  </div>

  <BottomNav active="ajustes" />
</div>

<Modal bind:open={resetOpen} title="Restablecer Delfos" narrow>
  <p class="danger-zone__text">Se borrarán todos los datos. Escribe <strong>RESTABLECER</strong> para confirmar.</p>
  <input type="text" class="form-control" bind:value={resetInput} placeholder="RESTABLECER" autocomplete="off" />
  <svelte:fragment slot="footer">
    <button type="button" class="secondary-button" on:click={() => (resetOpen = false)}>Cancelar</button>
    <button type="button" class="danger-button" disabled={resetInput.trim() !== 'RESTABLECER'} on:click={confirmReset}>Restablecer</button>
  </svelte:fragment>
</Modal>

<style>
  .settings-hero {
    margin-bottom: 24px;
  }

  .settings-hero__title {
    font-size: clamp(1.5rem, 2.5vw, 1.75rem);
    font-weight: 700;
    margin: 0;
    color: var(--text-strong);
    letter-spacing: -0.02em;
  }

  .settings-hero__subtitle {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.95rem;
    line-height: 1.45;
    max-width: 52ch;
  }

  .settings-layout {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
    gap: 20px;
    align-items: start;
  }

  .settings-card {
    padding: 22px;
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.88);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border: 1px solid rgba(255, 255, 255, 0.72);
    box-shadow: var(--shadow-soft);
  }

  .settings-card--danger {
    background: rgba(239, 68, 68, 0.04);
    border-color: rgba(239, 68, 68, 0.18);
  }

  .settings-card__head {
    margin-bottom: 16px;
  }

  .settings-card__title {
    margin: 0 0 6px;
    font-size: 1.02rem;
    font-weight: 700;
    color: var(--text-strong);
  }

  .settings-card__hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
    line-height: 1.45;
  }

  .settings-tip {
    display: flex;
    gap: 10px;
    padding: 12px 14px;
    margin-bottom: 16px;
    border-radius: var(--radius-sm);
    background: rgba(79, 70, 229, 0.06);
    border: 1px solid rgba(79, 70, 229, 0.16);
  }

  .settings-tip__icon {
    flex-shrink: 0;
    font-size: 1rem;
    line-height: 1.4;
  }

  .settings-tip__text {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--text-strong);
  }

  .ai-field__help {
    font-size: 0.76rem;
    color: var(--text-muted);
    line-height: 1.45;
  }

  .ai-field__help code {
    font-size: 0.72rem;
    padding: 1px 5px;
    border-radius: 6px;
    background: rgba(15, 23, 42, 0.06);
  }

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

  .danger-zone {
    border: none;
    background: transparent;
    padding: 0;
  }
</style>
