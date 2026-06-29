<script lang="ts">
  export let ariaLabel = 'Acciones';
</script>

<div class="action-grid" role="group" aria-label={ariaLabel}>
  <slot />
</div>
