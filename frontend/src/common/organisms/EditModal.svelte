<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CategorySelector from '@common/molecules/CategorySelector.svelte';
  import CustomSelect from '@common/molecules/CustomSelect.svelte';
  import AssetSelect from '@common/molecules/AssetSelect.svelte';
  import MoneyInput from '@common/molecules/MoneyInput.svelte';
  import {
    deleteAccount,
    deleteExpense,
    deleteIncome,
    deleteInvestment,
    deleteNote,
    updateAccount,
    updateExpense,
    updateIncome,
    updateInvestment,
    updateNote,
  } from '@common/lib/api';
  import { ACCOUNT_TYPES } from '@common/lib/formatters';
  import { INVESTMENT_ASSET_TYPES, INVESTMENT_OPERATION_TYPES, normalizeAssetType } from '@common/lib/investmentTypes';
  import { applyFinancePayload } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import { createModalShellState, hideModalShell, showModalShell } from '@common/lib/modalShell';
  import type { Account, Category, EditRecordType, ExpenseRecord, IncomeRecord, InvestmentAsset, InvestmentRecord, NoteRecord, Goal } from '@common/lib/types';

  export let open = false;
  export let recordType: EditRecordType | null = null;
  export let record: Account | ExpenseRecord | IncomeRecord | InvestmentRecord | NoteRecord | null = null;
  export let accounts: Account[] = [];
  export let categories: Category[] = [];
  export let investmentAssets: InvestmentAsset[] = [];
  export let goals: Goal[] = [];

  const dispatch = createEventDispatcher<{ close: void; saved: void; deleted: void }>();

  let shell = createModalShellState();
  let categoryName = '';
  let categoryEmoji = '';
  let investmentAsset = '';
  let categoryRecordId = '';

  $: contentReady = Boolean(open && record && recordType);
  $: syncOpen(contentReady);

  function syncOpen(ready: boolean) {
    if (ready) {
      void showModal();
    } else if (shell.rendered && !shell.exiting) {
      void hideModal();
    }
  }

  async function showModal() {
    document.body.classList.add('modal-open');
    shell = { rendered: true, exiting: false, visible: false };
    shell = await showModalShell(shell);
  }

  async function hideModal() {
    shell = { ...shell, exiting: true, visible: false };
    shell = await hideModalShell(shell);
    document.body.classList.remove('modal-open');
  }

  $: accountOptions = [
    { value: '', label: 'Sin cuenta' },
    ...accounts.map((a) => ({ value: a.id, label: `${a.emoji} ${a.name}` })),
  ];
  $: typeOptions = Object.entries(ACCOUNT_TYPES).map(([value, label]) => ({ value, label }));
  $: currencyOptions = [
    { value: 'COP', label: 'COP' },
    { value: 'USD', label: 'USD' },
  ];
  $: roleOptions = [
    { value: 'general', label: 'General' },
    { value: 'operating', label: 'Operativa' },
    { value: 'goal', label: 'De meta' },
  ];
  $: goalOptions = [
    { value: '', label: 'Sin meta' },
    ...goals
      .filter((g) => g.status === 'active' || !g.status)
      .map((g) => ({ value: g.id, label: g.title })),
  ];

  $: title =
    recordType === 'account'
      ? 'Editar cuenta'
      : recordType === 'expense'
        ? 'Editar gasto'
        : recordType === 'income'
          ? 'Editar ingreso'
        : recordType === 'investment'
          ? 'Editar inversión'
          : recordType === 'note'
            ? 'Editar nota'
            : 'Editar';

  function close() {
    open = false;
    dispatch('close');
  }

  function onOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function parseOptionalFloat(raw: FormDataEntryValue | null): number | null {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) return null;
    const n = parseFloat(trimmed);
    return Number.isFinite(n) ? n : null;
  }

  async function save(e: Event) {
    e.preventDefault();
    if (!recordType || !record) return;
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const val = (name: string) => fd.get(name);

    try {
      let data;
      if (recordType === 'account') {
        data = await updateAccount(record.id, {
          name: val('name'),
          type: val('type'),
          currency: val('currency'),
          emoji: val('emoji') || '💰',
          initial_balance: parseFloat(String(val('initial_balance'))) || 0,
          current_balance: parseFloat(String(val('current_balance'))) || 0,
          goal_id: val('goal_id') || null,
          role: val('role') || 'general',
        });
      } else if (recordType === 'expense') {
        data = await updateExpense(record.id, {
          date: val('date'),
          account_id: val('account_id') || null,
          amount: parseFloat(String(val('amount'))) || 0,
          currency: val('currency') || 'COP',
          category: categoryName || val('category') || 'General',
          category_emoji: categoryEmoji || String(val('category_emoji') || ''),
          description: val('description') || '',
          payment_method: val('payment_method') || '',
        });
      } else if (recordType === 'income') {
        data = await updateIncome(record.id, {
          date: val('date'),
          account_id: val('account_id') || null,
          amount: parseFloat(String(val('amount'))) || 0,
          currency: val('currency') || 'COP',
          category: categoryName || val('category') || 'General',
          category_emoji: categoryEmoji || String(val('category_emoji') || ''),
          description: val('description') || '',
          income_source: val('income_source') || '',
        });
      } else if (recordType === 'investment') {
        const r = record as InvestmentRecord;
        data = await updateInvestment(record.id, {
          date: val('date'),
          account_id: val('account_id') || null,
          asset: val('asset'),
          asset_type: normalizeAssetType(val('asset_type')),
          operation_type: val('operation_type') || val('action') || 'buy',
          action: val('operation_type') || val('action') || 'buy',
          quantity: parseOptionalFloat(val('quantity')),
          amount_usd: parseOptionalFloat(val('amount_usd')),
          amount_cop: parseOptionalFloat(val('amount_cop')),
          unit_price: parseOptionalFloat(val('unit_price')),
          closing_cost: parseOptionalFloat(val('closing_cost')),
          pnl_usd: parseOptionalFloat(val('pnl_usd')),
          total: parseOptionalFloat(val('total')),
          amount: parseFloat(String(val('amount'))) || parseOptionalFloat(val('total')) || parseOptionalFloat(val('amount_usd')) || 0,
          currency: val('currency') || 'USD',
          category: categoryName || val('category') || 'Inversión',
          category_emoji: categoryEmoji || String(val('category_emoji') || '📈'),
          notes: val('notes') || '',
        });
      } else if (recordType === 'note') {
        const tagsRaw = String(val('tags') || '').trim();
        data = await updateNote(record.id, {
          date: val('date'),
          account_id: val('account_id') || null,
          text: val('text'),
          tags: tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [],
        });
      }
      if (data) {
        applyFinancePayload(data);
        dispatch('saved');
        showToast('Cambios guardados', { type: 'success' });
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al guardar', { type: 'error' });
    }
  }

  async function remove() {
    if (!recordType || !record) return;
    const messages: Record<string, string> = {
      account: '¿Eliminar esta cuenta? Los movimientos asociados quedarán sin cuenta.',
      expense: '¿Eliminar este gasto?',
      income: '¿Eliminar este ingreso?',
      investment: '¿Eliminar esta inversión?',
      note: '¿Eliminar esta nota?',
    };
    if (!confirm(messages[recordType] || '¿Eliminar este registro?')) return;
    try {
      let data;
      if (recordType === 'account') data = await deleteAccount(record.id);
      else if (recordType === 'expense') data = await deleteExpense(record.id);
      else if (recordType === 'income') data = await deleteIncome(record.id);
      else if (recordType === 'investment') data = await deleteInvestment(record.id);
      else data = await deleteNote(record.id);
      applyFinancePayload(data);
      dispatch('deleted');
      showToast('Eliminado', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al eliminar', { type: 'error' });
    }
  }

  $: if (record && recordType === 'investment') {
    investmentAsset = (record as InvestmentRecord).asset || '';
  }

  $: if (record && (recordType === 'expense' || recordType === 'income' || recordType === 'investment')) {
    if (record.id !== categoryRecordId) {
      categoryRecordId = record.id;
      const r = record as ExpenseRecord | IncomeRecord | InvestmentRecord;
      categoryName = r.category || '';
      categoryEmoji = r.category_emoji || '';
    }
  } else {
    categoryRecordId = '';
  }
</script>

{#if shell.rendered && record && recordType}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="modal-overlay"
    class:is-visible={shell.visible}
    class:is-exiting={shell.exiting}
    aria-hidden={!shell.visible}
    on:click={onOverlayClick}
  >
    <div
      class="modal"
      class:is-visible={shell.visible}
      class:is-exiting={shell.exiting}
      role="dialog"
      aria-labelledby="edit-modal-title"
      aria-modal="true"
    >
      <div class="modal__header">
        <h2 class="modal__title" id="edit-modal-title">{title}</h2>
        <button type="button" class="modal__close" aria-label="Cerrar" on:click={close}>&times;</button>
      </div>
      <div class="modal__body modal__body--scroll">
        <form class="edit-form" id="edit-form" on:submit={save}>
          {#if recordType === 'account'}
            {@const r = record as Account}
            <label class="edit-form__field">Nombre
              <input class="edit-form__input" name="name" value={r.name} required />
            </label>
            <label class="edit-form__field">Tipo
              <CustomSelect options={typeOptions} value={r.type} name="type" />
            </label>
            <label class="edit-form__field">Moneda
              <CustomSelect options={currencyOptions} value={r.currency} name="currency" />
            </label>
            <label class="edit-form__field">Rol
              <CustomSelect options={roleOptions} value={r.role || 'general'} name="role" />
            </label>
            <label class="edit-form__field">Meta
              <CustomSelect options={goalOptions} value={r.goal_id || ''} name="goal_id" />
            </label>
            <label class="edit-form__field">Emoji
              <input class="edit-form__input" name="emoji" value={r.emoji || '💰'} maxlength="4" />
            </label>
            <label class="edit-form__field">Balance inicial
              <MoneyInput class="edit-form__input" name="initial_balance" value={r.initial_balance ?? 0} emptyAsNull={false} />
            </label>
            <label class="edit-form__field">Balance actual
              <MoneyInput class="edit-form__input" name="current_balance" value={r.current_balance ?? 0} emptyAsNull={false} />
            </label>
          {:else if recordType === 'expense'}
            {@const r = record as ExpenseRecord}
            <label class="edit-form__field">Fecha
              <input class="edit-form__input" type="date" name="date" value={r.date || ''} />
            </label>
            <label class="edit-form__field">Cuenta
              <CustomSelect options={accountOptions} value={r.account_id || ''} name="account_id" />
            </label>
            <div class="edit-form__row">
              <label class="edit-form__field">Monto
                <MoneyInput class="edit-form__input" name="amount" value={r.amount ?? null} required />
              </label>
              <label class="edit-form__field">Moneda
                <CustomSelect options={currencyOptions} value={r.currency || 'COP'} name="currency" />
              </label>
            </div>
            <label class="edit-form__field edit-form__field--full">Categoría
              {#key categoryRecordId}
                <CategorySelector
                  {categories}
                  kind="expense"
                  selected={{ name: categoryName, emoji: categoryEmoji }}
                  on:change={(e) => { categoryName = e.detail.name; categoryEmoji = e.detail.emoji; }}
                />
              {/key}
              <input type="hidden" name="category" value={categoryName} />
              <input type="hidden" name="category_emoji" value={categoryEmoji} />
            </label>
            <label class="edit-form__field">Descripción
              <input class="edit-form__input" name="description" value={r.description || ''} />
            </label>
            <label class="edit-form__field">Método de pago
              <input class="edit-form__input" name="payment_method" value={r.payment_method || ''} />
            </label>
          {:else if recordType === 'income'}
            {@const r = record as IncomeRecord}
            <label class="edit-form__field">Fecha
              <input class="edit-form__input" type="date" name="date" value={r.date || ''} />
            </label>
            <label class="edit-form__field">Cuenta
              <CustomSelect options={accountOptions} value={r.account_id || ''} name="account_id" />
            </label>
            <div class="edit-form__row">
              <label class="edit-form__field">Monto
                <MoneyInput class="edit-form__input" name="amount" value={r.amount ?? null} required />
              </label>
              <label class="edit-form__field">Moneda
                <CustomSelect options={currencyOptions} value={r.currency || 'COP'} name="currency" />
              </label>
            </div>
            <label class="edit-form__field edit-form__field--full">Categoría
              {#key categoryRecordId}
                <CategorySelector
                  {categories}
                  kind="income"
                  selected={{ name: categoryName, emoji: categoryEmoji }}
                  on:change={(e) => { categoryName = e.detail.name; categoryEmoji = e.detail.emoji; }}
                />
              {/key}
              <input type="hidden" name="category" value={categoryName} />
              <input type="hidden" name="category_emoji" value={categoryEmoji} />
            </label>
            <label class="edit-form__field">Descripción
              <input class="edit-form__input" name="description" value={r.description || ''} />
            </label>
            <label class="edit-form__field">Fuente del ingreso
              <input class="edit-form__input" name="income_source" value={r.income_source || ''} />
            </label>
          {:else if recordType === 'investment'}
            {@const r = record as InvestmentRecord}
            {@const opType = r.operation_type || r.action || 'buy'}
            <label class="edit-form__field">Fecha
              <input class="edit-form__input" type="date" name="date" value={r.date || ''} />
            </label>
            <label class="edit-form__field">Cuenta
              <CustomSelect options={accountOptions} value={r.account_id || ''} name="account_id" />
            </label>
            <label class="edit-form__field">Tipo de operación
              <select class="edit-form__input" name="operation_type">
                {#each INVESTMENT_OPERATION_TYPES as opt}
                  <option value={opt.value} selected={opType === opt.value}>{opt.label}</option>
                {/each}
              </select>
            </label>
            <label class="edit-form__field">Activo
              <AssetSelect
                assets={investmentAssets}
                bind:value={investmentAsset}
                name="asset"
                required={opType !== 'deposit' && opType !== 'withdrawal'}
              />
            </label>
            <label class="edit-form__field">Tipo de activo
              <select class="edit-form__input" name="asset_type">
                {#each INVESTMENT_ASSET_TYPES as opt}
                  <option value={opt.value} selected={normalizeAssetType(r.asset_type) === opt.value}>{opt.label}</option>
                {/each}
              </select>
            </label>
            <div class="edit-form__row">
              <label class="edit-form__field">Cantidad
                <input class="edit-form__input" type="number" name="quantity" value={r.quantity ?? ''} step="any" />
              </label>
              <label class="edit-form__field">Precio unitario
                <MoneyInput class="edit-form__input" name="unit_price" value={r.unit_price ?? null} maxFractionDigits={4} />
              </label>
            </div>
            <div class="edit-form__row">
              <label class="edit-form__field">Monto USD
                <MoneyInput class="edit-form__input" name="amount_usd" value={r.amount_usd ?? null} />
              </label>
              <label class="edit-form__field">Monto COP
                <MoneyInput class="edit-form__input" name="amount_cop" value={r.amount_cop ?? null} />
              </label>
            </div>
            <div class="edit-form__row">
              <label class="edit-form__field">Costo cierre
                <MoneyInput class="edit-form__input" name="closing_cost" value={r.closing_cost ?? null} />
              </label>
              <label class="edit-form__field">P/G USD
                <MoneyInput class="edit-form__input" name="pnl_usd" value={r.pnl_usd ?? null} />
              </label>
            </div>
            <div class="edit-form__row">
              <label class="edit-form__field">Total
                <MoneyInput class="edit-form__input" name="total" value={r.total ?? r.amount ?? null} />
              </label>
              <label class="edit-form__field">Monto (legacy)
                <MoneyInput class="edit-form__input" name="amount" value={r.amount ?? null} />
              </label>
            </div>
            <label class="edit-form__field">Moneda
              <CustomSelect options={currencyOptions} value={r.currency || 'USD'} name="currency" />
            </label>
            <input type="hidden" name="action" value={opType} />
            <label class="edit-form__field edit-form__field--full">Categoría
              {#key categoryRecordId}
                <CategorySelector
                  {categories}
                  kind="investment"
                  selected={{ name: categoryName, emoji: categoryEmoji }}
                  on:change={(e) => { categoryName = e.detail.name; categoryEmoji = e.detail.emoji; }}
                />
              {/key}
              <input type="hidden" name="category" value={categoryName} />
              <input type="hidden" name="category_emoji" value={categoryEmoji} />
            </label>
            <label class="edit-form__field">Notas
              <textarea class="edit-form__input" name="notes" rows="2">{r.notes || ''}</textarea>
            </label>
          {:else if recordType === 'note'}
            {@const r = record as NoteRecord}
            <label class="edit-form__field">Fecha
              <input class="edit-form__input" type="date" name="date" value={r.date || ''} />
            </label>
            <label class="edit-form__field">Cuenta
              <CustomSelect options={accountOptions} value={r.account_id || ''} name="account_id" />
            </label>
            <label class="edit-form__field">Texto
              <textarea class="edit-form__input" name="text" rows="4" required>{r.text || ''}</textarea>
            </label>
            <label class="edit-form__field">Etiquetas (separadas por coma)
              <input class="edit-form__input" name="tags" value={(r.tags || []).join(', ')} />
            </label>
          {/if}
        </form>
      </div>
      <div class="modal__footer">
        <div class="modal__actions modal__actions--split">
          <button type="button" class="ghost-button modal__delete" on:click={remove}>Eliminar</button>
          <div class="modal__actions-right">
            <button type="button" class="secondary-button" on:click={close}>Cancelar</button>
            <button type="submit" form="edit-form" class="primary-button">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
