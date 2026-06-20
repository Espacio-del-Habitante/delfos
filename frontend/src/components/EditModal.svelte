<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CategorySelector from './CategorySelector.svelte';
  import CustomSelect from './CustomSelect.svelte';
  import {
    deleteAccount,
    deleteExpense,
    deleteInvestment,
    deleteNote,
    updateAccount,
    updateExpense,
    updateInvestment,
    updateNote,
  } from '@/lib/api';
  import { ACCOUNT_TYPES } from '@/lib/formatters';
  import { applyFinancePayload } from '@/stores/finance';
  import { showToast } from '@/lib/toast';
  import type { Account, Category, EditRecordType, ExpenseRecord, InvestmentRecord, NoteRecord } from '@/lib/types';

  export let open = false;
  export let recordType: EditRecordType | null = null;
  export let record: Account | ExpenseRecord | InvestmentRecord | NoteRecord | null = null;
  export let accounts: Account[] = [];
  export let categories: Category[] = [];

  const dispatch = createEventDispatcher<{ close: void; saved: void; deleted: void }>();

  let categoryName = '';
  let categoryEmoji = '';

  $: accountOptions = [
    { value: '', label: 'Sin cuenta' },
    ...accounts.map((a) => ({ value: a.id, label: `${a.emoji} ${a.name}` })),
  ];
  $: typeOptions = Object.entries(ACCOUNT_TYPES).map(([value, label]) => ({ value, label }));
  $: currencyOptions = [
    { value: 'COP', label: 'COP' },
    { value: 'USD', label: 'USD' },
  ];

  $: title =
    recordType === 'account'
      ? 'Editar cuenta'
      : recordType === 'expense'
        ? 'Editar gasto'
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
      } else if (recordType === 'investment') {
        data = await updateInvestment(record.id, {
          date: val('date'),
          account_id: val('account_id') || null,
          asset: val('asset'),
          asset_type: val('asset_type') || 'ETF',
          amount: parseFloat(String(val('amount'))) || 0,
          currency: val('currency') || 'USD',
          action: val('action') || 'buy',
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
      investment: '¿Eliminar esta inversión?',
      note: '¿Eliminar esta nota?',
    };
    if (!confirm(messages[recordType] || '¿Eliminar este registro?')) return;
    try {
      let data;
      if (recordType === 'account') data = await deleteAccount(record.id);
      else if (recordType === 'expense') data = await deleteExpense(record.id);
      else if (recordType === 'investment') data = await deleteInvestment(record.id);
      else data = await deleteNote(record.id);
      applyFinancePayload(data);
      dispatch('deleted');
      showToast('Eliminado', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al eliminar', { type: 'error' });
    }
  }

  $: if (record && (recordType === 'expense' || recordType === 'investment')) {
    const r = record as ExpenseRecord | InvestmentRecord;
    categoryName = r.category || '';
    categoryEmoji = r.category_emoji || '';
  }
</script>

{#if open && record && recordType}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-overlay" aria-hidden="false" on:click={onOverlayClick}>
    <div class="modal" role="dialog" aria-labelledby="edit-modal-title" aria-modal="true">
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
            <label class="edit-form__field">Emoji
              <input class="edit-form__input" name="emoji" value={r.emoji || '💰'} maxlength="4" />
            </label>
            <label class="edit-form__field">Balance inicial
              <input class="edit-form__input" type="number" name="initial_balance" value={r.initial_balance ?? 0} step="0.01" />
            </label>
            <label class="edit-form__field">Balance actual
              <input class="edit-form__input" type="number" name="current_balance" value={r.current_balance ?? 0} step="0.01" />
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
                <input class="edit-form__input" type="number" name="amount" value={r.amount ?? ''} min="0" step="0.01" required />
              </label>
              <label class="edit-form__field">Moneda
                <CustomSelect options={currencyOptions} value={r.currency || 'COP'} name="currency" />
              </label>
            </div>
            <label class="edit-form__field edit-form__field--full">Categoría
              <CategorySelector
                {categories}
                kind="expense"
                selected={{ name: r.category, emoji: r.category_emoji }}
                on:change={(e) => { categoryName = e.detail.name; categoryEmoji = e.detail.emoji; }}
              />
              <input type="hidden" name="category" value={categoryName} />
              <input type="hidden" name="category_emoji" value={categoryEmoji} />
            </label>
            <label class="edit-form__field">Descripción
              <input class="edit-form__input" name="description" value={r.description || ''} />
            </label>
            <label class="edit-form__field">Método de pago
              <input class="edit-form__input" name="payment_method" value={r.payment_method || ''} />
            </label>
          {:else if recordType === 'investment'}
            {@const r = record as InvestmentRecord}
            <label class="edit-form__field">Fecha
              <input class="edit-form__input" type="date" name="date" value={r.date || ''} />
            </label>
            <label class="edit-form__field">Cuenta
              <CustomSelect options={accountOptions} value={r.account_id || ''} name="account_id" />
            </label>
            <label class="edit-form__field">Activo
              <input class="edit-form__input" name="asset" value={r.asset || ''} required />
            </label>
            <label class="edit-form__field">Tipo de activo
              <select class="edit-form__input" name="asset_type">
                {#each ['ETF', 'Stock', 'Crypto', 'Fund', 'Other'] as t}
                  <option value={t} selected={r.asset_type === t}>{t}</option>
                {/each}
              </select>
            </label>
            <div class="edit-form__row">
              <label class="edit-form__field">Monto
                <input class="edit-form__input" type="number" name="amount" value={r.amount ?? ''} min="0" step="0.01" required />
              </label>
              <label class="edit-form__field">Moneda
                <CustomSelect options={currencyOptions} value={r.currency || 'USD'} name="currency" />
              </label>
            </div>
            <label class="edit-form__field">Acción
              <select class="edit-form__input" name="action">
                <option value="buy" selected={r.action === 'buy'}>Compra</option>
                <option value="sell" selected={r.action === 'sell'}>Venta</option>
              </select>
            </label>
            <label class="edit-form__field edit-form__field--full">Categoría
              <CategorySelector
                {categories}
                kind="investment"
                selected={{ name: r.category, emoji: r.category_emoji }}
                on:change={(e) => { categoryName = e.detail.name; categoryEmoji = e.detail.emoji; }}
              />
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
