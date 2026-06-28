<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ACCOUNT_TYPES } from '@common/lib/formatters';
  import { createAccount } from '@common/lib/api';
  import { applyFinancePayload } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import CustomSelect from '@common/molecules/CustomSelect.svelte';
  import type { Account } from '@common/lib/types';

  export let accounts: Account[] = [];

  const dispatch = createEventDispatcher<{
    edit: { type: string; id: string };
    delete: { type: string; id: string };
    refresh: void;
  }>();

  let panelOpen = false;
  let name = '';
  let type = 'cash';
  let currency = 'COP';
  let initialBalance = 0;
  let emoji = '💵';

  const typeOptions = Object.entries(ACCOUNT_TYPES).map(([value, label]) => ({ value, label }));
  const currencyOptions = [
    { value: 'COP', label: 'COP' },
    { value: 'USD', label: 'USD' },
  ];

  async function submitAccount(e: Event) {
    e.preventDefault();
    try {
      const data = await createAccount({
        name: name.trim(),
        type,
        currency,
        initial_balance: initialBalance,
        emoji: emoji || '💰',
      });
      applyFinancePayload(data);
      dispatch('refresh');
      name = '';
      type = 'cash';
      currency = 'COP';
      initialBalance = 0;
      emoji = '💵';
      panelOpen = false;
      showToast('Cuenta creada', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al crear cuenta', { type: 'error' });
    }
  }
</script>

<section class="accounts-panel section" id="cuentas" aria-label="Cuentas">
  <h2 class="card-title">Cuentas</h2>

  {#if accounts.length}
    <div class="accounts-grid">
      {#each accounts as account (account.id)}
        <article class="account-card" class:account-card--negative={account.is_negative} data-account-id={account.id}>
          <div class="account-card__header">
            <div class="account-card__emoji" aria-hidden="true">{account.emoji}</div>
            <div class="account-card__actions">
              <button
                type="button"
                class="card-action-btn"
                on:click={() => dispatch('edit', { type: 'account', id: account.id })}
              >Editar</button>
              <button
                type="button"
                class="card-action-btn card-action-btn--danger"
                on:click={() => dispatch('delete', { type: 'account', id: account.id })}
              >Eliminar</button>
            </div>
          </div>
          <p class="account-card__name">{account.name}</p>
          <p class="account-card__meta">{account.currency} · {account.type_label || account.type}</p>
          <div class="account-card__balance-row">
            <p class="account-card__balance amount" class:account-card__balance--negative={account.is_negative}>
              {account.balance_display}
            </p>
            {#if account.is_negative}
              <span class="account-card__debt-badge">En deuda</span>
            {/if}
          </div>
          {#if account.movement_count}
            <p class="account-card__movements">
              {account.movement_count} movimiento{account.movement_count !== 1 ? 's' : ''}
            </p>
          {/if}
        </article>
      {/each}
    </div>
  {:else}
    <div class="empty-state">
      <div class="empty-state__icon" aria-hidden="true">◎</div>
      <p class="empty-state__title">Aún no tienes cuentas</p>
      <p class="empty-state__text">Crea tu primera cuenta: efectivo, banco, tarjeta o broker.</p>
    </div>
  {/if}

  <button
    type="button"
    class="manual-toggle"
    style="margin-top: 14px;"
    aria-expanded={panelOpen}
    on:click={() => (panelOpen = !panelOpen)}
  >
    Nueva cuenta
    <span class="manual-toggle__chevron" aria-hidden="true">▾</span>
  </button>
  <div class="manual-panel" class:is-open={panelOpen}>
    <form class="account-form" on:submit={submitAccount}>
      <input type="text" bind:value={name} placeholder="Nombre (ej. Efectivo)" required class="account-form__full" />
      <CustomSelect options={typeOptions} bind:value={type} />
      <CustomSelect options={currencyOptions} bind:value={currency} />
      <input type="number" bind:value={initialBalance} placeholder="Balance inicial" min="0" step="0.01" />
      <input type="text" bind:value={emoji} placeholder="Emoji" maxlength="4" />
      <button type="submit" class="secondary-button account-form__full">Crear cuenta</button>
    </form>
  </div>
</section>
