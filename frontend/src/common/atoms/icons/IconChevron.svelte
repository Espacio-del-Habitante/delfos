<script lang="ts">
  export let size = 20;
  export let direction: 'left' | 'right' = 'right';
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if direction === 'left'}
    <polyline points="15 18 9 12 15 6" />
  {:else}
    <polyline points="9 18 15 12 9 6" />
  {/if}
</svg>
