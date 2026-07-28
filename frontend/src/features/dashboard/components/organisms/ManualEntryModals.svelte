<script lang="ts">
  import Modal from '@common/atoms/Modal.svelte';
  import ManualExpenseForm from '@features/dashboard/components/molecules/ManualExpenseForm.svelte';
  import ManualIncomeForm from '@features/dashboard/components/molecules/ManualIncomeForm.svelte';
  import AllocationModal from '@features/dashboard/components/organisms/AllocationModal.svelte';
  import CategoryCreateForm from '@common/organisms/CategoryCreateForm.svelte';
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

  let expenseAsideOpen = false;
  let expenseCreateText = '';
  let expenseSelected: { id?: string; name?: string; emoji?: string } | null = null;
  let expenseCategorySubmitting = false;

  let incomeAsideOpen = false;
  let incomeCreateText = '';
  let incomeSelected: { id?: string; name?: string; emoji?: string } | null = null;
  let incomeCategorySubmitting = false;

  let allocationOpen = false;
  let allocationProposal: AllocationProposal | null = null;

  $: if (incomePrefill?.category) {
    incomeSelected = {
      name: incomePrefill.category,
      emoji: incomePrefill.categoryEmoji || '',
    };
  }

  function closeExpense() {
    expenseOpen = false;
    expenseAsideOpen = false;
  }

  function closeIncome() {
    incomeOpen = false;
    incomeAsideOpen = false;
    incomePrefill = null;
    incomeSelected = null;
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

  function onProposeAllocation(e: CustomEvent<{ proposal: AllocationProposal }>) {
    allocationProposal = e.detail.proposal;
    allocationOpen = true;
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
  title="Agregar ingreso"
  narrow
  onClose={closeIncome}
  bind:asideOpen={incomeAsideOpen}
  asideTitle="Nueva categoría"
  on:closeAside={() => (incomeAsideOpen = false)}
>
  <ManualIncomeForm
    {accounts}
    bind:categories
    selected={incomeSelected}
    prefill={incomePrefill}
    formId={incomeFormId}
    on:success={closeIncome}
    on:requestCreate={onIncomeRequestCreate}
    on:proposeAllocation={onProposeAllocation}
  />
  <div slot="footer" class="modal__actions modal__actions-right">
    <button type="button" class="ghost-button" on:click={closeIncome}>Cancelar</button>
    <button type="submit" form={incomeFormId} class="primary-button">Guardar</button>
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

<AllocationModal
  bind:open={allocationOpen}
  proposal={allocationProposal}
  on:close={() => {
    allocationOpen = false;
    allocationProposal = null;
  }}
/>
