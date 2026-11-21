<script>
  import { onMount } from 'svelte';
  import TripScreen from './components/TripScreen.svelte';
  import HistoryScreen from './components/HistoryScreen.svelte';
  import StatsScreen from './components/StatsScreen.svelte';
  import SettingsScreen from './components/SettingsScreen.svelte';
  import { getActiveTrip, getState, startTrip } from './lib/store.js';

  let tab = $state('trip');
  let toast = $state('');
  let tick = $state(0);

  function refresh() {
    tick += 1;
  }

  function showToast(msg) {
    toast = msg;
    setTimeout(() => {
      if (toast === msg) toast = '';
    }, 2600);
  }

  onMount(() => {
    const s = getState();
    if (!s.activeTripId) {
      startTrip({ budget: s.settings.budgetDefault });
      refresh();
    }
  });

  const trip = $derived.by(() => {
    tick;
    return getActiveTrip();
  });
</script>

{#if toast}
  <div class="toast" role="status">{toast}</div>
{/if}

<div class="app-shell">
  <header class="topbar">
    <div class="brand">
      <div class="brand__name">Delfos Mercado</div>
      <div class="brand__sub">Local-first · voz · sync</div>
    </div>
  </header>

  {#if tab === 'trip'}
    <TripScreen {trip} onToast={showToast} onChange={refresh} />
  {:else if tab === 'history'}
    <HistoryScreen onToast={showToast} onChange={refresh} />
  {:else if tab === 'stats'}
    <StatsScreen />
  {:else}
    <SettingsScreen onToast={showToast} onChange={refresh} />
  {/if}
</div>

<nav class="nav" aria-label="Navegación">
  <button class:is-active={tab === 'trip'} onclick={() => (tab = 'trip')}>
    <span class="nav__ico">🛒</span>
    Mercado
  </button>
  <button class:is-active={tab === 'history'} onclick={() => (tab = 'history')}>
    <span class="nav__ico">🧾</span>
    Historial
  </button>
  <button class:is-active={tab === 'stats'} onclick={() => (tab = 'stats')}>
    <span class="nav__ico">📈</span>
    Stats
  </button>
  <button class:is-active={tab === 'settings'} onclick={() => (tab = 'settings')}>
    <span class="nav__ico">⚙️</span>
    Ajustes
  </button>
</nav>
