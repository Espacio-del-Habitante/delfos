<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fetchPortfolioInsights, getAiSettings, getOllamaHealth } from '@common/lib/api';
  import { formatMultiCurrency } from '@common/lib/formatters';
  import type { AiProviderId, AssistantKpis, PortfolioInsights, Summary } from '@common/lib/types';

  export let summary: Summary | null = null;
  // Optional: parent can pass insights to avoid a duplicate fetch. When omitted,
  // the island self-fetches so it works standalone on any page.
  export let insights: PortfolioInsights | null = null;
  // Optional: when parent already has finance payload, pass KPIs to avoid extra fetch.
  export let kpis: AssistantKpis | null = null;

  let zoneEl: HTMLDivElement;
  let revealed = false;
  let isNear = false;
  let isExpanded = false;
  let aiOk: boolean | null = null;
  let statusText = 'Delfos';
  let canHover = false;
  let rafId = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  let ownInsights: PortfolioInsights | null = null;
  let insightsLoading = false;

  const PROXIMITY = 40;

  type PeekChip = {
    key: string;
    label: string;
    value: string;
    sub?: string;
    title: string;
    tone?: 'up' | 'down' | 'neutral';
    variant?: 'pnl' | 'loss' | 'default';
  };

  // Prefer caller-provided insights; fall back to self-fetched data.
  $: portfolio = insights ?? ownInsights;

  // --- Derived finance signals (kept declarative so new signals are easy to add) ---
  $: hasPositions = !!portfolio?.has_positions;
  $: strongest = portfolio?.strongest_asset ?? null;
  $: totalPnl = portfolio?.total_pnl_usd ?? null;
  $: pnlTone = totalPnl == null ? 'neutral' : totalPnl > 0 ? 'up' : totalPnl < 0 ? 'down' : 'neutral';
  $: losers = (portfolio?.positions ?? []).filter((p) => (p.unrealized_pnl_usd ?? 0) < 0);
  $: worstLoser = losers.reduce(
    (worst, p) =>
      worst == null || (p.unrealized_pnl_usd ?? 0) < (worst.unrealized_pnl_usd ?? 0) ? p : worst,
    null as (typeof losers)[number] | null,
  );
  $: strongestPos = (portfolio?.positions ?? []).find((p) => p.asset === strongest?.asset) ?? null;
  $: strongestMissing = strongestPos?.quote_confidence === 'missing';
  $: hasLoss = (totalPnl != null && totalPnl < 0) || losers.length > 0;
  $: balanceText =
    summary?.balances_by_currency && Object.keys(summary.balances_by_currency).length
      ? formatMultiCurrency(summary.balances_by_currency)
      : '—';

  // Peek chips: actionable finance first, then portfolio. Mobile CSS keeps max ~3.
  $: peekChips = buildPeekChips(
    kpis,
    hasPositions,
    strongest,
    strongestMissing,
    totalPnl,
    pnlTone,
    hasLoss,
    worstLoser,
    balanceText,
  );

  function buildPeekChips(
    kpiData: AssistantKpis | null,
    positions: boolean,
    strong: typeof strongest,
    strongMissing: boolean,
    pnl: number | null,
    tone: 'up' | 'down' | 'neutral',
    loss: boolean,
    loser: typeof worstLoser,
    balance: string,
  ): PeekChip[] {
    const chips: PeekChip[] = [];

    if (kpiData?.savings_actual_percent != null) {
      const actual = kpiData.savings_actual_percent;
      const target = kpiData.savings_target_percent;
      const delta = kpiData.savings_vs_target_delta;
      let sub: string | undefined;
      if (delta != null && target != null) {
        const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
        sub = `${sign}${Math.abs(delta)}`;
      } else if (target != null) {
        sub = `meta ${target}%`;
      }
      chips.push({
        key: 'savings',
        label: 'Ahorro',
        value: `${formatPct(actual)}%`,
        sub,
        title: 'Ahorro del mes: (ingresos − gastos) / ingresos',
        tone: actual > 0 ? 'up' : actual < 0 ? 'down' : 'neutral',
        variant: 'pnl',
      });
    }

    if (kpiData?.emergency_months_approx != null) {
      const months = kpiData.emergency_months_approx;
      const target = kpiData.emergency_fund_target_months;
      chips.push({
        key: 'emergency',
        label: 'Emergencia',
        value: `${formatMonths(months)} mes`,
        sub: target != null ? `meta ${formatMonths(target)}` : undefined,
        title: 'Meses de emergencia (cuentas enlazadas a fondo de emergencia)',
      });
    }

    if (positions) {
      chips.push({
        key: 'pnl',
        label: 'P&L',
        value: formatPnl(pnl),
        title: 'Ganancia/pérdida total de la cartera',
        tone,
        variant: 'pnl',
      });
      chips.push({
        key: 'strongest',
        label: 'Más fuerte',
        value: strong?.asset ?? '—',
        sub: strongMissing
          ? formatUsd(strong?.cost_basis_usd)
          : formatUsd(strong?.market_value_usd),
        title: 'Activo más fuerte de tu cartera',
      });
      if (loss && loser) {
        chips.push({
          key: 'loss',
          label: '',
          value: loser.asset,
          sub: formatPnl(loser.unrealized_pnl_usd),
          title: 'Activo en pérdida',
          variant: 'loss',
        });
      }
    } else if (chips.length === 0) {
      chips.push({
        key: 'balance',
        label: 'Balance',
        value: balance,
        title: 'Balance general',
      });
    }

    return chips;
  }

  function formatPct(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function formatMonths(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function formatUsd(n: number | null | undefined): string {
    if (n == null) return '—';
    const abs = Math.abs(n);
    if (abs >= 1000) return `$${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k`;
    return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }

  function formatPnl(n: number | null | undefined): string {
    if (n == null) return '—';
    const sign = n > 0 ? '+' : n < 0 ? '−' : '';
    return `${sign}${formatUsd(Math.abs(n))}`;
  }

  function providerLabel(id: AiProviderId | string | undefined): string {
    if (id === 'gemini') return 'Gemini';
    if (id === 'compatible') return 'IA nube';
    if (id === 'local') return 'Ollama';
    return 'IA';
  }

  async function refreshAiStatus() {
    try {
      const { config } = await getAiSettings();
      const provider = (config.effective_provider || config.provider || 'local') as AiProviderId;
      const label = providerLabel(provider);
      const model = (config.text_model || '').trim();

      if (provider === 'local') {
        // Solo Ollama necesita ping real; la nube no se golpea cada 30s.
        try {
          const data = await getOllamaHealth();
          aiOk = !!data.ok;
          const m = data.model || model;
          statusText = aiOk ? (m ? `${label} · ${m}` : `${label} listo`) : `${label} desconectado`;
        } catch {
          aiOk = false;
          statusText = `${label} desconectado`;
        }
        return;
      }

      // Cloud: estado según config (sin llamar al proveedor).
      if (!config.has_api_key) {
        aiOk = false;
        statusText = `${label} · sin API key`;
        return;
      }
      aiOk = true;
      statusText = model ? `${label} · ${model}` : `${label} listo`;
    } catch {
      aiOk = null;
      statusText = summary?.status || 'Delfos';
    }
  }

  async function loadInsights() {
    if (insights) return; // caller owns the data
    insightsLoading = true;
    try {
      ownInsights = await fetchPortfolioInsights();
    } catch {
      ownInsights = null;
    } finally {
      insightsLoading = false;
    }
  }

  function setRevealed(value: boolean) {
    revealed = value;
  }

  function onMouseMove(e: MouseEvent) {
    if (!zoneEl || !canHover) return;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      const rect = zoneEl.getBoundingClientRect();
      const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
      const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
      isNear = Math.hypot(dx, dy) <= PROXIMITY;
      if (isNear || zoneEl.matches(':hover') || zoneEl.matches(':focus-within')) {
        setRevealed(true);
      } else if (!isExpanded) {
        setRevealed(false);
      }
    });
  }

  onMount(() => {
    canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (canHover) {
      document.addEventListener('mousemove', onMouseMove);
    }
    refreshAiStatus();
    loadInsights();
    pollTimer = setInterval(refreshAiStatus, 30000);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      if (pollTimer) clearInterval(pollTimer);
    };
  });

  onDestroy(() => {
    if (rafId) cancelAnimationFrame(rafId);
  });
