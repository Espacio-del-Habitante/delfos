<script lang="ts">
  import type { PortfolioInsights } from '@common/lib/types';

  export let insights: PortfolioInsights | null = null;
  export let loading = false;

  function formatUsd(n: number | null | undefined): string {
    if (n == null) return '—';
    return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }

  function formatPnl(n: number | null | undefined): string {
    if (n == null) return '—';
    const sign = n > 0 ? '+' : n < 0 ? '−' : '';
    return `${sign}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }

  $: empty = !insights?.has_positions;
  $: strongest = insights?.strongest_asset ?? null;
  $: totalPnl = insights?.total_pnl_usd ?? null;
  $: pnlClass =
    totalPnl == null ? '' : totalPnl > 0 ? 'pnl--positive' : totalPnl < 0 ? 'pnl--negative' : '';
</script>

<div class="investments-hero__stats">
  <div class="investments-hero__stat investments-hero__stat--highlight">
    <span class="investments-hero__stat-label">Activo más fuerte</span>
    {#if loading}
      <span class="investments-hero__stat-value investments-hero__stat-value--loading">…</span>
    {:else if empty}
      <span class="investments-hero__stat-value">—</span>
      <span class="investments-hero__stat-hint">Importa operaciones para ver tu cartera</span>
    {:else if strongest}
      <span class="investments-hero__stat-ticker">{strongest.asset}</span>
      {#if strongest.quote_missing}
        <span class="investments-hero__stat-value investments-hero__stat-value--large">
          {formatUsd(strongest.cost_basis_usd)}
        </span>
        <span class="investments-hero__stat-badge">Precio no disponible</span>
        <span class="investments-hero__stat-hint">Coste invertido</span>
      {:else}
        <span class="investments-hero__stat-value investments-hero__stat-value--large">
          {formatUsd(strongest.market_value_usd)}
        </span>
        <span class="investments-hero__stat-hint">{strongest.portfolio_percent}% de la cartera</span>
      {/if}
    {/if}
  </div>

  <div class="investments-hero__stat investments-hero__stat--highlight">
    <span class="investments-hero__stat-label">Ganancia total</span>
    {#if loading}
      <span class="investments-hero__stat-value investments-hero__stat-value--loading">…</span>
    {:else if empty}
      <span class="investments-hero__stat-value">—</span>
      <span class="investments-hero__stat-hint">Importa operaciones para ver tu cartera</span>
    {:else}
      <span class="investments-hero__stat-value investments-hero__stat-value--large {pnlClass}">
        {formatPnl(totalPnl)}
      </span>
      {#if insights}
        <span class="investments-hero__stat-hint">
          Realizada {formatPnl(insights.total_realized_pnl_usd)} · No realizada {formatPnl(insights.total_unrealized_pnl_usd)}
        </span>
      {/if}
    {/if}
  </div>
</div>
