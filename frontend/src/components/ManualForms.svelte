<script lang="ts">
  import CategorySelector from './CategorySelector.svelte';
  import CustomSelect from './CustomSelect.svelte';
  import { createCategory, createExpense, createInvestment } from '@/lib/api';
  import { findCategoryByName } from '@/lib/categories';
  import { applyFinancePayload } from '@/stores/finance';
  import { showToast } from '@/lib/toast';
  import type { Account, Category } from '@/lib/types';

  export let accounts: Account[] = [];
  export let categories: Category[] = [];

  let expenseOpen = false;
  let investmentOpen = false;

  let expenseAccountId = '';
  let expenseAmount = '';
  let expenseCurrency = 'COP';
  let expenseCategory = '';
  let expenseCategoryEmoji = '';
  let expenseDescription = '';
  let expensePayment = '';

  let invAccountId = '';
  let invAsset = '';
  let invAssetType = 'ETF';
  let invAmount = '';
  let invCurrency = 'USD';
  let invAction = 'buy';
  let invCategory = 'Inversión';
  let invCategoryEmoji = '📈';
  let invNotes = '';

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
      const categoryName = expenseCategory || 'General';
      await ensureCategory(categoryName, expenseCategoryEmoji, 'expense');
      const data = await createExpense({
        account_id: expenseAccountId || null,
        amount: parseFloat(expenseAmount),
        currency: expenseCurrency,
        category: categoryName,
        category_emoji: expenseCategoryEmoji,
        description: expenseDescription,
        payment_method: expensePayment,
      });
      applyFinancePayload(data);
      expenseAmount = '';
      expenseDescription = '';
      expensePayment = '';
      showToast('Gasto guardado', { type: 'success' });
    } catch {
      showToast('Error al guardar gasto', { type: 'error' });
    }
  }

  async function submitInvestment(e: Event) {
    e.preventDefault();
    try {
      const categoryName = invCategory || 'Inversión';
      await ensureCategory(categoryName, invCategoryEmoji, 'investment');
      const data = await createInvestment({
        account_id: invAccountId || null,
        asset: invAsset,
        asset_type: invAssetType,
        amount: parseFloat(invAmount),
        currency: invCurrency,
        action: invAction,
        category: categoryName,
        category_emoji: invCategoryEmoji,
        notes: invNotes,
      });
      applyFinancePayload(data);
      invAsset = '';
      invAmount = '';
      invNotes = '';
      showToast('Inversión guardada', { type: 'success' });
    } catch {
      showToast('Error al guardar inversión', { type: 'error' });
    }
  }
</script>

<section class="full-width-section manual-section section" aria-label="Registro manual">
  <h2 class="card-title">Formularios manuales</h2>

  <button type="button" class="manual-toggle" aria-expanded={expenseOpen} on:click={() => (expenseOpen = !expenseOpen)}>
    Agregar gasto manual
    <span class="manual-toggle__chevron" aria-hidden="true">▾</span>
  </button>
  <div class="manual-panel" class:is-open={expenseOpen}>
    <div class="manual-card">
      {#if !accounts.length}
        <p class="form-hint">Primero crea una cuenta para asociar tus movimientos. También puedes guardar sin cuenta.</p>
      {/if}
      <form class="manual-form" on:submit={submitExpense}>
        <div class="manual-form__grid">
          <CustomSelect options={accountOptions} bind:value={expenseAccountId} />
          <input type="number" bind:value={expenseAmount} placeholder="Monto" required min="1" />
          <CustomSelect
            options={[{ value: 'COP', label: 'COP' }, { value: 'USD', label: 'USD' }]}
            bind:value={expenseCurrency}
          />
          <div class="manual-form__full">
            <CategorySelector
              {categories}
              kind="expense"
              on:change={(e) => { expenseCategory = e.detail.name; expenseCategoryEmoji = e.detail.emoji; }}
            />
          </div>
          <input type="text" bind:value={expenseDescription} placeholder="Descripción" required class="manual-form__full" />
          <input type="text" bind:value={expensePayment} placeholder="Método de pago (opcional)" class="manual-form__full" />
        </div>
        <button type="submit" class="secondary-button">Guardar gasto</button>
      </form>
    </div>
  </div>

  <button type="button" class="manual-toggle" style="margin-top: 10px;" aria-expanded={investmentOpen} on:click={() => (investmentOpen = !investmentOpen)}>
    Agregar inversión manual
    <span class="manual-toggle__chevron" aria-hidden="true">▾</span>
  </button>
  <div class="manual-panel" class:is-open={investmentOpen}>
    <div class="manual-card">
      {#if !accounts.length}
        <p class="form-hint">Primero crea una cuenta para asociar tus movimientos. También puedes guardar sin cuenta.</p>
      {/if}
      <form class="manual-form" on:submit={submitInvestment}>
        <div class="manual-form__grid">
          <CustomSelect options={accountOptions} bind:value={invAccountId} />
          <input type="text" bind:value={invAsset} placeholder="Activo (ej. VOO)" required />
          <select bind:value={invAssetType}>
            <option value="ETF">ETF</option>
            <option value="Stock">Acción</option>
            <option value="Crypto">Cripto</option>
            <option value="Fund">Fondo</option>
            <option value="Other">Otro</option>
          </select>
          <input type="number" bind:value={invAmount} placeholder="Monto" required min="0.01" step="0.01" />
          <CustomSelect
            options={[{ value: 'USD', label: 'USD' }, { value: 'COP', label: 'COP' }]}
            bind:value={invCurrency}
          />
          <select bind:value={invAction}>
            <option value="buy">Compra</option>
            <option value="sell">Venta</option>
          </select>
          <div class="manual-form__full">
            <CategorySelector
              {categories}
              kind="investment"
              selected={{ name: 'Inversión', emoji: '📈' }}
              on:change={(e) => { invCategory = e.detail.name; invCategoryEmoji = e.detail.emoji; }}
            />
          </div>
          <input type="text" bind:value={invNotes} placeholder="Nota (opcional)" class="manual-form__full" />
        </div>
        <button type="submit" class="secondary-button">Guardar inversión</button>
      </form>
    </div>
  </div>
</section>
