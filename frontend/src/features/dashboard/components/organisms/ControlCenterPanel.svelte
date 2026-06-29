<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{
    openExpense: void;
    openIncome: void;
    openImport: void;
  }>();
</script>

<section class="control-center" aria-label="Registro manual">
  <div class="control-center__grid">
    <button
      type="button"
      class="control-center__tile"
      on:click={() => dispatch('openExpense')}
    >
      <span class="control-center__tile-icon" aria-hidden="true">💸</span>
      <span class="control-center__tile-label">Gasto</span>
    </button>

    <button
      type="button"
      class="control-center__tile"
      on:click={() => dispatch('openIncome')}
    >
      <span class="control-center__tile-icon" aria-hidden="true">💰</span>
      <span class="control-center__tile-label">Ingreso</span>
    </button>

    <button
      type="button"
      class="control-center__tile"
      on:click={() => dispatch('openImport')}
    >
      <span class="control-center__tile-icon" aria-hidden="true">📥</span>
      <span class="control-center__tile-label">Importar</span>
    </button>

    <a href="/inversiones" class="control-center__tile control-center__tile--link">
      <span class="control-center__tile-icon" aria-hidden="true">📈</span>
      <span class="control-center__tile-label">Inversiones</span>
    </a>
  </div>
</section>
