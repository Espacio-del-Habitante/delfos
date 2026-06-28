<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CategorySelector from '@common/molecules/CategorySelector.svelte';
  import CustomSelect from '@common/molecules/CustomSelect.svelte';
  import { createCategory, createExpense } from '@common/lib/api';
  import { findCategoryByName } from '@common/lib/categories';
  import { applyFinancePayload } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import type { Account, Category } from '@common/lib/types';

  export let accounts: Account[] = [];
  export let categories: Category[] = [];
  export let formId = 'manual-expense-form';
  export let selected: { id?: string; name?: string; emoji?: string } | null = null;

  const dispatch = createEventDispatcher<{ success: void; requestCreate: { text: string } }>();

  let accountId = '';
  let amount = '';
  let currency = 'COP';
  let category = '';
  let categoryEmoji = '';
  let description = '';
  let payment = '';

  $: if (selected?.name) {
    category = selected.name;
    categoryEmoji = selected.emoji || '';
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

  async function submitExpense(e: Event) {
    e.preventDefault();
    try {
      const categoryName = category || 'General';
      await ensureCategory(categoryName, categoryEmoji, 'expense');
      const data = await createExpense({
        account_id: accountId || null,
        amount: parseFloat(amount),
        currency,
        category: categoryName,
        category_emoji: categoryEmoji,
        description,
        payment_method: payment,
      });
      applyFinancePayload(data);
      amount = '';
      description = '';
      payment = '';
      showToast('Gasto guardado', { type: 'success' });
      dispatch('success');
    } catch {
      showToast('Error al guardar gasto', { type: 'error' });
    }
  }
</script>

{#if !accounts.length}
  <p class="form-hint">Primero crea una cuenta para asociar tus movimientos. También puedes guardar sin cuenta.</p>
{/if}

<form id={formId} class="manual-form" on:submit={submitExpense}>
  <div class="manual-form__grid">
    <CustomSelect options={accountOptions} bind:value={accountId} />
    <input
      type="number"
      class="form-control"
      bind:value={amount}
      placeholder="Monto"
      required
      min="1"
    />
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
        kind="expense"
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
      bind:value={payment}
      placeholder="Método de pago (opcional)"
    />
  </div>
</form>
