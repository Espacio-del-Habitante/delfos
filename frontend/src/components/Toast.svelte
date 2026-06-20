<script lang="ts">
  import { onMount } from 'svelte';
  import {
    dismissToast,
    pauseToastTimer,
    resumeToastTimer,
    toastState,
  } from '@/lib/toast';

  onMount(() => {
    const onVisibility = () => {
      if (document.hidden) pauseToastTimer();
      else resumeToastTimer();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  });
</script>

{#if $toastState}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="toast toast--{$toastState.type}"
    class:is-visible={$toastState.visible}
    class:is-exiting={$toastState.exiting}
    style="--toast-duration: {$toastState.duration}ms"
    role="status"
    aria-live="polite"
    on:mouseenter={pauseToastTimer}
    on:mouseleave={resumeToastTimer}
    on:click={(e) => {
      if ((e.target as HTMLElement).closest('.toast__action, .toast__dismiss')) return;
      dismissToast(true);
    }}
  >
    <span class="toast__message">{$toastState.message}</span>
    {#if $toastState.action}
      <button
        type="button"
        class="toast__action"
        on:click|stopPropagation={() => {
          $toastState?.action?.onClick();
          dismissToast(true);
        }}
      >
        {$toastState.action.label || 'Ver'}
      </button>
    {/if}
    <button type="button" class="toast__dismiss" aria-label="Cerrar" on:click|stopPropagation={() => dismissToast(true)}>
      ×
    </button>
    <div class="toast__progress"></div>
  </div>
{/if}
