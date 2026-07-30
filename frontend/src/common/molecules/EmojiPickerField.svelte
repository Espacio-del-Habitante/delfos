<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import { EMOJI_GROUPS, searchEmojis, type EmojiEntry } from '@common/lib/emojis';
  import { computeAnchorPosition, portal } from '@common/lib/anchorPosition';

  export let value = '🏷️';
  export let ariaLabel = 'Seleccionar emoji';
  export let disabled = false;

  const dispatch = createEventDispatcher<{ change: string }>();

  const DEFAULT_EMOJI = '🏷️';
  const MOBILE_QUERY = '(max-width: 520px)';

  function normalizeEmoji(emoji: string): string {
    return (emoji || DEFAULT_EMOJI).normalize('NFC');
  }

  let rendered = false;
  let visible = false;
  let exiting = false;
  let flipUp = false;
  let isMobile = false;

  let triggerEl: HTMLButtonElement | undefined;
  let panelEl: HTMLDivElement | undefined;
  let searchEl: HTMLInputElement | undefined;
  let popoverStyle = '';

  let activeGroupId = EMOJI_GROUPS[0]?.id ?? 'frequent';
  let query = '';

  let mql: MediaQueryList | undefined;

  $: normalizedValue = normalizeEmoji(value);
  $: activeGroup = EMOJI_GROUPS.find((g) => g.id === activeGroupId) ?? EMOJI_GROUPS[0];
  $: searchResults = query.trim() ? searchEmojis(query) : [];
  $: displayed = query.trim() ? searchResults : activeGroup?.emojis ?? [];

  onMount(() => {
    if (typeof window === 'undefined') return;
    mql = window.matchMedia(MOBILE_QUERY);
    isMobile = mql.matches;
    mql.addEventListener('change', onMediaChange);
  });

  function onMediaChange(e: MediaQueryListEvent) {
    isMobile = e.matches;
    if (rendered && !isMobile) updatePosition();
  }

  function toggle() {
    if (disabled) return;
    if (rendered && !exiting) {
      void hidePanel();
    } else if (!rendered) {
      void showPanel();
    }
  }

  function updatePosition() {
    if (isMobile || !triggerEl) return;

    const pos = computeAnchorPosition(triggerEl.getBoundingClientRect(), {
      width: Math.min(320, window.innerWidth - 32),
      gap: 8,
      edgePad: 16,
      estimatedHeight: 340,
      minHeight: 160,
      contentHeight: panelEl?.offsetHeight,
      originAlign: 'center',
    });

    flipUp = pos.flipUp;

    popoverStyle = [
      `--emoji-popover-origin: ${pos.originX}px ${pos.originY}px`,
      `--emoji-popover-max-height: ${pos.maxHeight}px`,
      `top: ${pos.top}px`,
      `left: ${pos.left}px`,
      `width: ${pos.width}px`,
    ].join('; ');
  }

  async function showPanel() {
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
    searchEl?.focus();
  }

  async function hidePanel() {
    if (!rendered || exiting) return;
    exiting = true;
    visible = false;
    const wait = isMobile ? 200 : 140;
    await new Promise((resolve) => setTimeout(resolve, wait));
    rendered = false;
    exiting = false;
    query = '';
    detachListeners();
    triggerEl?.focus();
  }

  function pick(entry: EmojiEntry) {
    value = normalizeEmoji(entry.char);
    dispatch('change', value);
    void hidePanel();
  }

  function onDocPointer(e: MouseEvent) {
    if (!rendered || exiting) return;
    const target = e.target as Node;
    if (triggerEl?.contains(target)) return;
    if (panelEl?.contains(target)) return;
    void hidePanel();
  }

  function onKeydown(e: KeyboardEvent) {
    if (!rendered || exiting) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      void hidePanel();
    }
  }

  function onScrollOrResize() {
    if (rendered && visible) updatePosition();
  }

  function attachListeners() {
    if (typeof document === 'undefined') return;
    document.addEventListener('pointerdown', onDocPointer, true);
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
  }

  function detachListeners() {
    if (typeof document === 'undefined') return;
    document.removeEventListener('pointerdown', onDocPointer, true);
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('scroll', onScrollOrResize, true);
    window.removeEventListener('resize', onScrollOrResize);
  }

  onDestroy(() => {
    detachListeners();
    mql?.removeEventListener('change', onMediaChange);
  });
</script>

