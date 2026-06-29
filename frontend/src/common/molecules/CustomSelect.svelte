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

  const dispatch = createEventDispatcher<{ change: { value: string; option?: SelectOption } }>();

  let rendered = false;
  let visible = false;
  let exiting = false;
  let flipUp = false;
  let focusIndex = -1;

  let triggerEl: HTMLButtonElement | undefined;
  let panelEl: HTMLDivElement | undefined;
  let popoverStyle = '';

  $: open = rendered && !exiting;
  $: selected = options.find((o) => String(o.value) === String(value));

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
      estimatedHeight: 260,
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
    focusIndex = options.findIndex((o) => String(o.value) === String(value));
    attachListeners();
    updatePosition();
    await tick();
    updatePosition();
    await tick();
    updatePosition();
    visible = true;
  }

  async function closePanel(refocus = false) {
    if (!rendered || exiting) return;
    exiting = true;
    visible = false;
    await new Promise((resolve) => setTimeout(resolve, 130));
    rendered = false;
    exiting = false;
    focusIndex = -1;
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
      if (open && focusIndex >= 0) selectValue(options[focusIndex].value);
      else togglePanel();
    } else if (e.key === 'Escape') {
      if (rendered) {
        e.preventDefault();
        void closePanel(true);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) void openPanel();
      else focusIndex = Math.min(focusIndex + 1, options.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) void openPanel();
      else focusIndex = Math.max(focusIndex - 1, 0);
    }
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

<div class="custom-select" class:is-open={open}>
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
      style={popoverStyle}
      role="listbox"
    >
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
