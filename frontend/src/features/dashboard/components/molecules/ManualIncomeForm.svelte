<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CategorySelector from '@common/molecules/CategorySelector.svelte';
  import CustomSelect from '@common/molecules/CustomSelect.svelte';
  import MoneyInput from '@common/molecules/MoneyInput.svelte';
  import { createCategory, createIncome } from '@common/lib/api';
  import { findCategoryByName } from '@common/lib/categories';
  import { applyFinancePayload } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import type { Account, Category } from '@common/lib/types';

  export let accounts: Account[] = [];
  export let categories: Category[] = [];
  export let formId = 'manual-income-form';
  export let selected: { id?: string; name?: string; emoji?: string } | null = null;
  /** Prefill opcional (p. ej. recordatorio de payday). */
  export let prefill: {
    amount?: number | string | null;
    accountId?: string | null;
    category?: string | null;
    categoryEmoji?: string | null;
    description?: string | null;
    currency?: string | null;
  } | null = null;

  const dispatch = createEventDispatcher<{
    saved: { amount: number; accountId: string; currency: string; category: string };
    requestCreate: { text: string };
  }>();

  let accountId = '';
  let amount: number | null = null;
  let currency = 'COP';
  let category = '';
  let categoryEmoji = '';
  let description = '';
  let incomeSource = '';
  let appliedPrefillKey = '';
  let submitting = false;

  $: if (selected?.name) {
    category = selected.name;
    categoryEmoji = selected.emoji || '';
  }

  $: if (prefill) {
    const key = JSON.stringify(prefill);
    if (key !== appliedPrefillKey) {
      appliedPrefillKey = key;
      if (prefill.amount != null && prefill.amount !== '') {
        const n = Number(prefill.amount);
        amount = Number.isFinite(n) ? n : null;
      }
      if (prefill.accountId) accountId = prefill.accountId;
      if (prefill.category) category = prefill.category;
      if (prefill.categoryEmoji != null) categoryEmoji = prefill.categoryEmoji || '';
      if (prefill.description) description = prefill.description;
      if (prefill.currency) currency = prefill.currency;
    }
  }

  $: accountOptions = [
    { value: '', label: 'Sin cuenta' },
    ...accounts.map((a) => ({ value: a.id, label: `${a.emoji} ${a.name}` })),
  ];

  async function ensureCategory(name: string, emoji: string, kind: string) {
    if (!findCategoryByName(categories, name, kind)) {
      const data = await createCategory({ name, emoji, kind });
      applyFinancePayload(data);
      categories = data.categories;
    }
  }

  async function submitIncome(e: Event) {
    e.preventDefault();
    if (submitting) return;
    submitting = true;
    try {
      const categoryName = category || 'General';
      const parsedAmount = amount ?? 0;
      await ensureCategory(categoryName, categoryEmoji, 'income');
      const data = await createIncome({
        account_id: accountId || null,
        amount: parsedAmount,
        currency,
        category: categoryName,
        category_emoji: categoryEmoji,
        description,
        income_source: incomeSource,
      });
      applyFinancePayload(data);
      const saved = {
        amount: parsedAmount,
        accountId,
        currency,
        category: categoryName,
      };
      amount = null;
      description = '';
      incomeSource = '';
      appliedPrefillKey = '';
      showToast('Ingreso guardado', { type: 'success' });
      dispatch('saved', saved);
    } catch {
      showToast('Error al guardar ingreso', { type: 'error' });
    } finally {
      submitting = false;
    }
  }
</script>

{#if !accounts.length}
  <p class="form-hint">Primero crea una cuenta para asociar tus movimientos. También puedes guardar sin cuenta.</p>
{/if}

<form id={formId} class="manual-form" on:submit={submitIncome}>
  <div class="manual-form__grid">
    <CustomSelect options={accountOptions} bind:value={accountId} />
    <MoneyInput class="form-control" bind:value={amount} placeholder="Monto" required />
    <CustomSelect
      options={[
        { value: 'COP', label: 'COP' },
        { value: 'USD', label: 'USD' },
      ]}
      bind:value={currency}
    />
    <div class="manual-form__full">
      <CategorySelector
        {categories}
        kind="income"
        selected={{ name: category, emoji: categoryEmoji }}
        on:change={(e) => {
          category = e.detail.name;
          categoryEmoji = e.detail.emoji;
        }}
        on:requestCreate
      />
    </div>
    <input
      type="text"
      class="form-control manual-form__full"
      bind:value={description}
      placeholder="Descripción"
      required
    />
    <input
      type="text"
      class="form-control manual-form__full"
      bind:value={incomeSource}
      placeholder="Fuente del ingreso (opcional)"
    />
  </div>
</form>