<button
  type="button"
  class="emoji-field__trigger"
  class:is-open={rendered && !exiting}
  bind:this={triggerEl}
  on:click={toggle}
  {disabled}
  aria-haspopup="dialog"
  aria-expanded={rendered && !exiting}
  aria-label={ariaLabel}
>
  <span class="emoji-field__current" aria-hidden="true">{normalizedValue}</span>
</button>

{#if rendered}
  {#if isMobile}
    <div
      use:portal
      class="emoji-field__backdrop"
      class:is-visible={visible}
      class:is-exiting={exiting}
      aria-hidden="true"
    ></div>
  {/if}

  <div
    use:portal
    bind:this={panelEl}
    class="emoji-field__panel"
    class:is-sheet={isMobile}
    class:is-popover={!isMobile}
    class:is-visible={visible}
    class:is-exiting={exiting}
    class:is-flipped={flipUp}
    style={isMobile ? '' : popoverStyle}
    role="dialog"
    aria-label={ariaLabel}
  >
    {#if isMobile}
      <div class="emoji-field__grabber" aria-hidden="true"></div>
    {/if}

    <div class="emoji-field__search">
      <input
        bind:this={searchEl}
        type="text"
        class="emoji-field__search-input"
        placeholder="Buscar emoji…"
        bind:value={query}
        aria-label="Buscar emoji"
      />
    </div>

    {#if !query.trim()}
      <div class="emoji-field__tabs" role="tablist" aria-label="Categorías">
        {#each EMOJI_GROUPS as group (group.id)}
          <button
            type="button"
            role="tab"
            class="emoji-field__tab"
            class:is-active={group.id === activeGroupId}
            aria-selected={group.id === activeGroupId}
            on:click={() => (activeGroupId = group.id)}
          >
            {group.label}
          </button>
        {/each}
      </div>
    {/if}

    <div class="emoji-field__body">
      {#if !query.trim()}
        <h3 class="emoji-field__heading">{activeGroup?.label}</h3>
      {/if}

      {#if displayed.length}
        <div class="emoji-field__grid" role="listbox" aria-label="Emojis">
          {#each displayed as entry (entry.char)}
            <button
              type="button"
              class="emoji-field__cell"
              class:is-selected={normalizeEmoji(entry.char) === normalizedValue}
              role="option"
              aria-selected={normalizeEmoji(entry.char) === normalizedValue}
              aria-label={entry.char}
              title={entry.char}
              on:click={() => pick(entry)}
            >
              <span aria-hidden="true">{entry.char}</span>
            </button>
          {/each}
        </div>
      {:else}
        <p class="emoji-field__empty">Sin resultados</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .emoji-field__trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    cursor: pointer;
    line-height: 1;
    transition:
      transform 140ms var(--ease-out),
      border-color 140ms var(--ease-out),
      background 140ms var(--ease-out);
  }

  .emoji-field__trigger:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .emoji-field__trigger.is-open {
    border-color: var(--primary);
  }

  @media (hover: hover) and (pointer: fine) {
    .emoji-field__trigger:not(:disabled):hover {
      transform: scale(1.04);
      border-color: var(--primary);
    }
  }

  .emoji-field__trigger:not(:disabled):active {
    transform: scale(0.96);
    transition-duration: 100ms;
  }

  .emoji-field__current {
    font-size: 1.5rem;
  }

  /* Backdrop (mobile bottom sheet) */
  .emoji-field__backdrop {
    position: fixed;
    inset: 0;
    z-index: 1100;
    background: rgba(15, 23, 42, 0.4);
    opacity: 0;
    transition: opacity 220ms var(--ease-out);
    will-change: opacity;
  }

  .emoji-field__backdrop.is-visible {
    opacity: 1;
  }

  .emoji-field__backdrop.is-exiting {
    opacity: 0;
    transition-duration: 180ms;
  }

  /* Shared panel surface */
  .emoji-field__panel {
    z-index: 1101;
    display: flex;
    flex-direction: column;
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border: 1px solid rgba(15, 23, 42, 0.08);
    box-shadow: var(--shadow-soft), 0 8px 24px rgba(15, 23, 42, 0.12);
    will-change: transform, opacity;
  }

  /* Desktop popover */
  .emoji-field__panel.is-popover {
    position: fixed;
    border-radius: var(--radius-md);
    padding: 12px;
    max-height: min(var(--emoji-popover-max-height, 340px), calc(100dvh - 32px));
    transform-origin: var(--emoji-popover-origin, top center);
    opacity: 0;
    transform: scale(0.96) translateZ(0);
    pointer-events: none;
    transition:
      opacity 180ms var(--ease-out),
      transform 180ms var(--ease-out);
  }

  .emoji-field__panel.is-popover.is-visible {
    opacity: 1;
    transform: scale(1) translateZ(0);
    pointer-events: auto;
  }

  .emoji-field__panel.is-popover.is-exiting {
    opacity: 0;
    transform: scale(0.96) translateZ(0);
    transition-duration: 130ms;
    pointer-events: none;
  }

  /* Mobile bottom sheet */
  .emoji-field__panel.is-sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    padding: 8px 12px calc(12px + env(safe-area-inset-bottom, 0px));
    max-height: 70dvh;
    transform: translateY(100%) translateZ(0);
    transition: transform 220ms var(--ease-out);
  }

  .emoji-field__panel.is-sheet.is-visible {
    transform: translateY(0) translateZ(0);
  }

  .emoji-field__panel.is-sheet.is-exiting {
    transform: translateY(100%) translateZ(0);
    transition-duration: 180ms;
  }

  .emoji-field__grabber {
    width: 40px;
    height: 4px;
    margin: 4px auto 8px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.18);
  }

  .emoji-field__search {
    flex: 0 0 auto;
    margin-bottom: 10px;
  }

  .emoji-field__search-input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.5rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 0.85rem;
    transition: border-color 140ms var(--ease-out);
  }

  .emoji-field__search-input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .emoji-field__tabs {
    flex: 0 0 auto;
    display: flex;
    gap: 0.3rem;
    overflow-x: auto;
    scrollbar-width: none;
    padding-bottom: 8px;
    margin-bottom: 4px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.06);
  }

  .emoji-field__tabs::-webkit-scrollbar {
    display: none;
  }

  .emoji-field__tab {
    flex: 0 0 auto;
    padding: 0.28rem 0.6rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-muted);
    font: inherit;
    font-size: 0.74rem;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition:
      transform 140ms var(--ease-out),
      background 140ms var(--ease-out),
      border-color 140ms var(--ease-out),
      color 140ms var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .emoji-field__tab:not(.is-active):hover {
      transform: scale(1.03);
      color: var(--text-strong);
    }
  }

  .emoji-field__tab:active {
    transform: scale(0.96);
    transition-duration: 100ms;
  }

  .emoji-field__tab.is-active {
    background: var(--primary);
    border-color: var(--primary);
    color: #fff;
    transform: scale(1);
  }

  .emoji-field__body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }

  .emoji-field__heading {
    margin: 4px 0 8px;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .emoji-field__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 2px;
  }

  .emoji-field__cell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1 / 1;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    font-size: 1.35rem;
    line-height: 1;
    cursor: pointer;
    transition:
      transform 120ms var(--ease-out),
      background 120ms var(--ease-out),
      border-color 120ms var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .emoji-field__cell:hover {
      transform: scale(1.12);
      background: rgba(15, 23, 42, 0.06);
    }
  }

  .emoji-field__cell:active {
    transform: scale(0.95);
    transition-duration: 90ms;
  }

  .emoji-field__cell.is-selected {
    border-color: var(--primary);
    background: rgba(99, 102, 241, 0.12);
  }

  .emoji-field__empty {
    margin: 16px 0;
    text-align: center;
    font-size: 0.82rem;
    color: var(--text-muted);
  }

  @media (prefers-reduced-motion: reduce) {
    .emoji-field__trigger,
    .emoji-field__trigger:hover,
    .emoji-field__trigger:active,
    .emoji-field__tab,
    .emoji-field__tab:hover,
    .emoji-field__tab:active,
    .emoji-field__cell,
    .emoji-field__cell:hover,
    .emoji-field__cell:active {
      transform: none;
    }

    .emoji-field__panel.is-popover,
    .emoji-field__panel.is-popover.is-visible,
    .emoji-field__panel.is-popover.is-exiting {
      transform: none;
      will-change: auto;
      transition: opacity 180ms var(--ease-out);
    }

    .emoji-field__panel.is-popover.is-exiting {
      transition-duration: 130ms;
    }

    .emoji-field__panel.is-sheet {
      transform: none;
      opacity: 0;
      transition: opacity 220ms var(--ease-out);
    }

    .emoji-field__panel.is-sheet.is-visible {
      opacity: 1;
    }

    .emoji-field__panel.is-sheet.is-exiting {
      opacity: 0;
      transition-duration: 180ms;
    }
  }
</style>
