<script lang="ts">
  import { get } from 'svelte/store';
  import Modal from '@common/atoms/Modal.svelte';
  import ManualExpenseForm from '@features/dashboard/components/molecules/ManualExpenseForm.svelte';
  import ManualIncomeForm from '@features/dashboard/components/molecules/ManualIncomeForm.svelte';
  import AllocationModal from '@features/dashboard/components/organisms/AllocationModal.svelte';
  import CategoryCreateForm from '@common/organisms/CategoryCreateForm.svelte';
  import { proposeAllocation } from '@common/lib/api';
  import { guessIncomeIsComplete } from '@common/lib/incomeCompleteDefault.mjs';
  import { finance } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import type { Account, AllocationProposal, Category } from '@common/lib/types';

  export let accounts: Account[] = [];
  export let categories: Category[] = [];
  export let expenseOpen = false;
  export let incomeOpen = false;
  export let incomePrefill: {
    amount?: number | string | null;
    accountId?: string | null;
    category?: string | null;
    categoryEmoji?: string | null;
    description?: string | null;
    currency?: string | null;
  } | null = null;

  const expenseFormId = 'manual-expense-form';
  const incomeFormId = 'manual-income-form';
  const expenseCategoryFormId = 'manual-expense-category-form';
  const incomeCategoryFormId = 'manual-income-category-form';
  const STEP_LABELS = ['Datos', 'Distribuir', 'Propuesta'] as const;

  let expenseAsideOpen = false;
  let expenseCreateText = '';
  let expenseSelected: { id?: string; name?: string; emoji?: string } | null = null;
  let expenseCategorySubmitting = false;

  let incomeAsideOpen = false;
  let incomeCreateText = '';
  let incomeSelected: { id?: string; name?: string; emoji?: string } | null = null;
  let incomeCategorySubmitting = false;

  let incomeStep: 1 | 2 | 3 = 1;
  let savedIncome: {
    amount: number;
    accountId: string;
    currency: string;
    category: string;
  } | null = null;
  let incomeIsComplete = true;
  let allocationProposal: AllocationProposal | null = null;
  let proposing = false;
  let allocPanel: AllocationModal | undefined;
  let allocConfirming = false;

  $: if (incomePrefill?.category) {
    incomeSelected = {
      name: incomePrefill.category,
      emoji: incomePrefill.categoryEmoji || '',
    };
  }

  let incomeWasOpen = false;
  $: {
    if (incomeOpen && !incomeWasOpen) {
      incomeStep = 1;
      savedIncome = null;
      incomeIsComplete = true;
      allocationProposal = null;
      proposing = false;
    }
    if (!incomeOpen && incomeWasOpen) {
      resetIncomeFlow();
    }
    incomeWasOpen = incomeOpen;
  }

  $: incomeTitle =
    incomeStep === 1 ? 'Agregar ingreso' : incomeStep === 2 ? 'Distribuir ingreso' : 'Revisar distribución';

  $: canDistribute = Boolean(savedIncome?.accountId && Number(savedIncome?.amount) > 0);

  function resetIncomeFlow() {
    incomeStep = 1;
    savedIncome = null;
    incomeIsComplete = true;
    allocationProposal = null;
    proposing = false;
    allocConfirming = false;
    allocPanel = undefined;
    incomeAsideOpen = false;
    incomePrefill = null;
    incomeSelected = null;
  }

  function closeExpense() {
    expenseOpen = false;
    expenseAsideOpen = false;
  }

  function closeIncome() {
    incomeOpen = false;
    resetIncomeFlow();
  }

  function onExpenseRequestCreate(e: CustomEvent<{ text: string }>) {
    expenseCreateText = e.detail?.text || '';
    expenseAsideOpen = true;
  }

  function onExpenseCreated(e: CustomEvent<Category>) {
    expenseSelected = { id: e.detail.id, name: e.detail.name, emoji: e.detail.emoji };
    expenseAsideOpen = false;
  }

  function onIncomeRequestCreate(e: CustomEvent<{ text: string }>) {
    incomeCreateText = e.detail?.text || '';
    incomeAsideOpen = true;
  }

  function onIncomeCreated(e: CustomEvent<Category>) {
    incomeSelected = { id: e.detail.id, name: e.detail.name, emoji: e.detail.emoji };
    incomeAsideOpen = false;
  }

  function onIncomeSaved(
    e: CustomEvent<{ amount: number; accountId: string; currency: string; category: string }>,
  ) {
    savedIncome = e.detail;
    const profile = get(finance)?.financial_profile;
    const monthly =
      (Number(profile?.monthly_income_fixed) || 0) +
      (Number(profile?.monthly_income_variable_avg) || 0);
    const freq = String(profile?.pay_frequency || 'monthly').toLowerCase();
    const divisor = freq === 'biweekly' ? 2 : freq === 'weekly' ? 4 : 1;
    // Caller pasa el esperado del periodo (mensual / N).
    const expected = monthly > 0 ? monthly / divisor : 0;
    incomeIsComplete = guessIncomeIsComplete(e.detail.category, e.detail.amount, expected);
    incomeStep = 2;
    incomeAsideOpen = false;
  }

  $: payFreq = String($finance?.financial_profile?.pay_frequency || 'monthly').toLowerCase();
  $: periodName =
    payFreq === 'weekly' ? 'semana' : payFreq === 'biweekly' ? 'quincena' : 'mes';

  async function onDistributeYes() {
    if (!savedIncome?.accountId || proposing) return;
    proposing = true;
    try {
      const { proposal } = await proposeAllocation({
        income_amount: savedIncome.amount,
        from_account_id: savedIncome.accountId,
        currency: savedIncome.currency,
        income_is_complete: incomeIsComplete,
      });
      allocationProposal = proposal;
      incomeStep = 3;
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'No se pudo proponer la distribución',
        { type: 'error' },
      );
    } finally {
      proposing = false;
    }
  }

  async function onConfirmAllocation() {
    if (!allocPanel || allocConfirming) return;
    allocConfirming = true;
    try {
      await allocPanel.confirm();
    } finally {
      allocConfirming = false;
    }
  }
