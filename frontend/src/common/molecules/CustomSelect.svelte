<script lang="ts">
  import { createEventDispatcher, onDestroy, tick } from 'svelte';
  import { computeAnchorPosition, portal } from '@common/lib/anchorPosition';
  import type { SelectOption } from '@common/lib/types';

  export let options: SelectOption[] = [];
  export let value = '';
  export let placeholder = 'Seleccionar';
  export let name: string | undefined = undefined;
  export let required = false;
  export let id: string | undefined = undefined;
  /** Filter box inside the panel — useful for long catalogs (models). */
  export let searchable = false;
  export let searchPlaceholder = 'Buscar…';

  const dispatch = createEventDispatcher<{ change: { value: string; option?: SelectOption } }>();

  let rendered = false;
  let visible = false;
  let exiting = false;
  let flipUp = false;
  let focusIndex = -1;
  let query = '';

  let triggerEl: HTMLButtonElement | undefined;
  let panelEl: HTMLDivElement | undefined;
  let searchEl: HTMLInputElement | undefined;
  let popoverStyle = '';

  $: open = rendered && !exiting;
  $: selected = options.find((o) => String(o.value) === String(value));
  $: filtered = filterOptions(options, query, searchable);

  function filterOptions(list: SelectOption[], q: string, enabled: boolean): SelectOption[] {
    if (!enabled) return list;
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((o) => {
      const label = String(o.label ?? '').toLowerCase();
      const val = String(o.value ?? '').toLowerCase();
      return label.includes(needle) || val.includes(needle);
    });
  }

  function selectValue(val: string) {
    value = val;
    dispatch('change', { value: val, option: options.find((o) => String(o.value) === String(val)) });
    void closePanel();
  }

  function updatePosition() {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const pos = computeAnchorPosition(rect, {
      width: rect.width,
      gap: 6,
      edgePad: 16,
      estimatedHeight: searchable ? 320 : 260,
      minHeight: 140,
      contentHeight: panelEl?.offsetHeight,
      originAlign: 'left',
    });

    flipUp = pos.flipUp;

    popoverStyle = [
      `--custom-select-origin: ${pos.originX}px ${pos.originY}px`,
      `--custom-select-max-height: ${pos.maxHeight}px`,
      `top: ${pos.top}px`,
      `left: ${pos.left}px`,
      `width: ${pos.width}px`,
    ].join('; ');
  }

  async function openPanel() {
    if (rendered && !exiting) return;
    rendered = true;
    exiting = false;
    visible = false;
    query = '';
    focusIndex = options.findIndex((o) => String(o.value) === String(value));
    attachListeners();
    updatePosition();
    await tick();
    updatePosition();
    await tick();
    updatePosition();
    visible = true;
    if (searchable) {
      searchEl?.focus();
      searchEl?.select();
    }
  }

  async function closePanel(refocus = false) {
    if (!rendered || exiting) return;
    exiting = true;
    visible = false;
    await new Promise((resolve) => setTimeout(resolve, 130));
    rendered = false;
    exiting = false;
    focusIndex = -1;
    query = '';
    detachListeners();
    if (refocus) triggerEl?.focus();
  }

  function togglePanel() {
    if (rendered && !exiting) void closePanel();
    else void openPanel();
  }

  function onTriggerKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open && focusIndex >= 0 && filtered[focusIndex]) selectValue(filtered[focusIndex].value);
      else togglePanel();
    } else if (e.key === 'Escape') {
      if (rendered) {
        e.preventDefault();
        void closePanel(true);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) void openPanel();
      else focusIndex = Math.min(focusIndex + 1, filtered.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) void openPanel();
      else focusIndex = Math.max(focusIndex - 1, 0);
    }
  }

  function onSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusIndex = Math.min(focusIndex + 1, filtered.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusIndex = Math.max(focusIndex - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = filtered[focusIndex] ?? filtered[0];
      if (pick) selectValue(pick.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (query) query = '';
      else void closePanel(true);
    }
  }

  function onQueryInput() {
    focusIndex = filtered.length ? 0 : -1;
    void tick().then(updatePosition);
  }

  function onDocClick(e: MouseEvent) {
    if (!rendered || exiting) return;
    const target = e.target as Node;
    if (triggerEl?.contains(target)) return;
    if (panelEl?.contains(target)) return;
    void closePanel();
  }

  function onScrollOrResize() {
    if (rendered && visible) updatePosition();
  }

  function attachListeners() {
    if (typeof document === 'undefined') return;
    document.addEventListener('click', onDocClick);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
  }

  function detachListeners() {
    if (typeof document === 'undefined') return;
    document.removeEventListener('click', onDocClick);
    window.removeEventListener('scroll', onScrollOrResize, true);
    window.removeEventListener('resize', onScrollOrResize);
  }

  onDestroy(detachListeners);
</script>

<div class="custom-select" class:is-open={open} class:is-searchable={searchable}>
  <input type="hidden" {name} {id} {required} bind:value />
  <button
    type="button"
    class="custom-select__trigger"
    bind:this={triggerEl}
    aria-haspopup="listbox"
    aria-expanded={open}
    on:click={togglePanel}
    on:keydown={onTriggerKeydown}
  >
    <span class="custom-select__value" class:muted={!selected && !value}>
      {selected?.label ?? (value ? value : placeholder)}
    </span>
    <span class="custom-select__chevron" aria-hidden="true">▾</span>
  </button>
  {#if rendered}
    <div
      use:portal
      bind:this={panelEl}
      class="custom-select__panel"
      class:is-visible={visible}
      class:is-exiting={exiting}
      class:is-flipped={flipUp}
      class:has-search={searchable}
      style={popoverStyle}
      role="listbox"
    >
      {#if searchable}
        <div class="custom-select__search">
          <input
            bind:this={searchEl}
            class="custom-select__search-input"
            type="search"
            bind:value={query}
            placeholder={searchPlaceholder}
            autocomplete="off"
            spellcheck="false"
            aria-label={searchPlaceholder}
            on:input={onQueryInput}
            on:keydown={onSearchKeydown}
            on:click|stopPropagation
          />
        </div>
      {/if}
      {#if filtered.length}
        {#each filtered as opt, index (opt.value)}
          <button
            type="button"
            class="custom-select__option"
            class:is-selected={String(opt.value) === String(value)}
            class:is-focused={index === focusIndex}
            role="option"
            aria-selected={String(opt.value) === String(value)}
            on:click={() => selectValue(opt.value)}
          >
            {opt.label}
          </button>
        {/each}
      {:else}
        <p class="custom-select__empty">Sin coincidencias</p>
      {/if}
    </div>
  {/if}
</div>
