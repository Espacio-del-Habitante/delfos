<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import SearchFilterBar from '@common/molecules/SearchFilterBar.svelte';
  import { filterMovements, type MovementFilterState } from '@common/lib/filters';
  import type { Movement, MovementFilterOption } from '@common/lib/types';

  export let movements: Movement[] = [];
  export let movementFilters: MovementFilterOption[] = [];

  const dispatch = createEventDispatcher<{ edit: { type: string; id: string }; delete: { type: string; id: string } }>();

  let filters: MovementFilterState = {
    search: '',
    type: 'all',
    dateFrom: '',
    dateTo: '',
  };

  $: typeOptions = movementFilters.map((f) => ({ value: f.id, label: f.label }));

  $: filtered = filterMovements(movements, filters);
  $: hasFilters =
    filters.search.trim() !== '' ||
    filters.type !== 'all' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '';
</script>

<section class="full-width-section section" id="movimientos" aria-label="Movimientos recientes">
  <h2 class="card-title">Movimientos recientes</h2>

  <SearchFilterBar
    bind:search={filters.search}
    searchPlaceholder="Buscar descripción, categoría o cuenta…"
    {typeOptions}
    bind:selectedType={filters.type}
    bind:dateFrom={filters.dateFrom}
    bind:dateTo={filters.dateTo}
    resultCount={filtered.length}
    totalCount={movements.length}
  />

  {#if filtered.length}
    <ul class="timeline-list">
      {#each filtered as m (m.id)}
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
                <span class="timeline-item__date">{m.date}</span>
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
