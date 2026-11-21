<script lang="ts">
  import { onMount } from 'svelte';
  import MercadoNav from '../components/MercadoNav.svelte';
  import TripPanel from '../components/organisms/TripPanel.svelte';
  import HistoryPanel from '../components/organisms/HistoryPanel.svelte';
  import StatsPanel from '../components/organisms/StatsPanel.svelte';
  import SettingsPanel from '../components/organisms/SettingsPanel.svelte';
  import { getActiveTrip, getState, startTrip } from '../../../lib/store.js';
  import { showToast } from '../../../vendor/delfos/toast';

  export let tab: 'trip' | 'history' | 'stats' | 'settings' = 'trip';

  let tick = 0;

  function refresh() {
    tick += 1;
  }

  onMount(() => {
    const s = getState();
    if (!s.activeTripId) {
      startTrip({ budget: s.settings.budgetDefault });
      refresh();
    }
  });

  $: trip = (() => {
    tick;
    return getActiveTrip();
  })();
</script>

<main class="app-shell">
  <header class="mercado-page-header">
    <div class="mercado-page-header__brand">
      <img class="mercado-page-header__mark" src="/icon.svg" alt="" width="36" height="36" />
      <div>
        <h1 class="mercado-page-header__title">Deméter</h1>
        <p class="mercado-page-header__sub">Cosecha · hermana de Delfos</p>
      </div>
    </div>
  </header>

  {#if tab === 'trip'}
    <TripPanel
      {trip}
      on:change={refresh}
      on:toast={(e) => showToast(e.detail.message, { type: e.detail.type || 'info' })}
    />
  {:else if tab === 'history'}
    <HistoryPanel
      on:change={refresh}
      on:toast={(e) => showToast(e.detail.message, { type: e.detail.type || 'info' })}
    />
  {:else if tab === 'stats'}
    <StatsPanel />
  {:else}
    <SettingsPanel
      on:change={refresh}
      on:toast={(e) => showToast(e.detail.message, { type: e.detail.type || 'info' })}
    />
  {/if}
</main>

<MercadoNav active={tab} />
