<script lang="ts">
  import Modal from '@common/atoms/Modal.svelte';
  import ManualExpenseForm from '@features/dashboard/components/molecules/ManualExpenseForm.svelte';
  import ManualIncomeForm from '@features/dashboard/components/molecules/ManualIncomeForm.svelte';
  import type { Account, Category } from '@common/lib/types';

  export let accounts: Account[] = [];
  export let categories: Category[] = [];
  export let expenseOpen = false;
  export let incomeOpen = false;

  const expenseFormId = 'manual-expense-form';
  const incomeFormId = 'manual-income-form';

  function closeExpense() {
    expenseOpen = false;
  }

  function closeIncome() {
    incomeOpen = false;
  }
</script>

<Modal bind:open={expenseOpen} title="Agregar gasto" narrow onClose={closeExpense}>
  <ManualExpenseForm
    {accounts}
    bind:categories
    formId={expenseFormId}
    on:success={closeExpense}
  />
  <div slot="footer" class="modal__actions modal__actions-right">
    <button type="button" class="ghost-button" on:click={closeExpense}>Cancelar</button>
    <button type="submit" form={expenseFormId} class="primary-button">Guardar</button>
  </div>
</Modal>

<Modal bind:open={incomeOpen} title="Agregar ingreso" narrow onClose={closeIncome}>
  <ManualIncomeForm
    {accounts}
    bind:categories
    formId={incomeFormId}
    on:success={closeIncome}
  />
  <div slot="footer" class="modal__actions modal__actions-right">
    <button type="button" class="ghost-button" on:click={closeIncome}>Cancelar</button>
    <button type="submit" form={incomeFormId} class="primary-button">Guardar</button>
  </div>
</Modal>
