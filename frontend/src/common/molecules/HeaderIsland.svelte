<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { fetchPortfolioInsights, getOllamaHealth } from '@common/lib/api';
  import { formatMultiCurrency } from '@common/lib/formatters';
  import type { PortfolioInsights, Summary } from '@common/lib/types';

  export let summary: Summary | null = null;
  // Optional: parent can pass insights to avoid a duplicate fetch. When omitted,
  // the island self-fetches so it works standalone on any page.
  export let insights: PortfolioInsights | null = null;

  const dispatch = createEventDispatcher<{ openSettings: void }>();

  let zoneEl: HTMLDivElement;
  let revealed = false;
  let isNear = false;
  let isExpanded = false;
  let ollamaOk: boolean | null = null;
  let ollamaModel = '';
  let statusText = 'Delfos';
  let canHover = false;
  let rafId = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  let ownInsights: PortfolioInsights | null = null;
  let insightsLoading = false;

  const PROXIMITY = 40;

  // Prefer caller-provided insights; fall back to self-fetched data.
  $: portfolio = insights ?? ownInsights;

  $: if (ollamaOk === true) {
    statusText = ollamaModel ? `Ollama · ${ollamaModel}` : 'Ollama conectado';
  } else if (ollamaOk === false) {
    statusText = 'Ollama desconectado';
  } else if (summary?.status) {
    statusText = summary.status;
  }

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
  $: hasLoss = (totalPnl != null && totalPnl < 0) || losers.length > 0;
  $: balanceText =
    summary?.balances_by_currency && Object.keys(summary.balances_by_currency).length
      ? formatMultiCurrency(summary.balances_by_currency)
      : '—';

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

  async function checkHealth() {
    try {
      const data = await getOllamaHealth();
      ollamaOk = !!data.ok;
      ollamaModel = data.model || '';
    } catch {
      ollamaOk = false;
      ollamaModel = '';
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

  function scrollTo(selector: string) {
    document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!canHover) {
      isExpanded = false;
      setRevealed(false);
    }
  }

  onMount(() => {
    canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (canHover) {
      document.addEventListener('mousemove', onMouseMove);
    }
    checkHealth();
    loadInsights();
    pollTimer = setInterval(checkHealth, 30000);
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
            if ((e.target as HTMLElement).closest('.island-settings, .island-nav__link')) return;
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
            <span class="island-brand__mark" aria-hidden="true">✦</span>
            <span class="island-brand__name">Delfos</span>
          </div>
          <div class="island-status" title={statusText}>
            <span
              class="island-status__dot"
              class:is-online={ollamaOk === true}
              class:is-offline={ollamaOk === false}
              aria-hidden="true"
            ></span>
            <span class="island-status__text">{statusText}</span>
          </div>
          <button
            type="button"
            class="island-settings"
            aria-label="Configuración"
            on:click|stopPropagation={() => dispatch('openSettings')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </button>
        </div>

        <!-- Always-visible signal line: the part that peeks at rest -->
        <div class="island-signal">
          <span class="island-signal__mark" aria-hidden="true">✦</span>
          {#if insightsLoading && !portfolio}
            <span class="island-signal__muted">Cargando cartera…</span>
          {:else if hasPositions}
            <span class="island-chip" title="Activo más fuerte de tu cartera">
              <span class="island-chip__label">Más fuerte</span>
              <span class="island-chip__value">
                {strongest?.asset ?? '—'}
                <span class="island-chip__sub">
                  {strongest?.quote_missing
                    ? formatUsd(strongest?.cost_basis_usd)
                    : formatUsd(strongest?.market_value_usd)}
                </span>
              </span>
            </span>
            <span class="island-chip island-chip--pnl" data-tone={pnlTone} title="Ganancia/pérdida total">
              <span class="island-chip__label">P&amp;L</span>
              <span class="island-chip__value">{formatPnl(totalPnl)}</span>
            </span>
            {#if hasLoss && worstLoser}
              <span class="island-chip island-chip--loss" title="Activo en pérdida">
                <span class="island-chip__arrow" aria-hidden="true">▼</span>
                <span class="island-chip__value">
                  {worstLoser.asset}
                  <span class="island-chip__sub">{formatPnl(worstLoser.unrealized_pnl_usd)}</span>
                </span>
              </span>
            {:else if hasLoss}
              <span class="island-chip island-chip--loss" title="Resultado en rojo">
                <span class="island-chip__arrow" aria-hidden="true">▼</span>
                <span class="island-chip__value">En rojo</span>
              </span>
            {/if}
          {:else}
            <span class="island-chip" title="Balance general">
              <span class="island-chip__label">Balance</span>
              <span class="island-chip__value">{balanceText}</span>
            </span>
            <span class="island-signal__muted">Sin inversiones aún</span>
          {/if}
        </div>

        <!-- Detail drawer, revealed on approach -->
        <div class="island-detail" aria-hidden={revealed ? 'false' : 'true'}>
          <div class="island-detail__inner">
            <nav class="island-nav" aria-label="Accesos rápidos">
              <button type="button" class="island-nav__link" on:click|preventDefault={() => scrollTo('#resumen')}>Resumen</button>
              <button type="button" class="island-nav__link" on:click|preventDefault={() => scrollTo('#registrar')}>Registrar</button>
              <button type="button" class="island-nav__link" on:click|preventDefault={() => scrollTo('#movimientos')}>Movimientos</button>
              <a href="/inversiones" class="island-nav__link">Inversiones</a>
              <button type="button" class="island-nav__link" on:click|preventDefault={() => scrollTo('#cuentas')}>Cuentas</button>
            </nav>
            <div class="island-meta">
              <div class="island-meta__item">
                <span class="island-meta__label">Balance</span>
                <span class="island-meta__value">{balanceText}</span>
              </div>
              <div class="island-meta__item">
                <span class="island-meta__label">Movimientos</span>
                <span class="island-meta__value">{summary?.total_movements ?? 0}</span>
              </div>
              {#if hasPositions}
                <div class="island-meta__item">
                  <span class="island-meta__label">Realizada</span>
                  <span class="island-meta__value">{formatPnl(portfolio?.total_realized_pnl_usd)}</span>
                </div>
                <div class="island-meta__item">
                  <span class="island-meta__label">No realizada</span>
                  <span class="island-meta__value">{formatPnl(portfolio?.total_unrealized_pnl_usd)}</span>
                </div>
              {/if}
            </div>
            {#if portfolio?.quotes_partial}
              <p class="island-note">Algunos precios no están disponibles ahora mismo.</p>
            {/if}
          </div>
        </div>
      </div>
    </div>
    <p class="island-tagline--mobile">Tu copiloto financiero — registra, analiza y entiende.</p>
  </header>
</div>

<style>
  .island-nav__link {
    background: none;
    border: none;
    cursor: pointer;
    font: inherit;
    text-align: left;
    color: inherit;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }
</style>
