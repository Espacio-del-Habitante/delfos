<script>
  import { getProducts, listTrips, tripTotal, categoryBreakdown } from '../lib/store.js';
  import { CATEGORIES, categoryMeta } from '../lib/categories.js';
  import { formatCop } from '../lib/format.js';

  const trips = $derived(listTrips().filter((t) => t.items?.length));
  const products = $derived(getProducts());
  const yearTotal = $derived(trips.reduce((s, t) => s + (Number(t.receipt?.ticketTotal) || tripTotal(t)), 0));

  const catTotals = $derived.by(() => {
    const map = {};
    for (const t of trips) {
      const b = categoryBreakdown(t);
      for (const [k, v] of Object.entries(b)) map[k] = (map[k] || 0) + v;
    }
    return map;
  });

  const catSum = $derived(Object.values(catTotals).reduce((a, b) => a + b, 0) || 1);
  const proteina = $derived(catTotals.proteina || 0);
  const harinas = $derived(catTotals.harinas || 0);

  const sparkProducts = $derived(
    Object.values(products)
      .filter((p) => (p.priceHistory || []).length >= 2)
      .slice(0, 8),
  );

  function sparkPoints(history) {
    const vals = history.map((h) => h.unitPrice);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    return vals
      .map((v, i) => {
        const x = (i / Math.max(vals.length - 1, 1)) * 100;
        const y = 54 - ((v - min) / span) * 48;
        return `${x},${y}`;
      })
      .join(' ');
  }

  function lastDelta(history) {
    if (!history || history.length < 2) return null;
    const a = history[history.length - 2].unitPrice;
    const b = history[history.length - 1].unitPrice;
    return b - a;
  }
</script>

<section class="card">
  <h2>Resumen</h2>
  <div class="stat-grid">
    <div class="stat">
      <div class="muted">Mercados</div>
      <div class="stat__v">{trips.length}</div>
    </div>
    <div class="stat">
      <div class="muted">Gastado</div>
      <div class="stat__v">{formatCop(yearTotal)}</div>
    </div>
  </div>
</section>

<section class="share-card" style="margin-bottom:12px">
  <div class="muted" style="color:rgba(255,255,255,0.7)">Share card</div>
  <h2 style="margin:6px 0 10px;color:#fff">Mi mercado en números</h2>
  <p style="margin:0 0 12px;opacity:0.9">
    {#if proteina >= harinas}
      Vas más en proteína ({formatCop(proteina)}) que en harinas ({formatCop(harinas)}).
    {:else}
      Estás llevando más harinas ({formatCop(harinas)}) que proteína ({formatCop(proteina)}).
    {/if}
  </p>
  <p style="margin:0;font-size:0.85rem;opacity:0.75">Captura esta tarjeta para redes.</p>
</section>

<section class="card">
  <h2>Por categoría</h2>
  {#each CATEGORIES as c}
    {@const amt = catTotals[c.id] || 0}
    {#if amt > 0}
      <div style="margin:10px 0">
        <div class="row" style="justify-content:space-between">
          <span>{c.emoji} {c.label}</span>
          <strong>{formatCop(amt)}</strong>
        </div>
        <div class="bar" style="background:#eef2ff;margin-top:6px">
          <span style={`width:${Math.round((amt / catSum) * 100)}%;background:var(--primary)`}></span>
        </div>
      </div>
    {/if}
  {/each}
</section>

<section class="card">
  <h2>Precios que suben / bajan</h2>
  <p class="muted">Compara unitario vs compra pasada (local).</p>
  {#each sparkProducts as p}
    {@const delta = lastDelta(p.priceHistory)}
    {@const meta = categoryMeta(p.category)}
    <div class="item">
      <div>
        <div class="item__name">{meta.emoji} {p.name}</div>
        <div class="item__meta">
          {#if delta == null}
            sin delta
          {:else if delta > 0}
            subió {formatCop(delta)} / unidad
          {:else if delta < 0}
            bajó {formatCop(-delta)} / unidad
          {:else}
            igual
          {/if}
        </div>
        <svg class="line" viewBox="0 0 100 64" preserveAspectRatio="none" aria-hidden="true">
          <polyline
            fill="none"
            stroke="#4f46e5"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
            points={sparkPoints(p.priceHistory)}
          />
        </svg>
      </div>
      <div class="item__amt">{formatCop(p.priceHistory.at(-1)?.unitPrice)}</div>
    </div>
  {:else}
    <div class="empty">Repite productos en varios mercados para ver la curva.</div>
  {/each}
</section>
