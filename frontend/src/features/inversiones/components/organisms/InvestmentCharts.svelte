<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { InvestmentRecord } from '@common/lib/types';

  export let investments: InvestmentRecord[] = [];

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
  ];

  type AllocationSlice = {
    asset: string;
    value: number;
    percent: number;
    color: string;
    startAngle: number;
    endAngle: number;
  };

  type TimelinePoint = {
    month: string;
    count: number;
    label: string;
  };

  let hoveredSlice: string | null = null;
  let hoveredMonth: string | null = null;
  let activeAsset: string | null = null;

  function investmentValue(inv: InvestmentRecord): number {
    const raw = inv.amount_usd ?? inv.total ?? inv.amount ?? 0;
    return Math.abs(Number(raw) || 0);
  }

  function buildAllocation(rows: InvestmentRecord[]): AllocationSlice[] {
    const totals = new Map<string, number>();
    for (const inv of rows) {
      const asset = (inv.asset || '').trim() || 'Sin activo';
      const op = inv.operation_type || inv.action || '';
      if (op === 'sell') continue;
      const val = investmentValue(inv);
      if (val <= 0) continue;
      totals.set(asset, (totals.get(asset) || 0) + val);
    }

    const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const sum = entries.reduce((acc, [, v]) => acc + v, 0);
    if (!sum) return [];

    let angle = 0;
    return entries.map(([asset, value], i) => {
      const percent = (value / sum) * 100;
      const sweep = (value / sum) * 360;
      const slice: AllocationSlice = {
        asset,
        value,
        percent,
        color: CHART_COLORS[i % CHART_COLORS.length],
        startAngle: angle,
        endAngle: angle + sweep,
      };
      angle += sweep;
      return slice;
    });
  }

  function buildTimeline(rows: InvestmentRecord[]): TimelinePoint[] {
    const counts = new Map<string, number>();
    for (const inv of rows) {
      const month = inv.date?.slice(0, 7);
      if (!month) continue;
      counts.set(month, (counts.get(month) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, count]) => ({
        month,
        count,
        label: formatMonthLabel(month),
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
      return [
        `M ${cx} ${cy - r}`,
        `A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}`,
        'Z',
      ].join(' ');
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

  function onSliceClick(asset: string) {
    if (activeAsset === asset) {
      activeAsset = null;
      dispatch('filterAsset', { asset: '' });
      return;
    }
    activeAsset = asset;
    dispatch('filterAsset', { asset });
  }

  $: allocation = buildAllocation(investments);
  $: timeline = buildTimeline(investments);
  $: hasChartData = allocation.length > 0 || timeline.length > 0;
  $: maxTimeline = Math.max(...timeline.map((p) => p.count), 1);

  const donutCx = 80;
  const donutCy = 80;
  const donutR = 64;
  const innerR = 40;
</script>

<section class="investment-charts section" aria-label="Gráficos de inversiones">
  <div class="investment-charts__header">
    <h2 class="card-title">Análisis</h2>
    {#if activeAsset}
      <button type="button" class="investment-charts__clear-filter" on:click={() => onSliceClick(activeAsset)}>
        Filtro: {activeAsset} ×
      </button>
    {/if}
  </div>

  {#if !investments.length}
    <div class="investment-charts__empty empty-state">
      <p class="empty-state__title">Sin datos para graficar</p>
      <p class="empty-state__text">Importa operaciones o agrega filas para ver asignación y actividad.</p>
    </div>
  {:else if !hasChartData}
    <div class="investment-charts__empty empty-state">
      <p class="empty-state__title">Datos insuficientes</p>
      <p class="empty-state__text">Añade montos y fechas a tus operaciones para generar los gráficos.</p>
    </div>
  {:else}
    <div class="investment-charts__grid">
      <article class="investment-charts__card">
        <h3 class="investment-charts__card-title">Asignación por activo</h3>
        {#if allocation.length}
          <div class="investment-charts__donut-wrap">
            <svg
              class="investment-charts__donut"
              viewBox="0 0 160 160"
              role="img"
              aria-label="Gráfico de asignación por activo"
            >
              {#each allocation as slice (slice.asset)}
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <path
                  d={arcPath(donutCx, donutCy, donutR, slice.startAngle, slice.endAngle)}
                  fill={slice.color}
                  class="investment-charts__slice"
                  class:is-hovered={hoveredSlice === slice.asset}
                  class:is-active={activeAsset === slice.asset}
                  opacity={hoveredSlice && hoveredSlice !== slice.asset ? 0.45 : 1}
                  on:mouseenter={() => (hoveredSlice = slice.asset)}
                  on:mouseleave={() => (hoveredSlice = null)}
                  on:click={() => onSliceClick(slice.asset)}
                  on:keydown={(e) => e.key === 'Enter' && onSliceClick(slice.asset)}
                  tabindex="0"
                  role="button"
                  aria-label="{slice.asset}: {slice.percent.toFixed(1)}%"
                />
              {/each}
              <circle cx={donutCx} cy={donutCy} r={innerR} class="investment-charts__donut-hole" />
            </svg>

            {#if hoveredSlice}
              {@const slice = allocation.find((s) => s.asset === hoveredSlice)}
              {#if slice}
                <div class="investment-charts__tooltip" role="status">
                  <strong>{slice.asset}</strong>
                  <span>{formatUsd(slice.value)} · {slice.percent.toFixed(1)}%</span>
                </div>
              {/if}
            {/if}
          </div>

          <ul class="investment-charts__legend">
            {#each allocation as slice (slice.asset)}
              <li>
                <button
                  type="button"
                  class="investment-charts__legend-item"
                  class:is-active={activeAsset === slice.asset}
                  on:click={() => onSliceClick(slice.asset)}
                  on:mouseenter={() => (hoveredSlice = slice.asset)}
                  on:mouseleave={() => (hoveredSlice = null)}
                >
                  <span class="investment-charts__swatch" style:background={slice.color}></span>
                  <span class="investment-charts__legend-label">{slice.asset}</span>
                  <span class="investment-charts__legend-value">{slice.percent.toFixed(0)}%</span>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted investment-charts__card-empty">Sin montos de compra para calcular asignación.</p>
        {/if}
      </article>

      <article class="investment-charts__card">
        <h3 class="investment-charts__card-title">Operaciones en el tiempo</h3>
        {#if timeline.length}
          <div class="investment-charts__timeline-wrap">
            <svg
              class="investment-charts__timeline"
              viewBox="0 0 320 140"
              preserveAspectRatio="none"
              role="img"
              aria-label="Gráfico de operaciones por mes"
            >
              {#each timeline as point, i (point.month)}
                {@const barW = Math.max(8, 280 / timeline.length - 6)}
                {@const x = 24 + i * (280 / timeline.length)}
                {@const h = (point.count / maxTimeline) * 96}
                {@const y = 120 - h}
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx="3"
                  class="investment-charts__bar"
                  class:is-hovered={hoveredMonth === point.month}
                  fill={hoveredMonth === point.month ? '#2563EB' : '#93C5FD'}
                  on:mouseenter={() => (hoveredMonth = point.month)}
                  on:mouseleave={() => (hoveredMonth = null)}
                />
              {/each}
              <line x1="20" y1="120" x2="304" y2="120" class="investment-charts__axis" />
            </svg>

            <div class="investment-charts__timeline-labels">
              {#each timeline as point (point.month)}
                <span class="investment-charts__timeline-label">{point.label}</span>
              {/each}
            </div>

            {#if hoveredMonth}
              {@const point = timeline.find((p) => p.month === hoveredMonth)}
              {#if point}
                <div class="investment-charts__tooltip investment-charts__tooltip--timeline" role="status">
                  <strong>{point.label}</strong>
                  <span>{point.count} operación{point.count !== 1 ? 'es' : ''}</span>
                </div>
              {/if}
            {/if}
          </div>
        {:else}
          <p class="muted investment-charts__card-empty">Añade fechas a tus operaciones para ver la línea temporal.</p>
        {/if}
      </article>
    </div>
  {/if}
</section>
