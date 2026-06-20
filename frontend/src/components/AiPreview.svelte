<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CategorySelector from './CategorySelector.svelte';
  import CustomSelect from './CustomSelect.svelte';
  import { confirmAnalysis } from '@/lib/api';
  import { showToast } from '@/lib/toast';
  import { applyFinancePayload } from '@/stores/finance';
  import type { Account, AnalysisPreview, Category, ConfirmPayload, PreviewItem } from '@/lib/types';

  export let preview: AnalysisPreview | null = null;
  export let accounts: Account[] = [];
  export let categories: Category[] = [];

  const dispatch = createEventDispatcher<{ confirmed: void; cancelled: void }>();

  interface EditableItem extends PreviewItem {
    _index: number;
  }

  let items: EditableItem[] = [];
  let confirming = false;

  $: if (preview) {
    items = [
      ...(preview.expenses || []).map((i, idx) => ({ ...i, kind: 'expense' as const, _index: idx })),
      ...(preview.investments || []).map((i, idx) => ({
        ...i,
        kind: 'investment' as const,
        _index: (preview.expenses?.length || 0) + idx,
      })),
      ...(preview.notes || []).map((i, idx) => ({
        ...i,
        kind: 'note' as const,
        _index: (preview.expenses?.length || 0) + (preview.investments?.length || 0) + idx,
      })),
    ];
    if (!items.length && preview.items?.length) {
      items = preview.items.map((i, idx) => ({ ...i, _index: idx }));
    }
  } else {
    items = [];
  }

  $: accountOptions = [
    { value: '', label: 'Sin cuenta' },
    ...accounts.map((a) => ({ value: a.id, label: `${a.emoji} ${a.name}` })),
  ];

  $: visible = !!preview && (items.length > 0 || !!preview.error);

  function acceptSuggestion(item: EditableItem) {
    if (!item.suggested_new_category) return;
    item.accept_category_suggestion = true;
    item.category = item.suggested_new_category;
    items = [...items];
    showToast(`Categoría "${item.suggested_new_category}" aplicada`, { type: 'success' });
  }

  function ignoreSuggestion(item: EditableItem) {
    item.suggested_new_category = null;
    item.accept_category_suggestion = false;
    items = [...items];
  }

  function onCategoryChange(item: EditableItem, cat: { id?: string; name: string; emoji: string; isNew?: boolean }) {
    item.category = cat.name || item.category;
    item.category_emoji = cat.emoji || item.category_emoji;
    if (cat.isNew) {
      item.suggested_new_category = cat.name;
      item.accept_category_suggestion = true;
    }
    items = [...items];
  }

  function collectPayload(): ConfirmPayload {
    const result: ConfirmPayload = { expenses: [], investments: [], notes: [] };
    for (const item of items) {
      const base = {
        kind: item.kind,
        account_id: item.account_id || null,
        accept_category_suggestion: item.accept_category_suggestion || false,
        suggested_new_category: item.suggested_new_category || null,
      };
      if (item.kind === 'expense') {
        result.expenses!.push({
          ...base,
          amount: Number(item.amount) || 0,
          currency: item.currency || 'COP',
          category: item.category,
          category_emoji: item.category_emoji || '',
          description: item.description || '',
          payment_method: item.payment_method || '',
        });
      } else if (item.kind === 'investment') {
        result.investments!.push({
          ...base,
          amount: Number(item.amount) || 0,
          currency: item.currency || 'USD',
          asset: item.asset || '',
          asset_type: item.asset_type || 'ETF',
          action: item.action || 'buy',
          category: item.category,
          category_emoji: item.category_emoji || '📈',
          notes: item.description || item.text || '',
        });
      } else if (item.kind === 'note') {
        result.notes!.push({
          ...base,
          text: item.description || item.text || '',
          tags: item.tags || [],
        });
      }
    }
    return result;
  }

  async function confirm() {
    if (!items.length) return;
    confirming = true;
    try {
      const payload = collectPayload();
      const total =
        (payload.expenses?.length || 0) + (payload.investments?.length || 0) + (payload.notes?.length || 0);
      if (!total) return;
      const data = await confirmAnalysis(payload);
      applyFinancePayload(data);
      dispatch('confirmed');
      const saved = data.saved || {};
      const count = (saved.expenses || 0) + (saved.investments || 0) + (saved.notes || 0);
      showToast(`${count} movimiento${count !== 1 ? 's' : ''} guardado${count !== 1 ? 's' : ''}`, { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al guardar', { type: 'error' });
    } finally {
      confirming = false;
    }
  }

  function cancel() {
    dispatch('cancelled');
  }
</script>

<section
  class="preview-card section"
  id="ia-preview"
  aria-label="Previsualización IA"
  class:is-visible={visible}
  aria-hidden={visible ? 'false' : 'true'}
>
  <h2 class="card-title">Movimientos detectados</h2>

  {#if preview?.error}
    <p class="ai-unavailable">{preview.error}{preview.hint ? ` ${preview.hint}` : ''}</p>
  {/if}

  {#if items.length}
    <p class="preview-detected-title">
      Movimientos detectados ({preview?.counts?.total || items.length})
    </p>

    {#each ['expense', 'investment', 'note'] as groupKind}
      {@const groupItems = items.filter((i) => i.kind === groupKind)}
      {#if groupItems.length || groupKind === 'note'}
        <div class="preview-group">
          <h3 class="preview-group__title">
            {groupKind === 'expense' ? 'Gastos' : groupKind === 'investment' ? 'Inversiones' : 'Notas'}
            {#if groupItems.length}({groupItems.length}){/if}
          </h3>
          {#if !groupItems.length && groupKind === 'note'}
            <p class="muted" style="font-size:0.85rem;margin:0;">Sin notas detectadas</p>
          {/if}
          {#each groupItems as item (item._index)}
            <article class="preview-item preview-item--{item.kind}" data-index={item._index}>
              <div class="preview-item__header">
                <span class="preview-item__emoji">
                  {item.category_emoji || (item.kind === 'note' ? '📝' : item.kind === 'investment' ? '📈' : '💸')}
                </span>
                <p class="preview-item__type">
                  {item.title || item.kind}
                  {#if item.needs_review}
                    <span class="review-badge">{item.kind === 'investment' ? 'Revisar activo' : 'Revisar monto'}</span>
                  {/if}
                </p>
              </div>
              <div class="preview-item__fields">
                <label>
                  Cuenta
                  <CustomSelect
                    options={accountOptions}
                    bind:value={item.account_id}
                    on:change={(e) => { item.account_id = e.detail.value || null; }}
                  />
                </label>
                {#if item.account_name_hint}
                  <p class="account-detected">Cuenta detectada: {item.account_name_hint}</p>
                {/if}
                {#if item.kind === 'expense' || item.kind === 'investment'}
                  <div class="preview-item__row">
                    <label>
                      Monto
                      <input type="number" class="preview-amount" bind:value={item.amount} min="0" step="0.01" />
                    </label>
                    <label>
                      Moneda
                      <select class="preview-currency" bind:value={item.currency}>
                        <option value="COP">COP</option>
                        <option value="USD">USD</option>
                      </select>
                    </label>
                  </div>
                  <div class="preview-item__row preview-item__category-row">
                    <label class="preview-item__category-label">
                      Categoría
                      <CategorySelector
                        {categories}
                        kind={item.kind === 'investment' ? 'investment' : 'expense'}
                        selected={{ name: item.category, emoji: item.category_emoji }}
                        on:change={(e) => onCategoryChange(item, e.detail)}
                      />
                    </label>
                  </div>
                {/if}
                {#if item.kind === 'expense'}
                  <label class="preview-payment">
                    Método de pago
                    <input type="text" bind:value={item.payment_method} />
                  </label>
                {/if}
                {#if item.kind === 'investment'}
                  <label>
                    Activo
                    <input type="text" class="preview-asset" bind:value={item.asset} />
                  </label>
                {/if}
                <label>
                  Descripción
                  <textarea class="preview-desc" rows="2" bind:value={item.description}></textarea>
                </label>
                {#if item.suggested_new_category && item.suggested_new_category !== item.category}
                  <div class="preview-category-suggested category-suggestion">
                    <div class="category-suggestion__header">
                      <span class="category-suggestion__badge">Sugerencia IA</span>
                      <span>Categoría actual: <strong>{item.category || '—'}</strong></span>
                      <span>→ <strong>{item.suggested_new_category}</strong></span>
                    </div>
                    <div class="category-suggestion__actions">
                      <button type="button" class="category-suggestion__btn category-suggestion__btn--use" on:click={() => acceptSuggestion(item)}>Usar</button>
                      <button type="button" class="category-suggestion__btn" on:click={() => ignoreSuggestion(item)}>Ignorar</button>
                    </div>
                  </div>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {/if}
    {/each}
  {/if}

  {#if preview?.reflection}
    <p class="preview-reflection">{preview.reflection}</p>
  {/if}

  {#if items.length}
    <div class="preview-card__actions">
      <button type="button" class="primary-button" disabled={confirming} on:click={confirm}>
        {confirming ? 'Guardando…' : 'Confirmar y guardar'}
      </button>
      <button type="button" class="secondary-button" on:click={cancel}>Cancelar</button>
    </div>
  {/if}
</section>
