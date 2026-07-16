<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { InvestmentRecord, PortfolioInsights } from '@common/lib/types';
  import { assetTypeLabel } from '@common/lib/investmentTypes';

  export let investments: InvestmentRecord[] = [];
  export let portfolioInsights: PortfolioInsights | null = null;

  const dispatch = createEventDispatcher<{ filterAsset: { asset: string } }>();

  const CHART_COLORS = [
    '#2563EB',
    '#0891B2',
    '#7C3AED',
    '#059669',
    '#D97706',
    '#DC2626',
    '#4F46E5',
    '#0D9488',
    '#64748B',
  ];

  const CASH_COLOR = '#94A3B8';

  type AllocationSlice = {
    key: string;
    label: string;
    value: number;
    percent: number;
    color: string;
    startAngle: number;
    endAngle: number;
    filterAsset?: string;
  };

  type PnlBar = {
    asset: string;
    pnl: number;
    color: string;
  };

  type CashflowPoint = {
    month: string;
    label: string;
    deposits: number;
    withdrawals: number;
  };

  let hoveredSlice: string | null = null;
  let hoveredMonth: string | null = null;
  let hoveredPnl: string | null = null;
  let activeAsset: string | null = null;

  function cashflowAmount(inv: InvestmentRecord): number {
    const raw = inv.amount_usd ?? inv.total ?? inv.amount ?? 0;
    return Math.abs(Number(raw) || 0);
  }

  function buildSlices(
    entries: { key: string; label: string; value: number; filterAsset?: string }[],
  ): AllocationSlice[] {
    const filtered = entries.filter((e) => e.value > 0);
    const sum = filtered.reduce((acc, e) => acc + e.value, 0);
    if (!sum) return [];

    let angle = 0;
    return filtered.map((entry, i) => {
      const percent = (entry.value / sum) * 100;
      const sweep = (entry.value / sum) * 360;
      const slice: AllocationSlice = {
        key: entry.key,
        label: entry.label,
        value: entry.value,
        percent,
        color: entry.key === '__cash__' ? CASH_COLOR : CHART_COLORS[i % CHART_COLORS.length],
        startAngle: angle,
        endAngle: angle + sweep,
        filterAsset: entry.filterAsset,
      };
      angle += sweep;
      return slice;
    });
  }

  function buildTickerAllocation(insights: PortfolioInsights | null): AllocationSlice[] {
    if (!insights) return [];
    const entries = (insights.positions ?? [])
      .filter((p) => (p.market_value_usd ?? 0) > 0)
      .map((p) => ({
        key: p.asset,
        label: p.asset,
        value: p.market_value_usd ?? 0,
        filterAsset: p.asset,
      }));
    const cash = insights.cash_available_usd ?? 0;
    if (cash > 0) {
      entries.push({ key: '__cash__', label: 'Efectivo', value: cash, filterAsset: undefined });
    }
    return buildSlices(entries);
  }

  function buildTypeAllocation(insights: PortfolioInsights | null): AllocationSlice[] {
    if (!insights) return [];
    const byType = new Map<string, number>();
    for (const p of insights.positions ?? []) {
      const mv = p.market_value_usd ?? 0;
      if (mv <= 0) continue;
      const type = p.asset_type || 'stock';
      byType.set(type, (byType.get(type) || 0) + mv);
    }
    const cash = insights.cash_available_usd ?? 0;
    if (cash > 0) byType.set('cash', (byType.get('cash') || 0) + cash);

    const entries = [...byType.entries()].map(([type, value]) => ({
      key: type,
      label: assetTypeLabel(type),
      value,
    }));
    return buildSlices(entries);
  }

  function buildPnlBars(insights: PortfolioInsights | null): PnlBar[] {
    if (!insights?.positions?.length) return [];
    return insights.positions
      .filter((p) => p.total_pnl_usd != null)
      .map((p) => ({
        asset: p.asset,
        pnl: p.total_pnl_usd ?? 0,
        color: (p.total_pnl_usd ?? 0) >= 0 ? '#059669' : '#DC2626',
      }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
  }

  function buildCashflowTimeline(rows: InvestmentRecord[]): CashflowPoint[] {
    const byMonth = new Map<string, { deposits: number; withdrawals: number }>();
    for (const inv of rows) {
      const op = inv.operation_type || inv.action || '';
      if (op !== 'deposit' && op !== 'withdrawal') continue;
      const month = inv.date?.slice(0, 7);
      if (!month) continue;
      const amount = cashflowAmount(inv);
      if (amount <= 0) continue;
      const bucket = byMonth.get(month) || { deposits: 0, withdrawals: 0 };
      if (op === 'deposit') bucket.deposits += amount;
      else bucket.withdrawals += amount;
      byMonth.set(month, bucket);
    }
    return [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => ({
        month,
        label: formatMonthLabel(month),
        deposits: data.deposits,
        withdrawals: data.withdrawals,
      }));
  }

  function formatMonthLabel(ym: string): string {
    const [y, m] = ym.split('-');
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const idx = Number(m) - 1;
    return idx >= 0 && idx < 12 ? `${months[idx]} ${y?.slice(2) ?? ''}` : ym;
  }

  function polar(cx: number, cy: number, r: number, angle: number) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
    if (end - start >= 359.99) {
      return [`M ${cx} ${cy - r}`, `A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}`, 'Z'].join(' ');
    }
    const startPt = polar(cx, cy, r, end);
    const endPt = polar(cx, cy, r, start);
    const large = end - start > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${startPt.x} ${startPt.y} A ${r} ${r} 0 ${large} 0 ${endPt.x} ${endPt.y} Z`;
  }

  function formatUsd(n: number): string {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
    return `$${n.toFixed(0)}`;
  }

  function formatPnl(n: number): string {
    const sign = n > 0 ? '+' : n < 0 ? '−' : '';
    return `${sign}$${Math.abs(n).toFixed(0)}`;
  }

  function clearFilter() {
    activeAsset = null;
    dispatch('filterAsset', { asset: '' });
  }

  function onSliceClick(slice: AllocationSlice) {
    const asset = slice.filterAsset;
    if (!asset) return;
    if (activeAsset === asset) {
      clearFilter();
      return;
    }
    activeAsset = asset;
    dispatch('filterAsset', { asset });
  }

  $: tickerAllocation = buildTickerAllocation(portfolioInsights);
  $: typeAllocation = buildTypeAllocation(portfolioInsights);
  $: pnlBars = buildPnlBars(portfolioInsights);
  $: cashflow = buildCashflowTimeline(investments);
  $: maxPnl = Math.max(...pnlBars.map((b) => Math.abs(b.pnl)), 1);
  $: maxCashflow = Math.max(...cashflow.map((p) => Math.max(p.deposits, p.withdrawals)), 1);
  $: hasChartData =
    tickerAllocation.length > 0 ||
    typeAllocation.length > 0 ||
    pnlBars.length > 0 ||
    cashflow.length > 0;

  const donutCx = 80;
  const donutCy = 80;
  const donutR = 64;
  const innerR = 40;
</script>

<section class="investment-charts section" aria-label="Gráficos de inversiones">
  <div class="investment-charts__header">
    <h2 class="card-title">Análisis</h2>
    {#if activeAsset}
      <button type="button" class="investment-charts__clear-filter" on:click={clearFilter}>
        Filtro: {activeAsset} ×
      </button>
    {/if}
  </div>

  {#if !portfolioInsights && !investments.length}
    <div class="investment-charts__empty empty-state">
      <p class="empty-state__title">Sin datos para graficar</p>
      <p class="empty-state__text">Importa operaciones o agrega filas para ver asignación y flujos.</p>
    </div>
  {:else if !hasChartData}
    <div class="investment-charts__empty empty-state">
      <p class="empty-state__title">Datos insuficientes</p>
      <p class="empty-state__text">Añade posiciones con cotización o depósitos/retiros para generar los gráficos.</p>
    </div>
  {:else}
    <div class="investment-charts__grid">
      <article class="investment-charts__card">
        <h3 class="investment-charts__card-title">Asignación por ticker</h3>
        {#if tickerAllocation.length}
          <div class="investment-charts__donut-wrap">
            <svg class="investment-charts__donut" viewBox="0 0 160 160" role="img" aria-label="Asignación por ticker">
              {#each tickerAllocation as slice (slice.key)}
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <path
                  d={arcPath(donutCx, donutCy, donutR, slice.startAngle, slice.endAngle)}
                  fill={slice.color}
                  class="investment-charts__slice"
                  class:is-hovered={hoveredSlice === slice.key}
                  class:is-active={activeAsset === slice.filterAsset}
                  opacity={hoveredSlice && hoveredSlice !== slice.key ? 0.45 : 1}
                  on:mouseenter={() => (hoveredSlice = slice.key)}
                  on:mouseleave={() => (hoveredSlice = null)}
                  on:click={() => slice.filterAsset && onSliceClick(slice)}
                  on:keydown={(e) => e.key === 'Enter' && slice.filterAsset && onSliceClick(slice)}
                  tabindex={slice.filterAsset ? 0 : -1}
                  role={slice.filterAsset ? 'button' : undefined}
                  aria-label="{slice.label}: {slice.percent.toFixed(1)}%"
                />
              {/each}
              <circle cx={donutCx} cy={donutCy} r={innerR} class="investment-charts__donut-hole" />
            </svg>
            {#if hoveredSlice}
              {@const slice = tickerAllocation.find((s) => s.key === hoveredSlice)}
              {#if slice}
                <div class="investment-charts__tooltip" role="status">
                  <strong>{slice.label}</strong>
                  <span>{formatUsd(slice.value)} · {slice.percent.toFixed(1)}%</span>
                </div>
              {/if}
            {/if}
          </div>
          <ul class="investment-charts__legend">
            {#each tickerAllocation as slice (slice.key)}
              <li>
                <button
                  type="button"
                  class="investment-charts__legend-item"
                  class:is-active={activeAsset === slice.filterAsset}
                  disabled={!slice.filterAsset}
                  on:click={() => slice.filterAsset && onSliceClick(slice)}
                  on:mouseenter={() => (hoveredSlice = slice.key)}
                  on:mouseleave={() => (hoveredSlice = null)}
                >
                  <span class="investment-charts__swatch" style:background={slice.color}></span>
                  <span class="investment-charts__legend-label">{slice.label}</span>
                  <span class="investment-charts__legend-value">{slice.percent.toFixed(0)}%</span>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted investment-charts__card-empty">Sin valor de mercado para calcular asignación.</p>
        {/if}
      </article>

      <article class="investment-charts__card">
        <h3 class="investment-charts__card-title">Asignación por tipo</h3>
        {#if typeAllocation.length}
          <div class="investment-charts__donut-wrap">
            <svg class="investment-charts__donut" viewBox="0 0 160 160" role="img" aria-label="Asignación por tipo">
              {#each typeAllocation as slice (slice.key)}
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <path
                  d={arcPath(donutCx, donutCy, donutR, slice.startAngle, slice.endAngle)}
                  fill={slice.color}
                  class="investment-charts__slice"
                  class:is-hovered={hoveredSlice === slice.key}
                  opacity={hoveredSlice && hoveredSlice !== slice.key ? 0.45 : 1}
                  on:mouseenter={() => (hoveredSlice = slice.key)}
                  on:mouseleave={() => (hoveredSlice = null)}
                  tabindex="-1"
                  aria-label="{slice.label}: {slice.percent.toFixed(1)}%"
                />
              {/each}
              <circle cx={donutCx} cy={donutCy} r={innerR} class="investment-charts__donut-hole" />
            </svg>
            {#if hoveredSlice}
              {@const slice = typeAllocation.find((s) => s.key === hoveredSlice)}
              {#if slice}
                <div class="investment-charts__tooltip" role="status">
                  <strong>{slice.label}</strong>
                  <span>{formatUsd(slice.value)} · {slice.percent.toFixed(1)}%</span>
                </div>
              {/if}
            {/if}
          </div>
          <ul class="investment-charts__legend">
            {#each typeAllocation as slice (slice.key)}
              <li>
                <span class="investment-charts__legend-item investment-charts__legend-item--static">
                  <span class="investment-charts__swatch" style:background={slice.color}></span>
                  <span class="investment-charts__legend-label">{slice.label}</span>
                  <span class="investment-charts__legend-value">{slice.percent.toFixed(0)}%</span>
                </span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted investment-charts__card-empty">Sin posiciones abiertas con precio.</p>
        {/if}
      </article>

      <article class="investment-charts__card">
        <h3 class="investment-charts__card-title">P&L neto por activo</h3>
        {#if pnlBars.length}
          <div class="investment-charts__pnl-wrap">
            <svg class="investment-charts__pnl" viewBox="0 0 320 160" role="img" aria-label="P&L neto por activo">
              {#each pnlBars as bar, i (bar.asset)}
                {@const rowH = 140 / pnlBars.length}
                {@const y = 8 + i * rowH}
                {@const barW = (Math.abs(bar.pnl) / maxPnl) * 180}
                {@const x = bar.pnl >= 0 ? 120 : 120 - barW}
                <text x="4" y={y + rowH * 0.65} class="investment-charts__pnl-label">{bar.asset}</text>
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <rect
                  x={x}
                  y={y + 2}
                  width={Math.max(barW, 2)}
                  height={Math.max(rowH - 8, 6)}
                  rx="3"
                  fill={bar.color}
                  class="investment-charts__pnl-bar"
                  class:is-hovered={hoveredPnl === bar.asset}
                  opacity={hoveredPnl && hoveredPnl !== bar.asset ? 0.5 : 1}
                  on:mouseenter={() => (hoveredPnl = bar.asset)}
                  on:mouseleave={() => (hoveredPnl = null)}
                />
                <text x="304" y={y + rowH * 0.65} text-anchor="end" class="investment-charts__pnl-value {bar.pnl >= 0 ? 'pnl--positive' : 'pnl--negative'}">
                  {formatPnl(bar.pnl)}
                </text>
              {/each}
              <line x1="120" y1="4" x2="120" y2="148" class="investment-charts__pnl-axis" />
            </svg>
            {#if hoveredPnl}
              {@const bar = pnlBars.find((b) => b.asset === hoveredPnl)}
              {#if bar}
                <div class="investment-charts__tooltip" role="status">
                  <strong>{bar.asset}</strong>
                  <span>P&L neto: {formatPnl(bar.pnl)}</span>
                </div>
              {/if}
            {/if}
          </div>
        {:else}
          <p class="muted investment-charts__card-empty">Sin posiciones con P&L calculado.</p>
        {/if}
      </article>

      <article class="investment-charts__card">
        <h3 class="investment-charts__card-title">Depósitos y retiros</h3>
        {#if cashflow.length}
          <div class="investment-charts__timeline-wrap">
            <svg class="investment-charts__timeline" viewBox="0 0 320 140" preserveAspectRatio="none" role="img" aria-label="Depósitos y retiros por mes">
              {#each cashflow as point, i (point.month)}
                {@const slotW = 280 / cashflow.length}
                {@const x = 24 + i * slotW + slotW * 0.15}
                {@const barW = Math.max(6, slotW * 0.3)}
                {@const depH = (point.deposits / maxCashflow) * 48}
                {@const witH = (point.withdrawals / maxCashflow) * 48}
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <rect
                  x={x}
                  y={68 - depH}
                  width={barW}
                  height={depH}
                  rx="2"
                  fill="#059669"
                  class="investment-charts__bar"
                  class:is-hovered={hoveredMonth === point.month}
                  on:mouseenter={() => (hoveredMonth = point.month)}
                  on:mouseleave={() => (hoveredMonth = null)}
                />
                <rect
                  x={x + barW + 2}
                  y={72}
                  width={barW}
                  height={witH}
                  rx="2"
                  fill="#DC2626"
                  class="investment-charts__bar"
                  class:is-hovered={hoveredMonth === point.month}
                  on:mouseenter={() => (hoveredMonth = point.month)}
                  on:mouseleave={() => (hoveredMonth = null)}
                />
              {/each}
              <line x1="20" y1="68" x2="304" y2="68" class="investment-charts__axis" />
            </svg>
            <div class="investment-charts__timeline-labels">
              {#each cashflow as point (point.month)}
                <span class="investment-charts__timeline-label">{point.label}</span>
              {/each}
            </div>
            <div class="investment-charts__cashflow-legend">
              <span><span class="investment-charts__swatch" style:background="#059669"></span> Depósitos</span>
              <span><span class="investment-charts__swatch" style:background="#DC2626"></span> Retiros</span>
            </div>
            {#if hoveredMonth}
              {@const point = cashflow.find((p) => p.month === hoveredMonth)}
              {#if point}
                <div class="investment-charts__tooltip investment-charts__tooltip--timeline" role="status">
                  <strong>{point.label}</strong>
                  <span>+{formatUsd(point.deposits)} · −{formatUsd(point.withdrawals)}</span>
                </div>
              {/if}
            {/if}
          </div>
        {:else}
          <p class="muted investment-charts__card-empty">Registra depósitos o retiros con fecha para ver el timeline.</p>
        {/if}
      </article>
    </div>
  {/if}
</section>

<style>
  .investment-charts__pnl-wrap {
    position: relative;
    flex: 1;
    min-height: 160px;
  }

  .investment-charts__pnl {
    width: 100%;
    height: auto;
    display: block;
  }

  .investment-charts__pnl-label {
    font-size: 9px;
    fill: var(--text-muted, #64748b);
    font-weight: 600;
  }

  .investment-charts__pnl-value {
    font-size: 8px;
    font-weight: 600;
  }

  .investment-charts__pnl-axis {
    stroke: rgba(100, 116, 139, 0.35);
    stroke-width: 1;
  }

  .investment-charts__cashflow-legend {
    display: flex;
    gap: 12px;
    margin-top: 8px;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .investment-charts__cashflow-legend span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .investment-charts__legend-item--static {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 0;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    cursor: default;
  }
</style>