</script>

<Modal
  bind:open={expenseOpen}
  title="Agregar gasto"
  narrow
  onClose={closeExpense}
  bind:asideOpen={expenseAsideOpen}
  asideTitle="Nueva categoría"
  on:closeAside={() => (expenseAsideOpen = false)}
>
  <ManualExpenseForm
    {accounts}
    bind:categories
    selected={expenseSelected}
    formId={expenseFormId}
    on:success={closeExpense}
    on:requestCreate={onExpenseRequestCreate}
  />
  <div slot="footer" class="modal__actions modal__actions-right">
    <button type="button" class="ghost-button" on:click={closeExpense}>Cancelar</button>
    <button type="submit" form={expenseFormId} class="primary-button">Guardar</button>
  </div>
  <svelte:fragment slot="aside">
    <CategoryCreateForm
      kind="expense"
      formId={expenseCategoryFormId}
      initialName={expenseCreateText}
      bind:categories
      bind:submitting={expenseCategorySubmitting}
      on:created={onExpenseCreated}
    />
  </svelte:fragment>
  <div slot="asideFooter" class="modal__actions modal__actions-right">
    <button type="button" class="ghost-button" on:click={() => (expenseAsideOpen = false)}>Cancelar</button>
    <button type="submit" form={expenseCategoryFormId} class="primary-button" disabled={expenseCategorySubmitting}>
      {expenseCategorySubmitting ? 'Guardando…' : 'Guardar'}
    </button>
  </div>
</Modal>

<Modal
  bind:open={incomeOpen}
  title={incomeTitle}
  narrow={incomeStep < 3}
  onClose={closeIncome}
  bind:asideOpen={incomeAsideOpen}
  asideTitle="Nueva categoría"
  on:closeAside={() => (incomeAsideOpen = false)}
