<script lang="ts">
  export let page = 1;
  export let pageSize = 25;
  export let totalItems = 0;

  $: totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  $: displayPage = Math.min(Math.max(1, page), totalPages);
  $: rangeStart = totalItems === 0 ? 0 : (displayPage - 1) * pageSize + 1;
  $: rangeEnd = Math.min(displayPage * pageSize, totalItems);

  $: pageNumbers = (() => {
    const pages: number[] = [];
    const windowSize = 5;
    let start = Math.max(1, displayPage - Math.floor(windowSize / 2));
    let end = Math.min(totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  })();

  function goTo(p: number) {
    page = Math.min(Math.max(1, p), totalPages);
  }
</script>

{#if totalItems > pageSize}
  <nav class="table-pagination" aria-label="Paginación de tabla">
    <p class="table-pagination__summary">
      Mostrando {rangeStart}–{rangeEnd} de {totalItems}
    </p>
    <div class="table-pagination__controls">
      <button
        type="button"
        class="table-pagination__btn"
        disabled={displayPage <= 1}
        on:click={() => goTo(displayPage - 1)}
        aria-label="Página anterior"
      >
        ‹
      </button>
      {#each pageNumbers as p}
        <button
          type="button"
          class="table-pagination__btn"
          class:is-active={p === displayPage}
          on:click={() => goTo(p)}
          aria-label="Página {p}"
          aria-current={p === displayPage ? 'page' : undefined}
        >
          {p}
        </button>
      {/each}
      <button
        type="button"
        class="table-pagination__btn"
        disabled={displayPage >= totalPages}
        on:click={() => goTo(displayPage + 1)}
        aria-label="Página siguiente"
      >
        ›
      </button>
    </div>
  </nav>
{/if}
