<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import SearchFilterBar from '@common/molecules/SearchFilterBar.svelte';
  import TablePagination from '@common/molecules/TablePagination.svelte';
  import { deleteInvestment } from '@common/lib/api';
  import { filterInvestments, type InvestmentFilterState } from '@common/lib/filters';
  import { applyFinancePayload } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import { formatLedgerNumber, operationTypeLabel } from '@common/lib/formatters';
  import type { InvestmentRecord } from '@common/lib/types';

  export let investments: InvestmentRecord[] = [];
  export let assetFilter = '';

  const dispatch = createEventDispatcher<{
    edit: { type: string; id: string };
    refreshed: void;
    newRow: void;
  }>();

  const PAGE_SIZE = 25;

  type SortKey =
    | 'operation_type'
    | 'date'
    | 'asset'
    | 'quantity'
    | 'amount_usd'
    | 'amount_cop'
    | 'unit_price'
    | 'closing_cost'
    | 'pnl_usd'
    | 'total';

  const columns: { key: SortKey; label: string; numeric?: boolean }[] = [
    { key: 'operation_type', label: 'Tipo' },
    { key: 'date', label: 'Fecha' },
    { key: 'asset', label: 'Activo' },
    { key: 'quantity', label: 'Cantidad', numeric: true },
    { key: 'amount_usd', label: 'Monto USD', numeric: true },
    { key: 'amount_cop', label: 'Monto COP', numeric: true },
    { key: 'unit_price', label: 'Precio unit.', numeric: true },
    { key: 'closing_cost', label: 'Costo cierre', numeric: true },
    { key: 'pnl_usd', label: 'P/G USD', numeric: true },
    { key: 'total', label: 'Total', numeric: true },
  ];

  let filters: InvestmentFilterState = {
    search: '',
    asset: '',
    operationType: 'all',
    dateFrom: '',
    dateTo: '',
  };

  let sortKey: SortKey = 'date';
  let sortDir: 'asc' | 'desc' = 'desc';
  let currentPage = 1;
  let prevFilterKey = '';
  let selectedIds = new Set<string>();
  let bulkDeleting = false;

  const typeOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'deposit', label: 'Depósito' },
    { value: 'buy', label: 'Compra' },
    { value: 'sell', label: 'Venta' },
    { value: 'dividend', label: 'Dividendo' },
  ];

  $: if (assetFilter !== filters.asset) {
    filters = { ...filters, asset: assetFilter };
  }

  $: filtered = filterInvestments(investments, filters);

  $: filterKey = `${filters.search}|${filters.asset}|${filters.operationType}|${filters.dateFrom}|${filters.dateTo}`;
  $: if (filterKey !== prevFilterKey) {
    prevFilterKey = filterKey;
    currentPage = 1;
  }

  function resolveOperationType(inv: InvestmentRecord): string {
    return inv.operation_type || inv.action || 'buy';
  }

  function displayTotal(inv: InvestmentRecord): number | null {
    if (inv.total != null) return inv.total;
    if (inv.amount != null) return inv.amount;
    return null;
  }

  function sortValue(inv: InvestmentRecord, key: SortKey): string | number {
    switch (key) {
      case 'operation_type':
        return operationTypeLabel(resolveOperationType(inv));
      case 'date':
        return inv.date || '';
      case 'asset':
        return (inv.asset || '').toLowerCase();
      case 'total':
        return displayTotal(inv) ?? -Infinity;
      default: {
        const raw = inv[key as keyof InvestmentRecord];
        if (typeof raw === 'number') return raw;
        return raw == null ? -Infinity : Number(raw) || -Infinity;
      }
    }
  }

  function compareRows(a: InvestmentRecord, b: InvestmentRecord): number {
    const av = sortValue(a, sortKey);
    const bv = sortValue(b, sortKey);
    let cmp: number;
    if (typeof av === 'number' && typeof bv === 'number') {
      cmp = av - bv;
    } else {
      cmp = String(av).localeCompare(String(bv), 'es', { numeric: true });
    }
    return sortDir === 'asc' ? cmp : -cmp;
  }

  $: sorted = [...filtered].sort(compareRows);

  $: totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  $: if (currentPage > totalPages) currentPage = totalPages;
  $: pageStart = (currentPage - 1) * PAGE_SIZE;
  $: pageItems = sorted.slice(pageStart, pageStart + PAGE_SIZE);

  $: hasFilters =
    filters.search.trim() !== '' ||
    filters.asset.trim() !== '' ||
    filters.operationType !== 'all' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '';

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = key === 'date' ? 'desc' : 'asc';
    }
    currentPage = 1;
  }

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
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

  $: presentIds = new Set(investments.map((inv) => inv.id));
  $: pageIds = pageItems.map((inv) => inv.id);
  $: allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  $: somePageSelected = pageIds.some((id) => selectedIds.has(id));
  // Cuenta solo selecciones aún presentes; ids obsoletos (tras borrar) se ignoran.
  $: selectedCount = [...selectedIds].filter((id) => presentIds.has(id)).length;

  function toggleRow(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function toggleAllPage() {
    const next = new Set(selectedIds);
    if (allPageSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    selectedIds = next;
  }

  async function removeSelected() {
    const ids = [...selectedIds].filter((id) => presentIds.has(id));
    if (!ids.length) return;
    const noun = ids.length === 1 ? 'fila' : 'filas';
    if (!confirm(`¿Eliminar ${ids.length} ${noun} del libro de inversiones?`)) return;
    bulkDeleting = true;
    let data;
    try {
      for (const id of ids) {
        data = await deleteInvestment(id);
      }
      if (data) applyFinancePayload(data);
      selectedIds = new Set();
      dispatch('refreshed');
      showToast(`${ids.length} ${noun} eliminadas`, { type: 'success' });
    } catch (err) {
      if (data) applyFinancePayload(data);
      selectedIds = new Set();
      dispatch('refreshed');
      showToast(err instanceof Error ? err.message : 'Error al eliminar', { type: 'error' });
    } finally {
      bulkDeleting = false;
    }
  }
</script>

<section class="ledger-section section" id="libro-inversiones" aria-label="Libro de inversiones">
  <div class="ledger-section__header">
    <h2 class="card-title">Libro de inversiones</h2>
    <div class="ledger-section__actions">
      {#if selectedCount > 0}
        <button type="button" class="danger-button" on:click={removeSelected} disabled={bulkDeleting}>
          {bulkDeleting ? 'Eliminando…' : `Eliminar seleccionadas (${selectedCount})`}
        </button>
      {/if}
      <button type="button" class="secondary-button" on:click={() => dispatch('newRow')}>
        + Nueva fila
      </button>
    </div>
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

  {#if sorted.length}
    <div class="ledger-table-wrap">
      <table class="ledger-table">
        <thead>
          <tr>
            <th class="ledger-table__select-col">
              <input
                type="checkbox"
                class="ledger-table__checkbox"
                aria-label="Seleccionar todas las filas visibles"
                checked={allPageSelected}
                indeterminate={somePageSelected && !allPageSelected}
                on:change={toggleAllPage}
              />
            </th>
            {#each columns as col (col.key)}
              <th
                class:ledger-table__num={col.numeric}
                class:ledger-table__sortable={true}
                class:is-sorted={sortKey === col.key}
                aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button type="button" class="ledger-table__sort-btn" on:click={() => toggleSort(col.key)}>
                  {col.label}{sortIndicator(col.key)}
                </button>
              </th>
            {/each}
            <th class="ledger-table__actions-col"></th>
          </tr>
        </thead>
        <tbody>
          {#each pageItems as inv (inv.id)}
            <tr class:is-selected={selectedIds.has(inv.id)}>
              <td class="ledger-table__select-col">
                <input
                  type="checkbox"
                  class="ledger-table__checkbox"
                  aria-label="Seleccionar fila"
                  checked={selectedIds.has(inv.id)}
                  on:change={() => toggleRow(inv.id)}
                />
              </td>
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

    <TablePagination bind:page={currentPage} pageSize={PAGE_SIZE} totalItems={sorted.length} />
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
