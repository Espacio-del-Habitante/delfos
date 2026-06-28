<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { createModalShellState, hideModalShell, showModalShell } from '@common/lib/modalShell';

  export let open = false;
  export let title = '';
  export let narrow = false;
  export let onClose: (() => void) | undefined = undefined;

  const dispatch = createEventDispatcher<{ close: void }>();
  const titleId = `modal-title-${Math.random().toString(36).slice(2, 9)}`;

  let shell = createModalShellState();
  let modalEl: HTMLDivElement | undefined;
  let previouslyFocused: HTMLElement | null = null;

  $: syncOpen(open);

  function syncOpen(isOpen: boolean) {
    if (isOpen) {
      void showModal();
    } else if (shell.rendered && !shell.exiting) {
      void hideModal();
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
    detachKeydown();
    document.body.classList.remove('modal-open');
    previouslyFocused?.focus();
  }

  function close() {
    if (!shell.rendered || shell.exiting) return;
    onClose?.();
    dispatch('close');
    open = false;
  }

  function onOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (!shell.rendered || shell.exiting) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      close();
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
      class:is-visible={shell.visible}
      class:is-exiting={shell.exiting}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
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
    </div>
  </div>
{/if}
