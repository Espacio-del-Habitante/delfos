<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { listTrips, tripTotal, startTrip, getState } from '../../../../lib/store.js';
  import { formatCop } from '../../../../lib/format.js';
  import { categoryMeta } from '../../../../lib/categories.js';

  const dispatch = createEventDispatcher<{
    change: void;
    toast: { message: string; type?: 'success' | 'error' | 'info' };
  }>();

  $: trips = listTrips();

  function reopen() {
    startTrip({ budget: getState().settings.budgetDefault });
    dispatch('change');
    dispatch('toast', { message: 'Nuevo mercado abierto', type: 'success' });
  }

  function breakdown(items: any[]) {
    return items.reduce((acc: Record<string, number>, it) => {
      const k = it.category || 'otros';
      acc[k] = (acc[k] || 0) + (Number(it.amount) || 0);
      return acc;
    }, {});
  }
</script>

<div class="mercado-stack">
  <section class="manual-card">
    <h2 class="card-title" style="margin-top:0">Historial de cosechas</h2>
    <p class="muted" style="margin:0 0 14px">Todo vive en este teléfono. Nada se sube solo.</p>
    <button type="button" class="secondary-button" on:click={reopen}>Nuevo mercado</button>
  </section>

  {#each trips as t}
    <article class="manual-card">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline">
        <strong>{t.storeName || 'Deméter'}</strong>
        <span class="muted">{new Date(t.createdAt).toLocaleDateString('es-CO')}</span>
      </div>
      <p class="amount" style="margin:10px 0 6px;font-size:1.25rem">
        {formatCop(t.receipt?.ticketTotal ?? tripTotal(t))}
      </p>
      <p class="muted" style="margin:0">
        {t.items.length} ítems · {t.status}
        {#if t.sync?.ok} · sync ✓{/if}
        {#if t.sync && !t.sync.ok} · sync falló{/if}
      </p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">
        {#each Object.entries(breakdown(t.items)) as [cat, amt]}
          {@const meta = categoryMeta(cat)}
          <span class="pill" style="background:rgba(27,122,74,0.12);color:var(--primary)">
            {meta.label} {formatCop(amt)}
          </span>
        {/each}
      </div>
    </article>
  {:else}
    <section class="manual-card">
      <div class="empty-state">
        <p class="empty-state__title">Sin historial aún</p>
        <p class="empty-state__text">Cuando cierres un mercado, aparece aquí.</p>
      </div>
    </section>
  {/each}
</div>
