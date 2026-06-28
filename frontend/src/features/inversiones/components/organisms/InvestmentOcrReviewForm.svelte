<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import IconChevron from '@common/atoms/icons/IconChevron.svelte';
  import IconCheck from '@common/atoms/icons/IconCheck.svelte';
  import IconX from '@common/atoms/icons/IconX.svelte';
  import AssetSelect from '@common/molecules/AssetSelect.svelte';
  import { createInvestmentAsset } from '@common/lib/api';
  import { applyFinancePayload } from '@common/stores/finance';
  import { operationTypeLabel } from '@common/lib/formatters';
  import { showToast } from '@common/lib/toast';
  import type { InvestmentAsset, InvestmentLedgerRow } from '@common/lib/types';

  export let rows: InvestmentLedgerRow[] = [];
  export let imageUrl: string | null = null;
  export let warnings: string[] = [];
  export let assets: InvestmentAsset[] = [];

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

  function symbolExists(sym: string): boolean {
    const key = sym.trim().toUpperCase();
    return assets.some((a) => a.symbol.toUpperCase() === key);
  }

  async function ensureRowAsset(row: InvestmentLedgerRow): Promise<boolean> {
    const op = row.operation_type;
    if (op === 'deposit') return true;
    const sym = (row.asset || '').trim().toUpperCase();
    if (!sym) return true;
    if (symbolExists(sym)) {
      row.asset = sym;
      return true;
    }
    if (!confirm(`¿Deseas crear el activo ${sym}?`)) return false;
    try {
      const data = await createInvestmentAsset(sym);
      applyFinancePayload(data);
      assets = data.investment_assets ?? assets;
      row.asset = sym;
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al crear activo', { type: 'error' });
      return false;
    }
  }

  async function confirm() {
    for (let i = 0; i < rows.length; i++) {
      const err = validateRow(rows[i]);
      if (err) {
        activeIndex = i;
        showToast(err, { type: 'error' });
        return;
      }
      const ok = await ensureRowAsset(rows[i]);
      if (!ok) {
        activeIndex = i;
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
        <button type="button" class="secondary-button ocr-review-card__nav-btn" disabled={!canGoPrev} on:click={goPrev} aria-label="Fila anterior">
          <IconChevron direction="left" size={18} />
          Anterior
        </button>
        <button type="button" class="secondary-button ocr-review-card__nav-btn" disabled={!canGoNext} on:click={goNext} aria-label="Fila siguiente">
          Siguiente
          <IconChevron direction="right" size={18} />
        </button>
      </div>
    </div>
  </div>

  {#if warnings.length}
    <div class="ocr-review-card__warnings" role="alert">
      <p class="ocr-review-card__warnings-title">Revisa antes de confirmar</p>
      <ul class="ledger-ocr__warnings ledger-ocr__warnings--prominent">
        {#each warnings as warning}
          <li>{warning}</li>
        {/each}
      </ul>
    </div>
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
        <AssetSelect
          {assets}
          bind:value={activeRow.asset}
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
      {#if activeRow.operation_type === 'sell' || activeRow.operation_type === 'dividend'}
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
      {:else if activeRow.pnl_usd != null}
        <p class="ocr-review-card__field-hint">P/G USD detectado ({activeRow.pnl_usd}) — no aplica a compras/depósitos</p>
      {/if}
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
