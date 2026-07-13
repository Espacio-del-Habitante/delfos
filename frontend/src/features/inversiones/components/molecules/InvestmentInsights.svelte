<script lang="ts">
  import type { PortfolioInsights, QuoteConfidence } from '@common/lib/types';
  import { assetTypeLabel } from '@common/lib/investmentTypes';

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

  function confidenceClass(confidence: QuoteConfidence | undefined): string {
    if (!confidence) return 'quote--missing';
    return `quote--${confidence}`;
  }

  function formatTimestamp(ts: string | null | undefined): string {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return ts;
    }
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
  $: priceAlerts = insights?.price_alerts ?? [];
  $: priceProblems = insights?.price_problem_assets ?? [];
  $: quoteSources = insights?.quote_sources ?? [];
  $: brokerComparison = insights?.broker_comparison ?? null;
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
      {#if insights?.total_assets_excluded_usd}
        <span class="investments-hero__stat-hint">Excluidos (sin precio): {formatUsd(insights.total_assets_excluded_usd)} costo base</span>
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
      {#if brokerComparison}
        <span class="investments-hero__stat-hint">
          vs broker: {formatUsd(brokerComparison.reference_total_usd)}
          ({formatPnl(brokerComparison.diff_usd)}, {formatPercent(brokerComparison.diff_percent)})
        </span>
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
            <th>Tipo</th>
            <th>Confianza</th>
            <th>Proveedor</th>
            <th>Timestamp</th>
            <th>Delayed</th>
            <th class="investments-audit__num">Cantidad</th>
            <th class="investments-audit__num">Costo acum.</th>
            <th class="investments-audit__num">Precio usado</th>
            <th class="investments-audit__num">Valor est.</th>
            <th class="investments-audit__num">P/G total</th>
          </tr>
        </thead>
        <tbody>
          {#each positions as pos (pos.asset)}
            <tr>
              <td class="investments-audit__asset">{pos.asset}</td>
              <td>{assetTypeLabel(pos.asset_type)}</td>
              <td>
                <span class="quote-badge {confidenceClass(pos.quote_confidence)}">
                  {pos.quote_confidence_label ?? pos.quote_confidence ?? '—'}
                </span>
              </td>
              <td>{pos.quote_provider_label ?? pos.price_source_label ?? '—'}</td>
              <td>{formatTimestamp(pos.quote_timestamp)}</td>
              <td>{pos.is_delayed ? (pos.delay_label ?? 'Sí') : 'No'}</td>
              <td class="investments-audit__num">{formatQty(pos.quantity)}</td>
              <td class="investments-audit__num">{formatUsd(pos.cost_basis_usd)}</td>
              <td class="investments-audit__num">{formatPrice(pos.used_price_usd ?? pos.market_price_usd)}</td>
              <td class="investments-audit__num">{formatUsd(pos.market_value_usd)}</td>
              <td class="investments-audit__num {pnlClass(pos.total_pnl_usd)}">{formatPnl(pos.total_pnl_usd)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

{#if priceAlerts.length > 0 || priceProblems.length > 0}
  <section class="investments-audit investments-audit--alerts" aria-label="Alertas de cotización">
    <h2 class="card-title">Alertas de cotización</h2>
    {#if priceAlerts.length}
      <ul class="investments-hero__warnings">
        {#each priceAlerts as alert}
          <li class="investments-hero__warning">{alert}</li>
        {/each}
      </ul>
    {/if}
    {#if priceProblems.length}
      <ul class="investments-audit__problem-list">
        {#each priceProblems as pos (pos.asset)}
          <li>
            <strong>{pos.asset}</strong>
            — {pos.quote_confidence_label ?? pos.quote_confidence}
            {#if pos.quote_warnings?.length}
              ({pos.quote_warnings.join('; ')})
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

{#if quoteSources.length > 0}
  <section class="investments-audit investments-audit--sources" aria-label="Fuentes y timestamps">
    <h2 class="card-title">Fuentes y timestamps</h2>
    <ul class="investments-audit__sources">
      {#each quoteSources as source (source.provider)}
        <li>
          <strong>{source.provider_label}</strong>
          — {source.symbols.join(', ')}
          · {formatTimestamp(source.fetched_at)}
          {#if source.delayed_count > 0}
            · {source.delayed_count} delayed
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if brokerComparison}
  <section class="investments-audit investments-audit--broker" aria-label="Comparación con broker">
    <h2 class="card-title">Comparación con broker</h2>
    <p class="investments-audit__broker-row">
      Referencia del broker: {formatUsd(brokerComparison.reference_total_usd)}
      · Delfos: {formatUsd(totalBalance)}
      · Diferencia: {formatPnl(brokerComparison.diff_usd)} ({formatPercent(brokerComparison.diff_percent)})
    </p>
  </section>
{/if}

<style>
  .quote-badge {
    display: inline-flex;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
  }

  .investments-audit__problem-list,
  .investments-audit__sources {
    margin: 0;
    padding-left: 1.1rem;
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .investments-audit--alerts,
  .investments-audit--sources,
  .investments-audit--broker {
    margin-top: 1.25rem;
  }

  .investments-audit__broker-row {
    margin: 0;
    font-size: 0.9rem;
  }
</style>
