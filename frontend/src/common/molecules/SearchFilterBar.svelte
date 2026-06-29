<script lang="ts">
  import IconSearch from '@common/atoms/icons/IconSearch.svelte';
  import IconFilter from '@common/atoms/icons/IconFilter.svelte';
  import FilterPopover from '@common/molecules/FilterPopover.svelte';

  export let search = '';
  export let searchPlaceholder = 'Buscar…';
  export let showTypeFilter = true;
  export let typeOptions: { value?: string; id?: string; label: string }[] = [];
  export let selectedType = 'all';
  export let showDateRange = true;
  export let dateFrom = '';
  export let dateTo = '';
  export let resultCount: number | null = null;
  export let totalCount: number | null = null;

  let popoverOpen = false;
  let triggerEl: HTMLButtonElement;

  function optionId(opt: { value?: string; id?: string }): string {
    return opt.id ?? opt.value ?? '';
  }

  function formatDateShort(iso: string): string {
    if (!iso) return '';
    const [, month, day] = iso.split('-');
    return `${day}/${month}`;
  }

  $: selectedTypeLabel =
    typeOptions.find((opt) => optionId(opt) === selectedType)?.label ?? 'Todos';

  $: filterLabel = (() => {
    const parts: string[] = [];
    if (showTypeFilter && typeOptions.length && selectedType !== 'all') {
      parts.push(selectedTypeLabel);
    }
    if (showDateRange) {
      if (dateFrom && dateTo) parts.push(`${formatDateShort(dateFrom)}–${formatDateShort(dateTo)}`);
      else if (dateFrom) parts.push(`Desde ${formatDateShort(dateFrom)}`);
      else if (dateTo) parts.push(`Hasta ${formatDateShort(dateTo)}`);
    }
    return parts.length ? parts.join(' · ') : 'Filtros';
  })();
  $: hasActiveFilters = selectedType !== 'all' || dateFrom !== '' || dateTo !== '';
  $: showFilterTrigger = (showTypeFilter && typeOptions.length > 0) || showDateRange;

  function togglePopover() {
    popoverOpen = !popoverOpen;
  }

  function closePopover() {
    popoverOpen = false;
  }
</script>

<div class="filter-bar">
  <div class="filter-toolbar">
    <div class="filter-toolbar__search">
      <span class="filter-toolbar__search-icon" aria-hidden="true"><IconSearch size={18} /></span>
      <input
        type="search"
        class="filter-toolbar__input"
        placeholder={searchPlaceholder}
        bind:value={search}
        aria-label="Buscar"
      />
    </div>

    {#if showFilterTrigger}
      <button
        type="button"
        class="filter-toolbar__trigger"
        class:has-active-filters={hasActiveFilters}
        bind:this={triggerEl}
        aria-expanded={popoverOpen}
        aria-haspopup="dialog"
        on:click={togglePopover}
      >
        <span class="filter-toolbar__trigger-icon" aria-hidden="true"><IconFilter size={16} /></span>
        <span class="filter-toolbar__trigger-label">{filterLabel}</span>
        {#if hasActiveFilters}
          <span class="filter-toolbar__badge" aria-label="Filtros activos"></span>
        {/if}
      </button>
    {/if}

    {#if resultCount != null && totalCount != null}
      <p class="filter-toolbar__count">Mostrando {resultCount} de {totalCount}</p>
    {/if}
  </div>

  {#if showFilterTrigger}
    <FilterPopover
      bind:open={popoverOpen}
      {typeOptions}
      bind:selectedType
      bind:dateFrom
      bind:dateTo
      {showTypeFilter}
      {showDateRange}
      anchorEl={triggerEl}
      on:close={closePopover}
    />
  {/if}
</div>
