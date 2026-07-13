<script lang="ts">
  import type { PortfolioInsights } from '@common/lib/types';

  export let insights: PortfolioInsights | null = null;
  export let loading = false;

  function formatUsd(n: number | null | undefined): string {
    if (n == null) return '—';
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatQty(n: number | null | undefined): string {
    if (n == null) return '—';
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 8 });
  }

  function formatPrice(n: number | null | undefined): string {
    if (n == null) return '—';
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  }

  function formatPnl(n: number | null | undefined): string {
    if (n == null) return '—';
    const sign = n > 0 ? '+' : n < 0 ? '−' : '';
    return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatPercent(n: number | null | undefined): string {
    if (n == null) return '—';
    const sign = n > 0 ? '+' : n < 0 ? '−' : '';
    return `${sign}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }

  function pnlClass(value: number | null | undefined): string {
    if (value == null) return '';
    if (value > 0) return 'pnl--positive';
    if (value < 0) return 'pnl--negative';
    return '';
  }

  $: hasData = !!insights;
  $: totalAssets = insights?.total_assets_value_usd ?? insights?.total_market_value_usd ?? null;
  $: cash = insights?.cash_available_usd ?? null;
  $: totalBalance =
    insights?.total_portfolio_value_usd ??
    ((totalAssets ?? 0) + (cash ?? 0));
  $: positions = insights?.positions ?? [];
  $: empty = !hasData || (!insights?.has_positions && Math.abs(totalBalance ?? 0) < 1e-9);
  $: totalPnl = insights?.total_pnl_usd ?? null;
  $: cashTone = pnlClass(cash);
  $: totalPnlTone = pnlClass(totalPnl);
  $: portfolioWarnings = insights?.warnings ?? (insights?.cash_warning ? [insights.cash_warning] : []);
</script>

<div class="investments-hero__stats">
  <div class="investments-hero__stat investments-hero__stat--highlight">
    <span class="investments-hero__stat-label">Total en activos</span>
    {#if loading}
      <span class="investments-hero__stat-value investments-hero__stat-value--loading">…</span>
    {:else if empty}
      <span class="investments-hero__stat-value">—</span>
      <span class="investments-hero__stat-hint">Importa operaciones para ver tu cartera</span>
    {:else}
      <span class="investments-hero__stat-value investments-hero__stat-value--large">
        {formatUsd(totalAssets)}
      </span>
      {#if insights?.quotes_partial}
        <span class="investments-hero__stat-hint">Algunas cotizaciones no disponibles</span>
      {/if}
    {/if}
  </div>

  <div class="investments-hero__stat investments-hero__stat--highlight">
    <span class="investments-hero__stat-label">Efectivo disponible</span>
    {#if loading}
      <span class="investments-hero__stat-value investments-hero__stat-value--loading">…</span>
    {:else if empty}
      <span class="investments-hero__stat-value">—</span>
      <span class="investments-hero__stat-hint">Sin movimientos para calcular efectivo</span>
    {:else}
      <span class="investments-hero__stat-value investments-hero__stat-value--large {cashTone}">
        {formatUsd(cash)}
      </span>
      {#if insights?.cash_warning}
        <span class="investments-hero__stat-hint investments-hero__stat-hint--warning">{insights.cash_warning}</span>
      {/if}
    {/if}
  </div>

  <div class="investments-hero__stat investments-hero__stat--highlight">
    <span class="investments-hero__stat-label">Balance total</span>
    {#if loading}
      <span class="investments-hero__stat-value investments-hero__stat-value--loading">…</span>
    {:else if empty}
      <span class="investments-hero__stat-value">—</span>
      <span class="investments-hero__stat-hint">Importa operaciones para ver tu cartera</span>
    {:else}
      <span class="investments-hero__stat-value investments-hero__stat-value--large">
        {formatUsd(totalBalance)}
      </span>
      <span class="investments-hero__stat-hint">Activos + efectivo disponible</span>
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
      <span class="investments-hero__stat-value investments-hero__stat-value--large {totalPnlTone}">
        {formatPnl(totalPnl)}
        {#if insights?.total_return_percent != null}
          <span class="investments-hero__stat-sub">({formatPercent(insights.total_return_percent)})</span>
        {/if}
      </span>
      {#if insights}
        <span class="investments-hero__stat-hint">
          Materializada {formatPnl(insights.total_realized_pnl_usd)} · No materializada {formatPnl(insights.total_unrealized_pnl_usd)} · Dividendos {formatPnl(insights.total_dividends_usd)} · Fees {formatUsd(insights.total_fees_usd)}
        </span>
      {/if}
    {/if}
  </div>
</div>

{#if portfolioWarnings.length > 0}
  <ul class="investments-hero__warnings" aria-label="Advertencias del portafolio">
    {#each portfolioWarnings as warning}
      <li class="investments-hero__warning">{warning}</li>
    {/each}
  </ul>
{/if}

<section class="investments-audit" aria-label="Auditoría del portafolio">
  <div class="investments-audit__header">
    <h2 class="card-title">Mis activos</h2>
    {#if insights?.quotes_partial}
      <span class="investments-audit__hint">Con fallback de precio importado cuando falta cotización actual</span>
    {/if}
  </div>

  {#if loading}
    <p class="investments-audit__empty">Cargando posiciones…</p>
  {:else if !positions.length}
    <p class="investments-audit__empty">No hay posiciones abiertas para mostrar.</p>
  {:else}
    <div class="investments-audit__table-wrap">
      <table class="investments-audit__table">
        <thead>
          <tr>
            <th>Activo</th>
            <th class="investments-audit__num">Cantidad</th>
            <th class="investments-audit__num">Costo acum.</th>
            <th class="investments-audit__num">Costo prom.</th>
            <th class="investments-audit__num">Precio usado</th>
            <th>Fuente</th>
            <th class="investments-audit__num">Valor est.</th>
            <th class="investments-audit__num">Mat.</th>
            <th class="investments-audit__num">No mat.</th>
            <th class="investments-audit__num">Div.</th>
            <th class="investments-audit__num">Fees</th>
            <th class="investments-audit__num">P/G total</th>
            <th class="investments-audit__num">Rent. %</th>
          </tr>
        </thead>
        <tbody>
          {#each positions as pos (pos.asset)}
            <tr>
              <td class="investments-audit__asset">{pos.asset}</td>
              <td class="investments-audit__num">{formatQty(pos.quantity)}</td>
              <td class="investments-audit__num">{formatUsd(pos.cost_basis_usd)}</td>
              <td class="investments-audit__num">{formatPrice(pos.average_cost_usd)}</td>
              <td class="investments-audit__num">{formatPrice(pos.used_price_usd ?? pos.market_price_usd)}</td>
              <td>{pos.price_source_label ?? 'Sin precio disponible'}</td>
              <td class="investments-audit__num">{formatUsd(pos.market_value_usd)}</td>
              <td class="investments-audit__num {pnlClass(pos.realized_pnl_usd)}">{formatPnl(pos.realized_pnl_usd)}</td>
              <td class="investments-audit__num {pnlClass(pos.unrealized_pnl_usd)}">{formatPnl(pos.unrealized_pnl_usd)}</td>
              <td class="investments-audit__num {pnlClass(pos.dividends_usd)}">{formatPnl(pos.dividends_usd)}</td>
              <td class="investments-audit__num">{formatUsd(pos.fees_paid_usd)}</td>
              <td class="investments-audit__num {pnlClass(pos.total_pnl_usd)}">{formatPnl(pos.total_pnl_usd)}</td>
              <td class="investments-audit__num {pnlClass(pos.total_return_percent)}">{formatPercent(pos.total_return_percent)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
