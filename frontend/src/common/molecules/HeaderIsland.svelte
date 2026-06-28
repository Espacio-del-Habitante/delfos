<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { getOllamaHealth } from '@common/lib/api';
  import { formatMultiCurrency } from '@common/lib/formatters';
  import type { Summary } from '@common/lib/types';

  export let summary: Summary | null = null;

  const dispatch = createEventDispatcher<{ openSettings: void }>();

  let zoneEl: HTMLDivElement;
  let drawerExpanded = false;
  let isNear = false;
  let isExpanded = false;
  let ollamaOk: boolean | null = null;
  let ollamaModel = '';
  let statusText = 'Delfos';
  let canHover = false;
  let rafId = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const PROXIMITY = 40;

  $: if (ollamaOk === true) {
    statusText = ollamaModel ? `Ollama · ${ollamaModel}` : 'Ollama conectado';
  } else if (ollamaOk === false) {
    statusText = 'Ollama desconectado';
  } else if (summary?.status) {
    statusText = summary.status;
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

  function setDrawerExpanded(expanded: boolean) {
    drawerExpanded = expanded;
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
        setDrawerExpanded(true);
      } else if (!isExpanded) {
        setDrawerExpanded(false);
      }
    });
  }

  function scrollTo(selector: string) {
    document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!canHover) {
      isExpanded = false;
      setDrawerExpanded(false);
    }
  }

  onMount(() => {
    canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (canHover) {
      document.addEventListener('mousemove', onMouseMove);
    }
    checkHealth();
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
  on:mouseenter={() => canHover && setDrawerExpanded(true)}
  on:mouseleave={() => {
    if (canHover && !isExpanded && !zoneEl?.matches(':focus-within')) {
      setDrawerExpanded(false);
    }
    isNear = false;
  }}
  on:focusin={() => {
    isExpanded = true;
    setDrawerExpanded(true);
  }}
  on:focusout={(e) => {
    if (zoneEl?.contains(e.relatedTarget as Node)) return;
    isExpanded = false;
    if (!canHover || !zoneEl?.matches(':hover')) setDrawerExpanded(false);
  }}
>
  <header class="island-header" aria-label="Delfos">
    <div
      class="island-shell"
      on:click={(e) => {
        if (!canHover) {
          if ((e.target as HTMLElement).closest('.island-pill__settings, .island-nav__link')) return;
          isExpanded = !isExpanded;
          setDrawerExpanded(isExpanded);
        }
      }}
      on:keydown={() => {}}
      role="presentation"
    >
      <div class="island-pill">
        <div class="island-pill__brand">
          <span class="island-pill__mark" aria-hidden="true">✦</span>
          <span class="island-pill__name">Delfos</span>
        </div>
        <span class="island-pill__divider" aria-hidden="true"></span>
        <div class="island-pill__status">
          <span
            class="island-pill__dot"
            class:is-online={ollamaOk === true}
            class:is-offline={ollamaOk === false}
            aria-hidden="true"
          ></span>
          <span class="island-pill__status-text">{statusText}</span>
        </div>
        <button
          type="button"
          class="island-pill__settings"
          aria-label="Configuración"
          on:click|stopPropagation={() => dispatch('openSettings')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
      </div>
      <div class="island-drawer" aria-hidden={drawerExpanded ? 'false' : 'true'}>
        <div class="island-drawer__inner">
          <p class="island-tagline">Tu copiloto financiero — registra, analiza y entiende.</p>
          <nav class="island-nav" aria-label="Accesos rápidos">
            <button type="button" class="island-nav__link" on:click|preventDefault={() => scrollTo('#resumen')}>Resumen</button>
            <button type="button" class="island-nav__link" on:click|preventDefault={() => scrollTo('#registrar')}>Registrar</button>
            <button type="button" class="island-nav__link" on:click|preventDefault={() => scrollTo('#movimientos')}>Movimientos</button>
            <a href="/inversiones" class="island-nav__link">Inversiones</a>
            <button type="button" class="island-nav__link" on:click|preventDefault={() => scrollTo('#cuentas')}>Cuentas</button>
          </nav>
          <div class="island-mini">
            <div class="island-mini__item">
              <span class="island-mini__label">Balance</span>
              <span class="island-mini__value">
                {summary?.balances_by_currency && Object.keys(summary.balances_by_currency).length
                  ? formatMultiCurrency(summary.balances_by_currency)
                  : '—'}
              </span>
            </div>
            <div class="island-mini__item">
              <span class="island-mini__label">Movimientos</span>
              <span class="island-mini__value">{summary?.total_movements ?? 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <p class="island-tagline island-tagline--mobile">Tu copiloto financiero — registra, analiza y entiende.</p>
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
