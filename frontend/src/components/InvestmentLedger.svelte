<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import SearchFilterBar from './SearchFilterBar.svelte';
  import { createInvestment, deleteInvestment } from '@/lib/api';
  import { filterInvestments, type InvestmentFilterState } from '@/lib/filters';
  import { applyFinancePayload } from '@/stores/finance';
  import { showToast } from '@/lib/toast';
  import { formatLedgerNumber, operationTypeLabel } from '@/lib/formatters';
  import type { InvestmentRecord } from '@/lib/types';

  export let investments: InvestmentRecord[] = [];

  const dispatch = createEventDispatcher<{ edit: { type: string; id: string }; refreshed: void }>();

  let showAddForm = false;
  let saving = false;

  let filters: InvestmentFilterState = {
    search: '',
    operationType: 'all',
    dateFrom: '',
    dateTo: '',
  };

  const typeOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'deposit', label: 'Depósito' },
    { value: 'buy', label: 'Compra' },
    { value: 'sell', label: 'Venta' },
    { value: 'dividend', label: 'Dividendo' },
  ];

  let newRow = {
    operation_type: 'buy',
    date: new Date().toISOString().slice(0, 10),
    asset: '',
    quantity: '',
    amount_usd: '',
    amount_cop: '',
    unit_price: '',
    closing_cost: '',
    pnl_usd: '',
    total: '',
  };

  $: filtered = filterInvestments(investments, filters);
  $: sorted = [...filtered].sort((a, b) => {
    const da = a.date || '';
    const db = b.date || '';
    return db.localeCompare(da);
  });
  $: hasFilters =
    filters.search.trim() !== '' ||
    filters.operationType !== 'all' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '';

  function parseNum(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function resolveOperationType(inv: InvestmentRecord): string {
    return inv.operation_type || inv.action || 'buy';
  }

  function displayTotal(inv: InvestmentRecord): number | null {
    if (inv.total != null) return inv.total;
    if (inv.amount != null) return inv.amount;
    return null;
  }

  async function submitNew(e: Event) {
    e.preventDefault();
    if (newRow.operation_type !== 'deposit' && !newRow.asset.trim()) {
      showToast('El activo es obligatorio', { type: 'error' });
      return;
    }
    saving = true;
    try {
      const amountUsd = parseNum(newRow.amount_usd);
      const total = parseNum(newRow.total);
      const data = await createInvestment({
        operation_type: newRow.operation_type,
        action: newRow.operation_type,
        date: newRow.date,
        asset: newRow.asset.trim(),
        quantity: parseNum(newRow.quantity),
        amount_usd: amountUsd,
        amount_cop: parseNum(newRow.amount_cop),
        unit_price: parseNum(newRow.unit_price),
        closing_cost: parseNum(newRow.closing_cost),
        pnl_usd: parseNum(newRow.pnl_usd),
        total,
        amount: total ?? amountUsd ?? 0,
        currency: amountUsd != null ? 'USD' : 'COP',
      });
      applyFinancePayload(data);
      dispatch('refreshed');
      showToast('Fila agregada', { type: 'success' });
      newRow = {
        operation_type: 'buy',
        date: new Date().toISOString().slice(0, 10),
        asset: '',
        quantity: '',
        amount_usd: '',
        amount_cop: '',
        unit_price: '',
        closing_cost: '',
        pnl_usd: '',
        total: '',
      };
      showAddForm = false;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al guardar', { type: 'error' });
    } finally {
      saving = false;
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar esta fila del libro de inversiones?')) return;
    try {
      const data = await deleteInvestment(id);
      applyFinancePayload(data);
      dispatch('refreshed');
      showToast('Fila eliminada', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al eliminar', { type: 'error' });
    }
  }
</script>

<section class="ledger-section section" id="libro-inversiones" aria-label="Libro de inversiones">
  <div class="ledger-section__header">
    <h2 class="card-title">Libro de inversiones</h2>
    <button type="button" class="secondary-button" on:click={() => (showAddForm = !showAddForm)}>
      {showAddForm ? 'Cancelar' : '+ Nueva fila'}
    </button>
  </div>

  <SearchFilterBar
    bind:search={filters.search}
    searchPlaceholder="Buscar activo o notas…"
    {typeOptions}
    bind:selectedType={filters.operationType}
    bind:dateFrom={filters.dateFrom}
    bind:dateTo={filters.dateTo}
    resultCount={sorted.length}
    totalCount={investments.length}
  />

  {#if showAddForm}
    <form class="ledger-add-form" on:submit={submitNew}>
      <div class="ledger-add-form__grid">
        <label>
          Tipo
          <select bind:value={newRow.operation_type}>
            <option value="deposit">Depósito</option>
            <option value="buy">Compra</option>
            <option value="sell">Venta</option>
            <option value="dividend">Dividendo</option>
          </select>
        </label>
        <label>
          Fecha
          <input type="date" bind:value={newRow.date} required />
        </label>
        <label>
          Activo
          <input type="text" bind:value={newRow.asset} placeholder="VTI, AAPL…" required={newRow.operation_type !== 'deposit'} />
        </label>
        <label>
          Cantidad
          <input type="number" bind:value={newRow.quantity} step="any" min="0" />
        </label>
        <label>
          Monto USD
          <input type="number" bind:value={newRow.amount_usd} step="0.01" />
        </label>
        <label>
          Monto COP
          <input type="number" bind:value={newRow.amount_cop} step="0.01" />
        </label>
        <label>
          Precio unitario
          <input type="number" bind:value={newRow.unit_price} step="0.0001" />
        </label>
        <label>
          Costo cierre
          <input type="number" bind:value={newRow.closing_cost} step="0.01" />
        </label>
        <label>
          P/G USD
          <input type="number" bind:value={newRow.pnl_usd} step="0.01" />
        </label>
        <label>
          Total
          <input type="number" bind:value={newRow.total} step="0.01" />
        </label>
      </div>
      <button type="submit" class="primary-button" disabled={saving}>
        {saving ? 'Guardando…' : 'Agregar fila'}
      </button>
    </form>
  {/if}

  {#if sorted.length}
    <div class="ledger-table-wrap">
      <table class="ledger-table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Fecha</th>
            <th>Activo</th>
            <th>Cantidad</th>
            <th>Monto USD</th>
            <th>Monto COP</th>
            <th>Precio unit.</th>
            <th>Costo cierre</th>
            <th>P/G USD</th>
            <th>Total</th>
            <th class="ledger-table__actions-col"></th>
          </tr>
        </thead>
        <tbody>
          {#each sorted as inv (inv.id)}
            <tr>
              <td>{operationTypeLabel(resolveOperationType(inv))}</td>
              <td>{inv.date || '—'}</td>
              <td class="ledger-table__asset">{inv.asset || '—'}</td>
              <td class="ledger-table__num">{formatLedgerNumber(inv.quantity)}</td>
              <td class="ledger-table__num">{formatLedgerNumber(inv.amount_usd)}</td>
              <td class="ledger-table__num">{formatLedgerNumber(inv.amount_cop)}</td>
              <td class="ledger-table__num">{formatLedgerNumber(inv.unit_price)}</td>
              <td class="ledger-table__num">{formatLedgerNumber(inv.closing_cost)}</td>
              <td class="ledger-table__num">{formatLedgerNumber(inv.pnl_usd)}</td>
              <td class="ledger-table__num">{formatLedgerNumber(displayTotal(inv))}</td>
              <td class="ledger-table__actions">
                <button
                  type="button"
                  class="timeline-action-btn"
                  on:click={() => dispatch('edit', { type: 'investment', id: inv.id })}
                >
                  Editar
                </button>
                <button type="button" class="timeline-action-btn timeline-action-btn--danger" on:click={() => remove(inv.id)}>
                  Eliminar
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if hasFilters}
    <div class="empty-state">
      <p class="empty-state__icon" aria-hidden="true">🔍</p>
      <p class="empty-state__title">Sin resultados</p>
      <p class="empty-state__text">Ninguna operación coincide con los filtros actuales.</p>
    </div>
  {:else}
    <div class="empty-state">
      <p class="empty-state__icon" aria-hidden="true">📈</p>
      <p class="empty-state__title">Sin operaciones registradas</p>
      <p class="empty-state__text">Agrega filas manualmente, importa CSV o sube un pantallazo con OCR.</p>
    </div>
  {/if}
</section>
