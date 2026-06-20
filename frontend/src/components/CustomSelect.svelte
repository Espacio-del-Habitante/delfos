<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { SelectOption } from '@/lib/types';

  export let options: SelectOption[] = [];
  export let value = '';
  export let placeholder = 'Seleccionar';
  export let name: string | undefined = undefined;
  export let required = false;
  export let id: string | undefined = undefined;

  const dispatch = createEventDispatcher<{ change: { value: string; option?: SelectOption } }>();

  let open = false;
  let focusIndex = -1;
  let rootEl: HTMLDivElement;

  $: selected = options.find((o) => String(o.value) === String(value));

  function selectValue(val: string) {
    value = val;
    open = false;
    focusIndex = -1;
    dispatch('change', { value: val, option: options.find((o) => String(o.value) === String(val)) });
  }

  function togglePanel() {
    open = !open;
    if (open) {
      focusIndex = options.findIndex((o) => String(o.value) === String(value));
    }
  }

  function onDocClick(e: MouseEvent) {
    if (rootEl && !rootEl.contains(e.target as Node)) open = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open && focusIndex >= 0) selectValue(options[focusIndex].value);
      else togglePanel();
    } else if (e.key === 'Escape') {
      open = false;
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) open = true;
      focusIndex = Math.min(focusIndex + 1, options.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) open = true;
      focusIndex = Math.max(focusIndex - 1, 0);
    }
  }

  onMount(() => {
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  });
</script>

<div class="custom-select" class:is-open={open} bind:this={rootEl}>
  <input type="hidden" {name} {id} {required} bind:value />
  <button
    type="button"
    class="custom-select__trigger"
    aria-haspopup="listbox"
    aria-expanded={open}
    on:click={togglePanel}
    on:keydown={onKeydown}
  >
    <span class="custom-select__value" class:muted={!selected && !value}>
      {selected?.label ?? (value ? value : placeholder)}
    </span>
    <span class="custom-select__chevron" aria-hidden="true">▾</span>
  </button>
  {#if open}
    <div class="custom-select__panel" role="listbox">
      {#each options as opt, index (opt.value)}
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
    </div>
  {/if}
</div>
