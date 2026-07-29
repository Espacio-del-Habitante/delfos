<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { confirmAllocation } from '@common/lib/api';
  import { applyFinancePayload } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import { formatAmount } from '@common/lib/formatters';
  import MoneyInput from '@common/molecules/MoneyInput.svelte';
  import type { AllocationLine, AllocationProposal } from '@common/lib/types';

  /** Panel embebible (sin shell propio); el stepper de ingreso lo monta en el mismo Modal. */
  export let proposal: AllocationProposal;

  const dispatch = createEventDispatcher<{ confirmed: void }>();

  let lines: AllocationLine[] = [];
  let fixedMode: 'total' | 'desglose' = 'total';
  let saving = false;
  let syncedProposal: AllocationProposal | null = null;

  $: hasDesglose = (proposal.fixed_desglose?.length ?? 0) > 0;

  $: if (proposal !== syncedProposal) {
    syncedProposal = proposal;
    const canDesglose = (proposal.fixed_desglose?.length ?? 0) > 0;
    fixedMode = proposal.fixed_mode === 'desglose' && canDesglose ? 'desglose' : 'total';
    lines = buildLines(fixedMode);
  }

  function cloneLine(ln: AllocationLine): AllocationLine {
    return { ...ln, amount: roundMoney(ln.amount) };
  }

  function buildLines(mode: 'total' | 'desglose'): AllocationLine[] {
    const nonFixed = proposal.lines
      .filter((ln) => ln.kind !== 'fixed_expense')
      .map(cloneLine);
    if (mode === 'desglose' && (proposal.fixed_desglose?.length ?? 0) > 0) {
      return [...proposal.fixed_desglose!.map(cloneLine), ...nonFixed];
    }
    const totalFixed = proposal.lines.filter((ln) => ln.kind === 'fixed_expense').map(cloneLine);
    return [...totalFixed, ...nonFixed];
  }

  function setFixedMode(mode: 'total' | 'desglose') {
    if (mode === fixedMode) return;
    if (mode === 'desglose' && !hasDesglose) return;
    // Conserva edits de líneas no-fijas al cambiar modo.
    const nonFixed = lines.filter((ln) => ln.kind !== 'fixed_expense');
    fixedMode = mode;
    if (mode === 'desglose' && proposal.fixed_desglose?.length) {
      lines = [...proposal.fixed_desglose.map(cloneLine), ...nonFixed];
    } else {
      const totalFixed = proposal.lines
        .filter((ln) => ln.kind === 'fixed_expense')
        .map(cloneLine);
      lines = [...totalFixed, ...nonFixed];
    }
  }

  function roundMoney(n: number): number {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function moneyLabel(n: number, currency = 'COP'): string {
    return formatAmount(roundMoney(n), currency);
  }

  function lineMovesOnAccept(ln: AllocationLine): boolean {
    if (ln.kind === 'investment_reserve') return false;
    if (ln.kind === 'fixed_expense') return true;
    if (ln.kind === 'cushion') {
      return Boolean(ln.to_account_id || ln.create_cushion_account);
    }
    return Boolean(ln.to_account_id);
  }

  function toggleLine(id: string) {
    lines = lines.map((ln) => {
      if (ln.id !== id || !ln.enabled) return ln;
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
      .filter((ln) => ln.accepted && ln.enabled && lineMovesOnAccept(ln))
      .reduce((s, ln) => s + (Number(ln.amount) || 0), 0),
  );

  $: liquidLeft = roundMoney(Math.max(0, proposal.income_amount - acceptedMove));

  $: fixedDesgloseSum = roundMoney(
    lines
      .filter((ln) => ln.kind === 'fixed_expense' && ln.enabled)
      .reduce((s, ln) => s + (Number(ln.amount) || 0), 0),
  );

  /** Llamado desde el footer del Modal padre (paso 3 del stepper). */
  export async function confirm() {
    if (saving) return;
    saving = true;
    try {
      const next: AllocationProposal = {
        ...proposal,
        fixed_mode: fixedMode,
        lines: lines.map((ln) => ({ ...ln, amount: roundMoney(ln.amount) })),
      };
      const data = await confirmAllocation(next);
      applyFinancePayload(data);
      showToast('Distribución aplicada', { type: 'success' });
      dispatch('confirmed');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al confirmar', { type: 'error' });
    } finally {
      saving = false;
    }
  }
</script>

<div class="alloc-panel">
  <p class="alloc-intro">
    Ingreso {moneyLabel(proposal.income_amount, proposal.currency)}. Revisa cada línea: gastos fijos,
    emergencia, metas, inversión y colchón. Acepta, omite o edita montos antes de confirmar.
  </p>
  {#if proposal.summary?.warning}
    <p class="alloc-warning" role="status">{proposal.summary.warning}</p>
  {/if}
  {#if proposal.summary?.note}
    <p class="alloc-note" role="status">{proposal.summary.note}</p>
  {/if}

  {#if hasDesglose}
    <div class="alloc-fixed-mode" role="group" aria-label="Modo de gastos fijos">
      <span class="alloc-fixed-mode__label">Gastos fijos</span>
      <div class="alloc-seg">
        <button
          type="button"
          class="alloc-seg__btn"
          class:is-active={fixedMode === 'total'}
          aria-pressed={fixedMode === 'total'}
          on:click={() => setFixedMode('total')}
        >
          Total
        </button>
        <button
          type="button"
          class="alloc-seg__btn"
          class:is-active={fixedMode === 'desglose'}
          aria-pressed={fixedMode === 'desglose'}
          on:click={() => setFixedMode('desglose')}
        >
          Desglose
        </button>
      </div>
    </div>
    {#if fixedMode === 'desglose'}
      <p class="alloc-fixed-hint">
        Suma del desglose: {moneyLabel(fixedDesgloseSum, proposal.currency)}
        {#if proposal.period_fixed_amount != null}
          · presupuesto periodo {moneyLabel(proposal.period_fixed_amount, proposal.currency)}
        {/if}
      </p>
    {/if}
  {/if}

  <ul class="alloc-lines">
    {#each lines as ln (ln.id)}
      <li
        class="alloc-line"
        class:alloc-line--disabled={!ln.enabled}
        class:alloc-line--cushion={ln.kind === 'cushion'}
      >
        <label class="alloc-line__check">
          <input
            type="checkbox"
            checked={ln.accepted}
            disabled={!ln.enabled}
            on:change={() => toggleLine(ln.id)}
          />
          <span>
            <strong>{ln.label}</strong>
            {#if ln.disabled_reason}
              <span class="alloc-line__reason">{ln.disabled_reason}</span>
            {/if}
            {#if ln.kind === 'cushion' && ln.accepted && ln.create_cushion_account}
              <span class="alloc-line__action">Al confirmar: crear cuenta Colchón y transferir.</span>
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

<style>
  .alloc-panel {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

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

  .alloc-note {
    margin: 0 0 0.75rem;
    padding: 0.65rem 0.75rem;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--text-strong) 5%, var(--surface));
    color: var(--text-muted);
    font-size: 0.88rem;
    line-height: 1.35;
  }

  .alloc-fixed-mode {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin: 0 0 0.55rem;
  }

  .alloc-fixed-mode__label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .alloc-seg {
    display: inline-flex;
    padding: 0.15rem;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--text-strong) 4%, var(--surface));
  }

  .alloc-seg__btn {
    border: 0;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    padding: 0.35rem 0.75rem;
    border-radius: calc(var(--radius-sm) - 2px);
    cursor: pointer;
    transition:
      background 160ms var(--ease, ease),
      color 160ms var(--ease, ease);
  }

  .alloc-seg__btn:hover {
    color: var(--text-strong);
  }

  .alloc-seg__btn.is-active {
    background: var(--text-strong, #0f172a);
    color: var(--surface, #fff);
  }

  .alloc-seg__btn:active {
    transform: scale(0.97);
  }

  .alloc-fixed-hint {
    margin: 0 0 0.65rem;
    font-size: 0.78rem;
    color: var(--text-muted);
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

  .alloc-line__action {
    display: block;
    margin-top: 0.2rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-strong);
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
</style>
