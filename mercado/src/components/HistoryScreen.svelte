<script>
  import { listTrips, tripTotal, startTrip, getState } from '../lib/store.js';
  import { formatCop } from '../lib/format.js';
  import { categoryMeta } from '../lib/categories.js';

  let { onToast = () => {}, onChange = () => {} } = $props();
  let trips = $state(listTrips());

  function reopen() {
    startTrip({ budget: getState().settings.budgetDefault });
    onChange();
    onToast('Nuevo mercado abierto');
  }
</script>

<section class="card">
  <h2>Historial de mercados</h2>
  <p class="muted">Todo vive en este teléfono (localStorage). Nada se sube solo.</p>
  <button class="btn btn--ghost btn--block" style="margin-top:10px" onclick={reopen}>Nuevo mercado</button>
</section>

{#each trips as t}
  <article class="card">
    <div class="row" style="justify-content:space-between">
      <strong>{t.storeName || 'Mercado'}</strong>
      <span class="muted">{new Date(t.createdAt).toLocaleDateString('es-CO')}</span>
    </div>
    <div style="margin-top:8px;font-size:1.2rem;font-weight:750">{formatCop(t.receipt?.ticketTotal ?? tripTotal(t))}</div>
    <div class="muted" style="margin-top:4px">
      {t.items.length} ítems · {t.status}
      {#if t.sync?.ok} · sync ✓{/if}
      {#if t.sync && !t.sync.ok} · sync falló{/if}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">
      {#each Object.entries(
        t.items.reduce((acc, it) => {
          acc[it.category] = (acc[it.category] || 0) + (Number(it.amount) || 0);
          return acc;
        }, {}),
      ) as [cat, amt]}
        {@const meta = categoryMeta(cat)}
        <span class="pill" style="background:#eef2ff;color:#3730a3">{meta.emoji} {meta.label} {formatCop(amt)}</span>
      {/each}
    </div>
  </article>
{:else}
  <div class="card empty">Aún no cierras ningún mercado.</div>
{/each}
