<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import IconChevron from './icons/IconChevron.svelte';
  import IconCheck from './icons/IconCheck.svelte';
  import IconX from './icons/IconX.svelte';
  import { operationTypeLabel } from '@/lib/formatters';
  import { showToast } from '@/lib/toast';
  import type { InvestmentLedgerRow } from '@/lib/types';

  export let rows: InvestmentLedgerRow[] = [];
  export let imageUrl: string | null = null;
  export let warnings: string[] = [];

  const dispatch = createEventDispatcher<{ confirm: InvestmentLedgerRow[]; discard: void }>();

  let activeIndex = 0;

  const operationOptions = [
    { value: 'deposit', label: 'Depósito' },
    { value: 'buy', label: 'Compra' },
    { value: 'sell', label: 'Venta' },
    { value: 'dividend', label: 'Dividendo' },
  ];

  $: activeRow = rows[activeIndex];
  $: canGoPrev = activeIndex > 0;
  $: canGoNext = activeIndex < rows.length - 1;

  function parseOptionalNumber(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function goPrev() {
    if (canGoPrev) activeIndex -= 1;
  }

  function goNext() {
    if (canGoNext) activeIndex += 1;
  }

  function selectRow(index: number) {
    activeIndex = index;
  }

  function validateRow(row: InvestmentLedgerRow): string | null {
    if (!row.date) return 'La fecha es obligatoria';
    if (!row.operation_type) return 'El tipo de operación es obligatorio';
    const op = row.operation_type;
    if (op !== 'deposit' && !row.asset?.trim()) return 'El activo es obligatorio para esta operación';
    return null;
  }

  function confirm() {
    for (let i = 0; i < rows.length; i++) {
      const err = validateRow(rows[i]);
      if (err) {
        activeIndex = i;
        showToast(err, { type: 'error' });
        return;
      }
    }
    dispatch('confirm', rows);
  }

  function discard() {
    dispatch('discard');
  }
</script>

<div class="ocr-review-card">
  <div class="ocr-review-card__header">
    {#if imageUrl}
      <figure class="ocr-review-card__thumb">
        <img src={imageUrl} alt="Pantallazo subido" />
      </figure>
    {/if}
    <div class="ocr-review-card__meta">
      <p class="ocr-review-card__counter">
        Fila {activeIndex + 1} de {rows.length}
      </p>
      <div class="ocr-review-card__nav">
        <button type="button" class="icon-button" disabled={!canGoPrev} on:click={goPrev} aria-label="Fila anterior">
          <IconChevron direction="left" size={18} />
          Anterior
        </button>
        <button type="button" class="icon-button" disabled={!canGoNext} on:click={goNext} aria-label="Fila siguiente">
          Siguiente
          <IconChevron direction="right" size={18} />
        </button>
      </div>
    </div>
  </div>

  {#if warnings.length}
    <ul class="ledger-ocr__warnings">
      {#each warnings as warning}
        <li>{warning}</li>
      {/each}
    </ul>
  {/if}

  {#if activeRow}
    <form class="ocr-review-card__form" on:submit|preventDefault={confirm}>
      <label>
        Tipo de operación
        <select bind:value={activeRow.operation_type}>
          {#each operationOptions as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </label>
      <label>
        Fecha
        <input type="date" bind:value={activeRow.date} required />
      </label>
      <label>
        Activo
        <input
          type="text"
          bind:value={activeRow.asset}
          placeholder="VTI, AAPL…"
          required={activeRow.operation_type !== 'deposit'}
        />
      </label>
      <label>
        Cantidad
        <input
          type="text"
          value={activeRow.quantity ?? ''}
          on:input={(e) => {
            activeRow.quantity = parseOptionalNumber(e.currentTarget.value);
            rows = rows;
          }}
        />
      </label>
      <label>
        Monto USD
        <input
          type="text"
          value={activeRow.amount_usd ?? ''}
          on:input={(e) => {
            activeRow.amount_usd = parseOptionalNumber(e.currentTarget.value);
            rows = rows;
          }}
        />
      </label>
      <label>
        Monto COP
        <input
          type="text"
          value={activeRow.amount_cop ?? ''}
          on:input={(e) => {
            activeRow.amount_cop = parseOptionalNumber(e.currentTarget.value);
            rows = rows;
          }}
        />
      </label>
      <label>
        Precio unitario
        <input
          type="text"
          value={activeRow.unit_price ?? ''}
          on:input={(e) => {
            activeRow.unit_price = parseOptionalNumber(e.currentTarget.value);
            rows = rows;
          }}
        />
      </label>
      <label>
        Costo cierre
        <input
          type="text"
          value={activeRow.closing_cost ?? ''}
          on:input={(e) => {
            activeRow.closing_cost = parseOptionalNumber(e.currentTarget.value);
            rows = rows;
          }}
        />
      </label>
      <label>
        P/G USD
        <input
          type="text"
          value={activeRow.pnl_usd ?? ''}
          on:input={(e) => {
            activeRow.pnl_usd = parseOptionalNumber(e.currentTarget.value);
            rows = rows;
          }}
        />
      </label>
      <label>
        Total
        <input
          type="text"
          value={activeRow.total ?? ''}
          on:input={(e) => {
            activeRow.total = parseOptionalNumber(e.currentTarget.value);
            rows = rows;
          }}
        />
      </label>
    </form>
  {/if}

  <ul class="ocr-review-card__row-list" aria-label="Filas detectadas">
    {#each rows as row, i}
      <li>
        <button
          type="button"
          class="ocr-review-card__row-btn"
          class:is-active={i === activeIndex}
          on:click={() => selectRow(i)}
        >
          <span>{row.date || '—'}</span>
          <span>{operationTypeLabel(row.operation_type || 'buy')}</span>
          <span>{row.asset || '—'}</span>
        </button>
      </li>
    {/each}
  </ul>

  <div class="ocr-review-card__actions">
    <button type="button" class="primary-button" on:click={confirm}>
      <IconCheck size={18} />
      Confirmar {rows.length} fila{rows.length !== 1 ? 's' : ''}
    </button>
    <button type="button" class="ghost-button" on:click={discard}>
      <IconX size={18} />
      Descartar
    </button>
  </div>
</div>
