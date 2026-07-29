<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import SearchFilterBar from '@common/molecules/SearchFilterBar.svelte';
  import TablePagination from '@common/molecules/TablePagination.svelte';
  import { getMovements } from '@common/lib/api';
  import type { MovementFilterState } from '@common/lib/filters';
  import { formatMovementDate } from '@common/lib/formatters';
  import { finance } from '@common/stores/finance';
  import type { Movement, MovementFilterOption } from '@common/lib/types';

  /** Preview de /api/finance; la lista paginada usa GET /api/movements. */
  export let movements: Movement[] = [];
  export let movementFilters: MovementFilterOption[] = [];

  const dispatch = createEventDispatcher<{ edit: { type: string; id: string }; delete: { type: string; id: string } }>();
  const PAGE_SIZE = 25;

  let filters: MovementFilterState = {
    search: '',
    type: 'all',
    dateFrom: '',
    dateTo: '',
  };

  let page = 1;
  let items: Movement[] = [];
  let total = 0;
  let loading = false;
  let loadError = '';
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let prevFilterSig = '';

  $: typeOptions = movementFilters.map((f) => ({ value: f.id, label: f.label }));

  $: hasFilters =
    filters.search.trim() !== '' ||
    filters.type !== 'all' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '';

  $: filterSig = `${filters.search}|${filters.type}|${filters.dateFrom}|${filters.dateTo}`;
  $: if (filterSig !== prevFilterSig) {
    prevFilterSig = filterSig;
    if (page !== 1) page = 1;
  }

  // total_movements cambia tras create/delete → refetch sin perder filtros.
  $: loadKey = `${filterSig}|${page}|${$finance?.summary?.total_movements ?? 0}`;
  $: {
    loadKey;
    scheduleLoad();
  }

  function scheduleLoad() {
    if (debounceTimer) clearTimeout(debounceTimer);
    const delay = filters.search.trim() ? 250 : 0;
    debounceTimer = setTimeout(() => {
      void load();
    }, delay);
  }

  async function load() {
    loading = true;
    loadError = '';
    try {
      const res = await getMovements({
        date_from: filters.dateFrom || undefined,
        date_to: filters.dateTo || undefined,
        kind: filters.type !== 'all' ? filters.type : undefined,
        q: filters.search || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      items = res.items;
      total = res.total;
      if (res.page !== page) page = res.page;
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'No se pudieron cargar movimientos';
      items = movements.slice(0, PAGE_SIZE);
      total = movements.length;
    } finally {
      loading = false;
    }
  }
</script>

<section class="full-width-section section movements-section" id="movimientos" aria-label="Movimientos recientes">
  <h2 class="card-title">Movimientos recientes</h2>

  <SearchFilterBar
    bind:search={filters.search}
    searchPlaceholder="Buscar descripción, categoría o cuenta…"
    {typeOptions}
    bind:selectedType={filters.type}
    bind:dateFrom={filters.dateFrom}
    bind:dateTo={filters.dateTo}
    resultCount={items.length}
    totalCount={total}
  />

  {#if loadError}
    <p class="muted" role="alert">{loadError}</p>
  {/if}

  {#if items.length}
    <ul class="timeline-list" class:is-loading={loading} aria-busy={loading}>
      {#each items as m (m.id)}
        <li class="timeline-item" data-movement-type={m.type} data-movement-id={m.id}>
          <div class="timeline-item__icon timeline-item__icon--{m.icon || m.type}" aria-hidden="true">
            {#if m.category_emoji}
              {m.category_emoji}
            {:else if m.type === 'expense'}
              ↓
            {:else if m.type === 'investment'}
              ↗
            {:else}
              ✎
            {/if}
          </div>
          <div class="timeline-item__body">
            <div class="timeline-item__top">
              <span class="timeline-item__type">{m.type_label || m.type}</span>
              <div class="timeline-item__top-right">
                <span class="timeline-item__date">{formatMovementDate(m.date)}</span>
                <div class="timeline-item__actions">
                  <button type="button" class="timeline-action-btn" on:click={() => dispatch('edit', { type: m.type, id: m.id })}>Editar</button>
                  <button type="button" class="timeline-action-btn timeline-action-btn--danger" on:click={() => dispatch('delete', { type: m.type, id: m.id })}>Eliminar</button>
                </div>
              </div>
            </div>
            <p class="timeline-item__desc">{m.description}</p>
            <div class="timeline-item__bottom">
              {#if m.amount}
                <span class="timeline-item__amount timeline-item__amount--{m.type}">{m.amount}</span>
              {:else}
                <span class="muted">—</span>
              {/if}
              {#if m.category}
                <span class="category-chip">{#if m.category_emoji}{m.category_emoji} {/if}{m.category}</span>
              {/if}
              {#if m.account_name}
                <span class="category-chip">{m.account_name}</span>
              {/if}
            </div>
          </div>
        </li>
      {/each}
    </ul>
    <TablePagination bind:page pageSize={PAGE_SIZE} totalItems={total} />
  {:else if loading}
    <div class="empty-state">
      <p class="empty-state__title">Cargando movimientos…</p>
    </div>
  {:else if hasFilters}
    <div class="empty-state">
      <p class="empty-state__icon" aria-hidden="true">🔍</p>
      <p class="empty-state__title">Sin resultados</p>
      <p class="empty-state__text">Ningún movimiento coincide con los filtros actuales.</p>
    </div>
  {:else}
    <div class="empty-state">
      <div class="empty-state__icon" aria-hidden="true">◎</div>
      <p class="empty-state__title">Todavía no hay movimientos</p>
      <p class="empty-state__text">Escribe o dicta tu primer gasto, inversión o nota.</p>
    </div>
  {/if}
</section>

<style>
  .movements-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .movements-section :global(.card-title) {
    margin-bottom: 0;
  }

  .movements-section :global(.filter-bar) {
    margin-bottom: 0;
  }

  .timeline-list.is-loading {
    opacity: 0.65;
  }
</style>
