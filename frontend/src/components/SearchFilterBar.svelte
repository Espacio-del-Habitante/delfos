<script lang="ts">
  import IconSearch from './icons/IconSearch.svelte';
  import IconFilter from './icons/IconFilter.svelte';

  export let search = '';
  export let searchPlaceholder = 'Buscar…';
  export let showTypeFilter = true;
  export let typeOptions: { value: string; label: string }[] = [];
  export let selectedType = 'all';
  export let showDateRange = true;
  export let dateFrom = '';
  export let dateTo = '';
  export let resultCount: number | null = null;
  export let totalCount: number | null = null;
</script>

<div class="filter-bar">
  <div class="filter-bar__search">
    <span class="filter-bar__search-icon" aria-hidden="true"><IconSearch size={18} /></span>
    <input
      type="search"
      class="filter-bar__input"
      placeholder={searchPlaceholder}
      bind:value={search}
      aria-label="Buscar"
    />
  </div>

  {#if showTypeFilter && typeOptions.length}
    <div class="filter-bar__chips" role="group" aria-label="Filtrar por tipo">
      <span class="filter-bar__chips-label" aria-hidden="true"><IconFilter size={16} /></span>
      {#each typeOptions as opt}
        <button
          type="button"
          class="filter-bar__chip"
          class:is-active={selectedType === opt.value}
          on:click={() => (selectedType = opt.value)}
        >
          {opt.label}
        </button>
      {/each}
    </div>
  {/if}

  {#if showDateRange}
    <div class="filter-bar__dates">
      <label class="filter-bar__date-label">
        Desde
        <input type="date" bind:value={dateFrom} class="filter-bar__date-input" />
      </label>
      <label class="filter-bar__date-label">
        Hasta
        <input type="date" bind:value={dateTo} class="filter-bar__date-input" />
      </label>
    </div>
  {/if}

  {#if resultCount != null && totalCount != null}
    <p class="filter-bar__count">Mostrando {resultCount} de {totalCount}</p>
  {/if}
</div>
