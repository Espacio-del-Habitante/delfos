<script lang="ts">
  import { getProducts, listTrips, tripTotal, categoryBreakdown } from '../../../../lib/store.js';
  import { CATEGORIES } from '../../../../lib/categories.js';
  import { formatCop } from '../../../../lib/format.js';

  $: trips = listTrips().filter((t) => t.items?.length);
  $: products = getProducts();
  $: yearTotal = trips.reduce((s, t) => s + (Number(t.receipt?.ticketTotal) || tripTotal(t)), 0);

  $: catTotals = (() => {
    const map: Record<string, number> = {};
    for (const t of trips) {
      const b = categoryBreakdown(t);
      for (const [k, v] of Object.entries(b)) map[k] = (map[k] || 0) + (v as number);
    }
    return map;
  })();

  $: catSum = Object.values(catTotals).reduce((a, b) => a + b, 0) || 1;
  $: proteina = catTotals.proteina || 0;
  $: harinas = catTotals.harinas || 0;

  $: sparkProducts = Object.values(products)
    .filter((p: any) => (p.priceHistory || []).length >= 2)
    .slice(0, 8);

  function sparkPoints(history: any[]) {
    const vals = history.map((h) => h.unitPrice);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    return vals
      .map((v, i) => {
        const x = (i / Math.max(vals.length - 1, 1)) * 100;
        const y = 50 - ((v - min) / span) * 42;
        return `${x},${y}`;
      })
      .join(' ');
  }

  function lastDelta(history: any[]) {
    if (!history || history.length < 2) return null;
    return history[history.length - 1].unitPrice - history[history.length - 2].unitPrice;
  }
</script>

<div class="mercado-stack">
  <section class="manual-card">
    <h2 class="card-title" style="margin-top:0">Resumen</h2>
    <div class="mercado-stat-grid">
      <div class="mercado-stat">
        <p class="mercado-stat__label">Cosechas</p>
        <p class="mercado-stat__value">{trips.length}</p>
      </div>
      <div class="mercado-stat">
        <p class="mercado-stat__label">Gastado</p>
        <p class="mercado-stat__value amount">{formatCop(yearTotal)}</p>
      </div>
    </div>
  </section>

  <section class="mercado-share-card" aria-label="Share card">
    <p class="muted" style="color:rgba(255,255,255,0.7);margin:0;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em">
      Para redes
    </p>
    <h2>Mi Deméter en números</h2>
    <p>
      {#if proteina >= harinas}
        Vas más en proteína ({formatCop(proteina)}) que en harinas ({formatCop(harinas)}).
      {:else}
        Estás llevando más harinas ({formatCop(harinas)}) que proteína ({formatCop(proteina)}).
      {/if}
    </p>
  </section>

  <section class="manual-card">
    <h2 class="card-title" style="margin-top:0">Por categoría</h2>
    {#each CATEGORIES as c}
      {@const amt = catTotals[c.id] || 0}
      {#if amt > 0}
        <div style="margin:12px 0">
          <div style="display:flex;justify-content:space-between;gap:10px">
            <span>{c.label}</span>
            <strong class="amount">{formatCop(amt)}</strong>
          </div>
          <div class="mercado-budget-bar" style="background:rgba(27,122,74,0.12);margin-top:8px">
            <span style={`width:${Math.round((amt / catSum) * 100)}%;background:var(--primary)`}></span>
          </div>
        </div>
      {/if}
    {/each}
  </section>

  <section class="manual-card">
    <h2 class="card-title" style="margin-top:0">Precios que cambian</h2>
    <p class="muted" style="margin:0 0 8px">Unitario vs compra pasada (local).</p>
    {#each sparkProducts as p}
      {@const delta = lastDelta(p.priceHistory)}
      <div class="mercado-item">
        <div>
          <p class="mercado-item__name">{p.name}</p>
          <p class="mercado-item__meta">
            {#if delta == null}
              sin delta
            {:else if delta > 0}
              subió {formatCop(delta)} / und
            {:else if delta < 0}
              bajó {formatCop(-delta)} / und
            {:else}
              igual
            {/if}
          </p>
          <svg class="mercado-spark" viewBox="0 0 100 56" preserveAspectRatio="none" aria-hidden="true">
            <polyline
              fill="none"
              stroke="var(--primary)"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
              points={sparkPoints(p.priceHistory)}
            />
          </svg>
        </div>
        <p class="mercado-item__amt amount">{formatCop(p.priceHistory.at(-1)?.unitPrice)}</p>
      </div>
    {:else}
      <div class="empty-state">
        <p class="empty-state__title">Sin curvas aún</p>
        <p class="empty-state__text">Repite productos en varios mercados para ver la línea.</p>
      </div>
    {/each}
  </section>
</div>
