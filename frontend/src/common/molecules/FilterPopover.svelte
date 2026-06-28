<script lang="ts">
  import { createEventDispatcher, onDestroy, tick } from 'svelte';
  import DateField from '@common/atoms/DateField.svelte';

  export let open = false;
  export let typeOptions: { value?: string; id?: string; label: string }[] = [];
  export let selectedType = 'all';
  export let dateFrom = '';
  export let dateTo = '';
  export let showTypeFilter = true;
  export let showDateRange = true;
  export let anchorEl: HTMLElement | null = null;

  const dispatch = createEventDispatcher<{ close: void; clear: void }>();

  let rendered = false;
  let visible = false;
  let exiting = false;
  let flipUp = false;
  let popoverEl: HTMLDivElement | undefined;
  let popoverStyle = '';

  function optionId(opt: { value?: string; id?: string }): string {
    return opt.id ?? opt.value ?? '';
  }

  $: syncOpen(open);

  function syncOpen(isOpen: boolean) {
    if (isOpen && !rendered) {
      void showPopover();
    } else if (!isOpen && rendered && !exiting) {
      void hidePopover();
    }
  }

  function updatePosition() {
    if (!anchorEl) return;

    const rect = anchorEl.getBoundingClientRect();
    const gap = 8;
    const edgePad = 16;
    const width = Math.min(320, window.innerWidth - 32);
    let left = rect.left;

    if (left + width > window.innerWidth - edgePad) {
      left = window.innerWidth - edgePad - width;
    }
    if (left < edgePad) left = edgePad;

    const viewportH = window.innerHeight;
    const spaceBelow = viewportH - rect.bottom - gap - edgePad;
    const spaceAbove = rect.top - gap - edgePad;
    const estimatedHeight = 280;
    const contentHeight = popoverEl?.offsetHeight || estimatedHeight;

    flipUp = contentHeight > spaceBelow && spaceAbove > spaceBelow;

    let maxHeight: number;
    let top: number;

    if (flipUp) {
      maxHeight = Math.max(120, spaceAbove);
      const visibleHeight = Math.min(contentHeight, maxHeight);
      top = rect.top - gap - visibleHeight;
      if (top < edgePad) {
        top = edgePad;
        maxHeight = Math.max(120, rect.top - gap - edgePad);
      }
    } else {
      maxHeight = Math.max(120, spaceBelow);
      top = rect.bottom + gap;
      const bottomLimit = top + Math.min(contentHeight, maxHeight);
      if (bottomLimit > viewportH - edgePad) {
        maxHeight = Math.max(120, viewportH - edgePad - top);
      }
    }

    const originX = rect.left - left;
    const originY = flipUp ? rect.bottom - top : rect.top - top;

    popoverStyle = [
      `--filter-popover-origin: ${originX}px ${originY}px`,
      `--filter-popover-max-height: ${Math.round(maxHeight)}px`,
      `top: ${Math.round(top)}px`,
      `left: ${left}px`,
      `width: ${width}px`,
    ].join('; ');
  }

  async function showPopover() {
    rendered = true;
    exiting = false;
    visible = false;
    attachListeners();
    updatePosition();
    await tick();
    updatePosition();
    await tick();
    updatePosition();
    visible = true;
  }

  async function hidePopover() {
    exiting = true;
    visible = false;
    await new Promise((resolve) => setTimeout(resolve, 140));
    rendered = false;
    exiting = false;
    detachListeners();
  }

  function close() {
    if (!rendered || exiting) return;
    dispatch('close');
    open = false;
  }

  function clearFilters() {
    selectedType = 'all';
    dateFrom = '';
    dateTo = '';
    dispatch('clear');
  }

  function onDocClick(e: MouseEvent) {
    if (!rendered || exiting) return;
    const target = e.target as Node;
    if (anchorEl?.contains(target)) return;
    if (popoverEl?.contains(target)) return;
    close();
  }

  function onKeydown(e: KeyboardEvent) {
    if (!rendered || exiting) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function onScrollOrResize() {
    if (rendered && visible) updatePosition();
  }

  function attachListeners() {
    if (typeof document === 'undefined') return;
    document.addEventListener('click', onDocClick);
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
  }

  function detachListeners() {
    if (typeof document === 'undefined') return;
    document.removeEventListener('click', onDocClick);
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('scroll', onScrollOrResize, true);
    window.removeEventListener('resize', onScrollOrResize);
  }

  onDestroy(detachListeners);
</script>

{#if rendered}
  <div
    bind:this={popoverEl}
    class="filter-popover"
    class:is-visible={visible}
    class:is-exiting={exiting}
    class:is-flipped={flipUp}
    style={popoverStyle}
    role="dialog"
    aria-label="Filtros de movimientos"
  >
    <div class="filter-popover__panel">
      {#if showTypeFilter && typeOptions.length}
        <section class="filter-popover__section" aria-label="Tipo de movimiento">
          <h3 class="filter-popover__heading">Tipo</h3>
          <div class="filter-popover__chips" role="group" aria-label="Filtrar por tipo">
            {#each typeOptions as opt (optionId(opt))}
              <button
                type="button"
                class="filter-popover__chip"
                class:is-active={selectedType === optionId(opt)}
                on:click={() => (selectedType = optionId(opt))}
              >
                {opt.label}
              </button>
            {/each}
          </div>
        </section>
      {/if}

      {#if showDateRange}
        <section class="filter-popover__section" aria-label="Rango de fechas">
          <h3 class="filter-popover__heading">Fechas</h3>
          <div class="filter-popover__dates">
            <DateField label="Desde" bind:value={dateFrom} />
            <DateField label="Hasta" bind:value={dateTo} min={dateFrom || undefined} />
          </div>
        </section>
      {/if}

      <button type="button" class="filter-popover__clear" on:click={clearFilters}>
        Limpiar filtros
      </button>
    </div>
  </div>
{/if}
