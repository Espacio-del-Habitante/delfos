<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { createModalShellState, hideModalShell, showModalShell } from '@common/lib/modalShell';

  export let open = false;
  export let title = '';
  export let narrow = false;
  export let onClose: (() => void) | undefined = undefined;
  export let asideOpen = false;
  export let asideTitle = '';

  const dispatch = createEventDispatcher<{ close: void; closeAside: void }>();
  const titleId = `modal-title-${Math.random().toString(36).slice(2, 9)}`;
  const asideTitleId = `modal-aside-title-${Math.random().toString(36).slice(2, 9)}`;

  let shell = createModalShellState();
  let asideShell = createModalShellState();
  let modalEl: HTMLDivElement | undefined;
  let previouslyFocused: HTMLElement | null = null;
  let asidePreviouslyFocused: HTMLElement | null = null;

  $: syncOpen(open);
  $: syncAside(asideOpen);

  function syncOpen(isOpen: boolean) {
    if (isOpen) {
      void showModal();
    } else if (shell.rendered && !shell.exiting) {
      void hideModal();
    }
  }

  function syncAside(isOpen: boolean) {
    if (isOpen) {
      void showAside();
    } else if (asideShell.rendered && !asideShell.exiting) {
      void hideAside();
    }
  }

  async function showModal() {
    previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.classList.add('modal-open');
    attachKeydown();
    shell = { rendered: true, exiting: false, visible: false };
    shell = await showModalShell(shell);
    const closeBtn = modalEl?.querySelector<HTMLElement>('.modal__close');
    closeBtn?.focus();
  }

  async function hideModal() {
    shell = { ...shell, exiting: true, visible: false };
    shell = await hideModalShell(shell);
    asideShell = createModalShellState();
    detachKeydown();
    document.body.classList.remove('modal-open');
    previouslyFocused?.focus();
  }

  async function showAside() {
    if (!shell.rendered) return;
    asidePreviouslyFocused = document.activeElement as HTMLElement | null;
    asideShell = { rendered: true, exiting: false, visible: false };
    asideShell = await showModalShell(asideShell);
    const closeBtn = modalEl?.querySelector<HTMLElement>('.modal__aside-close');
    closeBtn?.focus();
  }

  async function hideAside() {
    asideShell = { ...asideShell, exiting: true, visible: false };
    asideShell = await hideModalShell(asideShell);
    if (modalEl?.contains(asidePreviouslyFocused)) {
      asidePreviouslyFocused?.focus();
    }
  }

  function close() {
    if (!shell.rendered || shell.exiting) return;
    onClose?.();
    dispatch('close');
    open = false;
  }

  function closeAside() {
    if (!asideShell.rendered || asideShell.exiting) return;
    dispatch('closeAside');
    asideOpen = false;
  }

  function onOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (!shell.rendered || shell.exiting) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      if (asideShell.rendered && !asideShell.exiting) {
        closeAside();
      } else {
        close();
      }
      return;
    }

    if (e.key !== 'Tab' || !modalEl) return;

    const focusables = Array.from(
      modalEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function attachKeydown() {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', onWindowKeydown);
  }

  function detachKeydown() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('keydown', onWindowKeydown);
  }

  onDestroy(() => {
    detachKeydown();
    if (typeof document !== 'undefined') {
      document.body.classList.remove('modal-open');
    }
  });
</script>

{#if shell.rendered}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="modal-overlay"
    class:is-visible={shell.visible}
    class:is-exiting={shell.exiting}
    aria-hidden={!shell.visible}
    on:click={onOverlayClick}
  >
    <div
      bind:this={modalEl}
      class="modal"
      class:modal--narrow={narrow}
      class:modal--has-aside={asideShell.rendered}
      class:is-visible={shell.visible}
      class:is-exiting={shell.exiting}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div class="modal__grabber" aria-hidden="true"></div>
      <div class="modal__header">
        <h2 class="modal__title" id={titleId}>{title}</h2>
        <button type="button" class="modal__close" aria-label="Cerrar" on:click={close}>&times;</button>
      </div>
      <div class="modal__body">
        <slot />
      </div>
      {#if $$slots.footer}
        <div class="modal__footer">
          <slot name="footer" />
        </div>
      {/if}

      {#if asideShell.rendered}
        <aside
          class="modal__aside"
          class:is-visible={asideShell.visible}
          class:is-exiting={asideShell.exiting}
          role="dialog"
          aria-modal="false"
          aria-labelledby={asideTitleId}
        >
          <div class="modal__aside-header">
            <h3 class="modal__aside-title" id={asideTitleId}>{asideTitle}</h3>
            <button
              type="button"
              class="modal__aside-close"
              aria-label="Cerrar panel"
              on:click={closeAside}
            >&times;</button>
          </div>
          <div class="modal__aside-body">
            <slot name="aside" />
          </div>
          {#if $$slots.asideFooter}
            <div class="modal__aside-footer">
              <slot name="asideFooter" />
            </div>
          {/if}
        </aside>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal--has-aside {
    position: relative;
    overflow: visible;
  }

  .modal__aside {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(100% + 12px);
    display: flex;
    flex-direction: column;
    width: min(360px, 78vw);
    max-height: 100%;
    overflow: hidden;
    border-radius: var(--radius-md);
    background: var(--surface);
    border: 1px solid rgba(255, 255, 255, 0.72);
    box-shadow: 0 24px 48px rgba(15, 23, 42, 0.18);
    opacity: 0;
    transform: translateX(12px) translateZ(0);
    transition:
      opacity 220ms var(--ease-out),
      transform 220ms var(--ease-out);
    will-change: transform, opacity;
  }

  .modal__aside.is-visible {
    opacity: 1;
    transform: translateX(0) translateZ(0);
  }

  .modal__aside.is-exiting {
    transition-duration: 150ms;
    opacity: 0;
    transform: translateX(12px) translateZ(0);
  }

  .modal__aside-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 20px 20px 0;
  }

  .modal__aside-title {
    margin: 0;
    font-size: 1.02rem;
    font-weight: 700;
    color: var(--text-strong);
  }

  .modal__aside-close {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 50%;
    background: transparent;
    font-size: 1.4rem;
    line-height: 1;
    color: var(--text-soft);
    cursor: pointer;
    transition: background-color 140ms var(--ease-out);
  }

  @media (hover: hover) {
    .modal__aside-close:hover {
      background: rgba(15, 23, 42, 0.06);
      color: var(--text-strong);
    }
  }

  .modal__aside-body {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 16px 20px 20px;
  }

  .modal__aside-footer {
    flex-shrink: 0;
    padding: 12px 20px 20px;
    border-top: 1px solid var(--border-soft);
    background: rgba(246, 247, 251, 0.5);
  }

  @media (max-width: 520px) {
    .modal__aside {
      position: absolute;
      inset: 0;
      left: 0;
      width: 100%;
      max-height: 100%;
      border-radius: var(--radius-md);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .modal__aside {
      transition: opacity 200ms var(--ease-out);
      transform: none;
      will-change: auto;
    }

    .modal__aside.is-visible,
    .modal__aside.is-exiting {
      transform: none;
    }
  }
</style>