>
  <nav slot="chrome" class="delfos-stepper delfos-stepper--in-panel" aria-label={`Paso ${incomeStep} de 3`}>
    <ol class="delfos-stepper__list" aria-label="Pasos del ingreso">
      {#each STEP_LABELS as label, i}
        {@const n = i + 1}
        <li class:is-active={incomeStep === n} class:is-done={incomeStep > n}>
          <span class="delfos-stepper__num" aria-hidden="true">
            {#if incomeStep > n}✓{:else}{n}{/if}
          </span>
          <span class="delfos-stepper__label">{label}</span>
        </li>
      {/each}
    </ol>
  </nav>

  {#if incomeStep === 1}
    <ManualIncomeForm
      {accounts}
      bind:categories
      selected={incomeSelected}
      prefill={incomePrefill}
      formId={incomeFormId}
      on:saved={onIncomeSaved}
      on:requestCreate={onIncomeRequestCreate}
    />
  {:else if incomeStep === 2}
    <div class="income-offer">
      <p class="income-offer__lead">
        ¿Distribuir este ingreso hacia fijos, emergencia, metas e inversión?
      </p>
      <p class="income-offer__hint">
        El ingreso ya quedó registrado. Puedes armar la propuesta ahora u omitir y dejar el dinero en la cuenta.
      </p>
      {#if !canDistribute}
        <p class="income-offer__warn" role="status">
          Para distribuir, el ingreso debe tener cuenta y monto mayor a cero.
        </p>
      {:else}
        <label class="income-offer__toggle">
          <input type="checkbox" bind:checked={incomeIsComplete} />
          <span>
            <strong>Este es el ingreso completo de la {periodName}</strong>
            <small>
              Si está parcial, la propuesta escala los fijos al monto registrado (sin aviso de
              shortfall).
            </small>
          </span>
        </label>
      {/if}
    </div>
  {:else if allocationProposal}
    <AllocationModal
      bind:this={allocPanel}
      proposal={allocationProposal}
      on:confirmed={closeIncome}
    />
  {/if}

  <div slot="footer" class="modal__actions modal__actions-right">
    {#if incomeStep === 1}
      <button type="button" class="ghost-button" on:click={closeIncome}>Cancelar</button>
      <button type="submit" form={incomeFormId} class="primary-button">Continuar</button>
    {:else if incomeStep === 2}
      <button type="button" class="ghost-button" on:click={closeIncome}>Omitir</button>
      <button
        type="button"
        class="primary-button"
        disabled={!canDistribute || proposing}
        on:click={onDistributeYes}
      >
        {proposing ? 'Preparando…' : 'Sí, distribuir'}
      </button>
    {:else}
      <button type="button" class="ghost-button" disabled={allocConfirming} on:click={closeIncome}>
        Omitir
      </button>
      <button
        type="button"
        class="primary-button"
        disabled={allocConfirming || !allocationProposal}
        on:click={onConfirmAllocation}
      >
        {allocConfirming ? 'Aplicando…' : 'Confirmar'}
      </button>
    {/if}
  </div>

  <svelte:fragment slot="aside">
    <CategoryCreateForm
      kind="income"
      formId={incomeCategoryFormId}
      initialName={incomeCreateText}
      bind:categories
      bind:submitting={incomeCategorySubmitting}
      on:created={onIncomeCreated}
    />
  </svelte:fragment>
  <div slot="asideFooter" class="modal__actions modal__actions-right">
    <button type="button" class="ghost-button" on:click={() => (incomeAsideOpen = false)}>Cancelar</button>
    <button type="submit" form={incomeCategoryFormId} class="primary-button" disabled={incomeCategorySubmitting}>
      {incomeCategorySubmitting ? 'Guardando…' : 'Guardar'}
    </button>
  </div>
</Modal>

<style>
  .income-offer {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .income-offer__lead {
    margin: 0;
    font-size: 1.02rem;
    font-weight: 650;
    color: var(--text-strong);
    line-height: 1.35;
  }

  .income-offer__hint {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.88rem;
    line-height: 1.4;
  }

  .income-offer__warn {
    margin: 0;
    padding: 0.65rem 0.75rem;
    border-radius: var(--radius-sm);
    background: rgba(245, 158, 11, 0.1);
    color: #92400e;
    font-size: 0.88rem;
    line-height: 1.35;
  }

  .income-offer__toggle {
    display: flex;
    gap: 0.65rem;
    align-items: flex-start;
    padding: 0.75rem;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background-color 140ms var(--ease-out);
  }

  .income-offer__toggle:active {
    transform: scale(0.99);
  }

  @media (hover: hover) and (pointer: fine) {
    .income-offer__toggle:hover {
      background: rgba(15, 23, 42, 0.03);
    }
  }

  .income-offer__toggle input {
    margin-top: 0.2rem;
    flex-shrink: 0;
  }

  .income-offer__toggle strong {
    display: block;
    font-size: 0.92rem;
    color: var(--text-strong);
  }

  .income-offer__toggle small {
    display: block;
    margin-top: 0.2rem;
    font-size: 0.8rem;
    color: var(--text-muted);
    line-height: 1.35;
  }

  @media (prefers-reduced-motion: reduce) {
    .income-offer__toggle {
      transition: none;
    }

    .income-offer__toggle:active {
      transform: none;
    }
  }
</style>
