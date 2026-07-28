<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { confirmAllocation } from '@common/lib/api';
  import { applyFinancePayload } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import { formatAmount } from '@common/lib/formatters';
  import { createModalShellState, hideModalShell, showModalShell } from '@common/lib/modalShell';
  import MoneyInput from '@common/molecules/MoneyInput.svelte';
  import type { AllocationLine, AllocationProposal } from '@common/lib/types';

  export let open = false;
  export let proposal: AllocationProposal | null = null;

  const dispatch = createEventDispatcher<{ close: void; confirmed: void }>();

  let shell = createModalShellState();
  let lines: AllocationLine[] = [];
  let saving = false;

  $: contentReady = Boolean(open && proposal);
  $: syncOpen(contentReady);
  $: if (proposal && open) {
    lines = proposal.lines.map((ln) => ({ ...ln, amount: roundMoney(ln.amount) }));
  }

  function roundMoney(n: number): number {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function moneyLabel(n: number, currency = 'COP'): string {
    return formatAmount(roundMoney(n), currency);
  }

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

  function close() {
    open = false;
    dispatch('close');
  }

  function onOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function toggleLine(id: string) {
    lines = lines.map((ln) => {
      if (ln.id !== id || !ln.enabled || ln.kind === 'cushion') return ln;
      return { ...ln, accepted: !ln.accepted };
    });
  }

  function setAmount(id: string, n: number | null) {
    lines = lines.map((ln) => {
      if (ln.id !== id || !ln.editable) return ln;
      return { ...ln, amount: n != null && Number.isFinite(n) && n >= 0 ? roundMoney(n) : 0 };
    });
  }

  $: acceptedMove = roundMoney(
    lines
      .filter(
        (ln) =>
          ln.accepted &&
          ln.enabled &&
          ln.kind !== 'cushion' &&
          ln.kind !== 'investment_reserve',
      )
      .reduce((s, ln) => s + (Number(ln.amount) || 0), 0),
  );

  $: liquidLeft = proposal
    ? roundMoney(Math.max(0, proposal.income_amount - acceptedMove))
    : 0;

  async function confirm() {
    if (!proposal) return;
    saving = true;
    try {
      const next: AllocationProposal = {
        ...proposal,
        lines: lines.map((ln) => ({ ...ln, amount: roundMoney(ln.amount) })),
      };
      const data = await confirmAllocation(next);
      applyFinancePayload(data);
      showToast('Distribución aplicada', { type: 'success' });
      dispatch('confirmed');
      close();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al confirmar', { type: 'error' });
    } finally {
      saving = false;
    }
  }

  function declineAll() {
    close();
  }
</script>

{#if shell.rendered && proposal}
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
      aria-labelledby="alloc-modal-title"
      aria-modal="true"
    >
      <div class="modal__header">
        <h2 class="modal__title" id="alloc-modal-title">Distribuir salario</h2>
        <button type="button" class="modal__close" aria-label="Cerrar" on:click={close}>&times;</button>
      </div>
      <div class="modal__body modal__body--scroll">
        <p class="alloc-intro">
          Ingreso {moneyLabel(proposal.income_amount, proposal.currency)}. Revisa cada línea: gastos fijos,
          emergencia, metas, inversión y colchón. Acepta, omite o edita montos antes de confirmar.
        </p>
        {#if proposal.summary?.warning}
          <p class="alloc-warning" role="status">{proposal.summary.warning}</p>
        {/if}
        <ul class="alloc-lines">
          {#each lines as ln (ln.id)}
            <li class="alloc-line" class:alloc-line--disabled={!ln.enabled || ln.kind === 'cushion'}>
              <label class="alloc-line__check">
                <input
                  type="checkbox"
                  checked={ln.accepted}
                  disabled={!ln.enabled || ln.kind === 'cushion'}
                  on:change={() => toggleLine(ln.id)}
                />
                <span>
                  <strong>{ln.label}</strong>
                  {#if ln.disabled_reason}
                    <span class="alloc-line__reason">{ln.disabled_reason}</span>
                  {/if}
                </span>
              </label>
              {#if ln.editable && ln.enabled}
                <MoneyInput
                  class="alloc-line__amount"
                  value={roundMoney(ln.amount)}
                  emptyAsNull={false}
                  on:change={(e) => setAmount(ln.id, e.detail)}
                />
              {:else}
                <span class="alloc-line__amount-static">{moneyLabel(ln.amount, proposal.currency)}</span>
              {/if}
            </li>
          {/each}
        </ul>
        <dl class="alloc-summary">
          <div>
            <dt>A mover / gastar</dt>
            <dd>{moneyLabel(acceptedMove, proposal.currency)}</dd>
          </div>
          <div>
            <dt>Líquido en operativa</dt>
            <dd>{moneyLabel(liquidLeft, proposal.currency)}</dd>
          </div>
        </dl>
      </div>
      <div class="modal__footer">
        <button type="button" class="secondary-button" disabled={saving} on:click={declineAll}>
          Omitir
        </button>
        <button type="button" class="primary-button" disabled={saving} on:click={confirm}>
          Confirmar
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .alloc-intro {
    margin: 0 0 0.75rem;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .alloc-warning {
    margin: 0 0 0.75rem;
    padding: 0.65rem 0.75rem;
    border-radius: var(--radius-sm);
    background: rgba(239, 68, 68, 0.08);
    color: #b91c1c;
    font-size: 0.88rem;
    line-height: 1.35;
  }

  .alloc-lines {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.65rem;
  }

  .alloc-line {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
  }

  .alloc-line--disabled {
    opacity: 0.72;
  }

  .alloc-line__check {
    display: flex;
    gap: 0.55rem;
    align-items: flex-start;
    font-size: 0.9rem;
  }

  .alloc-line__check strong {
    display: block;
  }

  .alloc-line__reason {
    display: block;
    margin-top: 0.15rem;
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  :global(.alloc-line__amount) {
    width: 8.5rem;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    padding: 0.45rem 0.55rem;
    font: inherit;
    font-variant-numeric: tabular-nums;
  }

  .alloc-line__amount-static {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    text-align: right;
  }

  .alloc-summary {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    margin: 1rem 0 0;
  }

  .alloc-summary div {
    padding: 0.65rem 0.75rem;
    border-radius: var(--radius-sm);
    background: rgba(15, 23, 42, 0.03);
  }

  .alloc-summary dt {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .alloc-summary dd {
    margin: 0.2rem 0 0;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .modal__footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 1rem 1rem;
  }
</style>
