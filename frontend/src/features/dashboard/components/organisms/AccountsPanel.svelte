<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ACCOUNT_TYPES } from '@common/lib/formatters';
  import { createAccount } from '@common/lib/api';
  import { applyFinancePayload } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import CustomSelect from '@common/molecules/CustomSelect.svelte';
  import EmojiPickerField from '@common/molecules/EmojiPickerField.svelte';
  import MoneyInput from '@common/molecules/MoneyInput.svelte';
  import IconPlus from '@common/atoms/icons/IconPlus.svelte';
  import type { Account, Goal } from '@common/lib/types';

  export let accounts: Account[] = [];
  export let goals: Goal[] = [];

  const dispatch = createEventDispatcher<{
    edit: { type: string; id: string };
    delete: { type: string; id: string };
    refresh: void;
  }>();

  let panelOpen = false;
  let name = '';
  let type = 'cash';
  let currency = 'COP';
  let initialBalance: number | null = 0;
  let emoji = '💵';
  let goalId = '';
  let role = 'general';

  const typeOptions = Object.entries(ACCOUNT_TYPES).map(([value, label]) => ({ value, label }));
  const currencyOptions = [
    { value: 'COP', label: 'COP' },
    { value: 'USD', label: 'USD' },
  ];
  const roleOptions = [
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

  $: if (goalId && role === 'general') role = 'goal';

  async function submitAccount(e: Event) {
    e.preventDefault();
    try {
      const data = await createAccount({
        name: name.trim(),
        type,
        currency,
        initial_balance: initialBalance ?? 0,
        emoji: emoji || '💰',
        goal_id: goalId || null,
        role,
      });
      applyFinancePayload(data);
      dispatch('refresh');
      name = '';
      type = 'cash';
      currency = 'COP';
      initialBalance = 0;
      emoji = '💵';
      goalId = '';
      role = 'general';
      panelOpen = false;
      showToast('Cuenta creada', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al crear cuenta', { type: 'error' });
    }
  }

  function roleLabel(r: string | undefined) {
    if (r === 'operating') return 'Operativa';
    if (r === 'goal') return 'De meta';
    return '';
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
          {#if account.goal_title || roleLabel(account.role)}
            <div class="account-card__chips">
              {#if account.goal_title}
                <span class="account-chip">Meta · {account.goal_title}</span>
              {/if}
              {#if roleLabel(account.role)}
                <span class="account-chip account-chip--muted">{roleLabel(account.role)}</span>
              {/if}
            </div>
          {/if}
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
      <p class="empty-state__text">
        Crea una operativa (día a día) y bolsillos enlazados a tus metas. Luego asócialos desde Editar.
      </p>
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
    <span class="manual-toggle__icon" aria-hidden="true"><IconPlus size={18} /></span>
  </button>
  <div class="manual-panel" class:is-open={panelOpen}>
    <div class="manual-panel__inner">
      <form class="account-form" on:submit={submitAccount}>
        <input type="text" bind:value={name} placeholder="Nombre (ej. Efectivo)" required class="account-form__full" />
        <CustomSelect options={typeOptions} bind:value={type} />
        <CustomSelect options={currencyOptions} bind:value={currency} />
        <MoneyInput bind:value={initialBalance} placeholder="Balance inicial" emptyAsNull={false} />
        <CustomSelect options={roleOptions} bind:value={role} />
        <CustomSelect options={goalOptions} bind:value={goalId} />
        <div class="account-form__emoji">
          <span class="account-form__emoji-label">Emoji</span>
          <EmojiPickerField value={emoji} ariaLabel="Emoji de la cuenta" on:change={(e) => (emoji = e.detail)} />
        </div>
        <button type="submit" class="secondary-button account-form__full">Crear cuenta</button>
      </form>
    </div>
  </div>
</section>

<style>
  .manual-toggle__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    transition: transform 200ms var(--ease-out);
  }

  .manual-toggle[aria-expanded='true'] .manual-toggle__icon {
    transform: rotate(45deg);
  }

  .account-form__emoji {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .account-form__emoji-label {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .account-card__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0 0 8px;
  }

  .account-chip {
    display: inline-flex;
    align-items: center;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    padding: 0.2rem 0.5rem;
    border-radius: var(--radius-sm);
    background: rgba(15, 23, 42, 0.06);
    color: var(--text-strong);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-chip--muted {
    color: var(--text-muted);
    font-weight: 500;
  }

  @media (prefers-reduced-motion: reduce) {
    .manual-toggle__icon {
      transition: none;
    }
  }
</style>