</script>

<div
  class="island-zone"
  id="inicio"
  class:is-near={isNear}
  class:is-expanded={isExpanded}
  bind:this={zoneEl}
  on:mouseenter={() => canHover && setRevealed(true)}
  on:mouseleave={() => {
    if (canHover && !isExpanded && !zoneEl?.matches(':focus-within')) {
      setRevealed(false);
    }
    isNear = false;
  }}
  on:focusin={() => {
    isExpanded = true;
    setRevealed(true);
  }}
  on:focusout={(e) => {
    if (zoneEl?.contains(e.relatedTarget as Node)) return;
    isExpanded = false;
    if (!canHover || !zoneEl?.matches(':hover')) setRevealed(false);
  }}
>
  <header class="island-header" aria-label="Delfos">
    <div class="island-clip">
      <div
        class="island-shell"
        on:click={(e) => {
          if (!canHover) {
            if ((e.target as HTMLElement).closest('.island-settings')) return;
            isExpanded = !isExpanded;
            setRevealed(isExpanded);
          }
        }}
        on:keydown={() => {}}
        role="presentation"
      >
        <!-- Top row, hidden in the peek state, revealed on approach -->
        <div class="island-head" aria-hidden={revealed ? 'false' : 'true'}>
          <div class="island-brand">
            <img
              class="island-brand__logo"
              src="/DelfosLogo.png"
              alt="Delfos"
              width="96"
              height="64"
            />
          </div>
          <div class="island-status" title={statusText}>
            <span
              class="island-status__dot"
              class:is-online={aiOk === true}
              class:is-offline={aiOk === false}
              aria-hidden="true"
            ></span>
            <span class="island-status__text">{statusText}</span>
          </div>
          <a href="/configuracion" class="island-settings" aria-label="Configuración">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </a>
        </div>

        <!-- Always-visible signal line: the part that peeks at rest -->
        <div class="island-signal">
          <img
            class="island-signal__logo"
            src="/isotipo.png"
            alt=""
            width="28"
            height="28"
            aria-hidden="true"
          />
          {#if insightsLoading && !portfolio && peekChips.length === 0}
            <span class="island-signal__muted">Cargando…</span>
          {:else if peekChips.length}
            <div class="island-signal__chips">
              {#each peekChips as chip (chip.key)}
                <span
                  class="island-chip"
                  class:island-chip--pnl={chip.variant === 'pnl'}
                  class:island-chip--loss={chip.variant === 'loss'}
                  data-tone={chip.tone ?? undefined}
                  title={chip.title}
                >
                  {#if chip.variant === 'loss'}
                    <span class="island-chip__arrow" aria-hidden="true">▼</span>
                  {/if}
                  {#if chip.label}
                    <span class="island-chip__label">{chip.label}</span>
                  {/if}
                  <span class="island-chip__value">
                    {chip.value}
                    {#if chip.sub}
                      <span class="island-chip__sub">{chip.sub}</span>
                    {/if}
                  </span>
                </span>
              {/each}
            </div>
          {:else}
            <span class="island-signal__muted">Sin señales aún</span>
          {/if}
        </div>

        <!-- Detail drawer: KPIs only (no navigation) -->
        <div class="island-detail" aria-hidden={revealed ? 'false' : 'true'}>
          <div class="island-detail__inner">
            <div class="island-meta">
              <div class="island-meta__item">
                <span class="island-meta__label">Balance</span>
                <span class="island-meta__value">{balanceText}</span>
              </div>
              <div class="island-meta__item">
                <span class="island-meta__label">Movimientos</span>
                <span class="island-meta__value">{summary?.total_movements ?? 0}</span>
              </div>
              {#if kpis?.savings_actual_percent != null}
                <div class="island-meta__item">
                  <span class="island-meta__label">Ahorro mes</span>
                  <span class="island-meta__value">{formatPct(kpis.savings_actual_percent)}%</span>
                </div>
              {/if}
              {#if kpis?.emergency_months_approx != null}
                <div class="island-meta__item">
                  <span class="island-meta__label">Emergencia</span>
                  <span class="island-meta__value"
                    >{formatMonths(kpis.emergency_months_approx)} mes</span
                  >
                </div>
              {/if}
              {#if hasPositions}
                <div class="island-meta__item">
                  <span class="island-meta__label">Realizada neta</span>
                  <span class="island-meta__value">{formatPnl(portfolio?.total_realized_pnl_usd)}</span>
                </div>
                <div class="island-meta__item">
                  <span class="island-meta__label">No realizada</span>
                  <span class="island-meta__value">{formatPnl(portfolio?.total_unrealized_pnl_usd)}</span>
                </div>
                {#if portfolio?.total_dividends_usd}
                  <div class="island-meta__item">
                    <span class="island-meta__label">Dividendos</span>
                    <span class="island-meta__value">{formatPnl(portfolio.total_dividends_usd)}</span>
                  </div>
                {/if}
              {/if}
            </div>
            {#if portfolio?.quotes_partial}
              <p class="island-note">Algunos precios no están disponibles ahora mismo.</p>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </header>
</div>
