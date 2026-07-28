<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CategorySelector from '@common/molecules/CategorySelector.svelte';
  import CustomSelect from '@common/molecules/CustomSelect.svelte';
  import MoneyInput from '@common/molecules/MoneyInput.svelte';
  import { confirmAnalysis } from '@common/lib/api';
  import { showToast } from '@common/lib/toast';
  import { applyFinancePayload } from '@common/stores/finance';
  import type { Account, AnalysisPreview, Category, ConfirmPayload, PreviewItem } from '@common/lib/types';
  import Modal from '@common/atoms/Modal.svelte';
  import CategoryCreateForm from '@common/organisms/CategoryCreateForm.svelte';

  export let preview: AnalysisPreview | null = null;
  export let accounts: Account[] = [];
  export let categories: Category[] = [];

  const dispatch = createEventDispatcher<{ confirmed: void; cancelled: void }>();
  const categoryFormId = 'aipreview-category-form';

  interface EditableItem extends PreviewItem {
    _index: number;
  }

  let items: EditableItem[] = [];
  let loadedPreview: AnalysisPreview | null = null;
  let confirming = false;
  let asideOpen = false;
  let categoryCreateText = '';
  let categoryCreateKind = 'expense';
  let categoryTargetIndex: number | null = null;
  let categorySubmitting = false;

  const kindLabels: Record<string, string> = {
    expense: 'Gasto',
    investment: 'Inversión',
    note: 'Nota',
  };

  function formatAmount(amount: number | string | undefined, currency?: string) {
    const n = Number(amount) || 0;
    const cur = currency || 'COP';
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: cur,
        maximumFractionDigits: cur === 'COP' ? 0 : 2,
      }).format(n);
    } catch {
      return `${n} ${cur}`;
    }
  }

  function buildItems(p: AnalysisPreview): EditableItem[] {
    const built = [
      ...(p.expenses || []).map((i, idx) => ({ ...i, kind: 'expense' as const, _index: idx })),
      ...(p.investments || []).map((i, idx) => ({
        ...i,
        kind: 'investment' as const,
        _index: (p.expenses?.length || 0) + idx,
      })),
      ...(p.notes || []).map((i, idx) => ({
        ...i,
        kind: 'note' as const,
        _index: (p.expenses?.length || 0) + (p.investments?.length || 0) + idx,
      })),
    ];
    if (!built.length && p.items?.length) {
      return p.items.map((i, idx) => ({ ...i, _index: idx }));
    }
    return built;
  }

  $: visible = !!preview && (items.length > 0 || !!preview.error);
  $: if (preview !== loadedPreview) {
    loadedPreview = preview;
    items = preview ? buildItems(preview) : [];
  }

  $: accountOptions = [
    { value: '', label: 'Sin cuenta' },
    ...accounts.map((a) => ({ value: a.id, label: `${a.emoji} ${a.name}` })),
  ];

  const currencyOptions = [
    { value: 'COP', label: 'COP' },
    { value: 'USD', label: 'USD' },
  ];

  function patchItem(index: number, patch: Partial<EditableItem>) {
    items = items.map((i) => (i._index === index ? { ...i, ...patch } : i));
  }

  function acceptSuggestion(item: EditableItem) {
    if (!item.suggested_new_category) return;
    patchItem(item._index, {
      accept_category_suggestion: true,
      category: item.suggested_new_category,
    });
    showToast(`Categoría "${item.suggested_new_category}" aplicada`, { type: 'success' });
  }

  function ignoreSuggestion(item: EditableItem) {
    patchItem(item._index, {
      suggested_new_category: null,
      accept_category_suggestion: false,
    });
  }

  function onCategoryChange(item: EditableItem, cat: { id?: string; name: string; emoji: string; isNew?: boolean }) {
    patchItem(item._index, {
      category: cat.name || item.category,
      category_emoji: cat.emoji || item.category_emoji,
      ...(cat.isNew
        ? { suggested_new_category: cat.name, accept_category_suggestion: true }
        : {}),
    });
  }

  function onRequestCreate(item: EditableItem, e: CustomEvent<{ text: string }>) {
    categoryTargetIndex = item._index;
    categoryCreateKind = item.kind === 'investment' ? 'investment' : 'expense';
    categoryCreateText = e.detail?.text || item.category || '';
    asideOpen = true;
  }

  function onCategoryCreated(e: CustomEvent<Category>) {
    const cat = e.detail;
    const item = items.find((i) => i._index === categoryTargetIndex);
    if (item) onCategoryChange(item, { id: cat.id, name: cat.name, emoji: cat.emoji });
    asideOpen = false;
    categoryTargetIndex = null;
  }

  function closeCategoryAside() {
    asideOpen = false;
    categoryTargetIndex = null;
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

<Modal
  open={visible}
  title="Movimientos detectados"
  on:close={cancel}
  bind:asideOpen
  asideTitle="Nueva categoría"
  on:closeAside={closeCategoryAside}
>
  {#if preview?.error}
    <p class="ai-unavailable">{preview.error}{preview.hint ? ` ${preview.hint}` : ''}</p>
  {/if}

  {#if items.length}
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
              <header class="preview-item__top">
                <div class="preview-item__identity">
                  <span class="preview-item__emoji">
                    {item.category_emoji || (item.kind === 'note' ? '📝' : item.kind === 'investment' ? '📈' : '💸')}
                  </span>
                  <div class="preview-item__headings">
                    <span class="preview-item__kind">{kindLabels[item.kind] || item.kind}</span>
                    {#if item.kind === 'expense' || item.kind === 'investment'}
                      <span class="preview-item__amount-display">{formatAmount(item.amount, item.currency)}</span>
                    {:else}
                      <span class="preview-item__amount-display">{item.description || item.text || 'Nota'}</span>
                    {/if}
                  </div>
                </div>
                {#if item.needs_review}
                  <span class="review-badge">{item.kind === 'investment' ? 'Revisar activo' : 'Revisar monto'}</span>
                {/if}
              </header>
              {#if item.description && (item.kind === 'expense' || item.kind === 'investment')}
                <p class="preview-item__summary">{item.description}</p>
              {/if}
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
                      <MoneyInput
                        class="preview-amount"
                        value={item.amount ?? 0}
                        emptyAsNull={false}
                        on:change={(e) => {
                          item.amount = e.detail ?? 0;
                          items = items;
                        }}
                      />
                    </label>
                    <label>
                      Moneda
                      <CustomSelect options={currencyOptions} bind:value={item.currency} />
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
                        on:requestCreate={(e) => onRequestCreate(item, e)}
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
  <svelte:fragment slot="footer">
    {#if items.length}
      <div class="preview-card__actions">
        <button type="button" class="primary-button" disabled={confirming} on:click={confirm}>
          {confirming ? 'Guardando…' : 'Confirmar y guardar'}
        </button>
        <button type="button" class="secondary-button" on:click={cancel}>Cancelar</button>
      </div>
    {/if}
  </svelte:fragment>
  <svelte:fragment slot="aside">
    <CategoryCreateForm
      kind={categoryCreateKind}
      formId={categoryFormId}
      initialName={categoryCreateText}
      bind:categories
      bind:submitting={categorySubmitting}
      on:created={onCategoryCreated}
    />
  </svelte:fragment>
  <div slot="asideFooter" class="modal__actions modal__actions-right">
    <button type="button" class="ghost-button" on:click={closeCategoryAside}>Cancelar</button>
    <button type="submit" form={categoryFormId} class="primary-button" disabled={categorySubmitting}>
      {categorySubmitting ? 'Guardando…' : 'Guardar'}
    </button>
  </div>
</Modal>

