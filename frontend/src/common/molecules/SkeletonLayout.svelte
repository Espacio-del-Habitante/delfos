<script lang="ts">
  import Skeleton from '@common/atoms/Skeleton.svelte';

  export let variant:
    | 'dashboard'
    | 'chat'
    | 'settings'
    | 'profile'
    | 'movements'
    | 'investments'
    | 'field'
    | 'card' = 'card';
</script>

{#if variant === 'dashboard'}
  <div class="sk-dash" role="status" aria-busy="true" aria-label="Cargando finanzas">
    <div class="sk-dash__hero">
      <Skeleton height={18} width="40%" radius="999px" tone="light" />
      <Skeleton height={36} width="70%" tone="light" />
      <div class="sk-dash__hero-row">
        <Skeleton height={48} width="48%" radius="var(--radius-sm)" tone="light" />
        <Skeleton height={48} width="48%" radius="var(--radius-sm)" tone="light" />
      </div>
    </div>
    <div class="sk-dash__grid">
      {#each [1, 2, 3, 4] as _}
        <div class="sk-card">
          <Skeleton circle height={32} width={32} />
          <Skeleton height={12} width="45%" />
          <Skeleton height={22} width="70%" />
        </div>
      {/each}
    </div>
    <div class="sk-card sk-card--wide">
      <Skeleton height={14} width="30%" />
      <Skeleton height={18} width="55%" />
      <div class="sk-dash__peek">
        {#each [1, 2, 3, 4] as _}
          <Skeleton height={72} radius="var(--radius-sm)" />
        {/each}
      </div>
    </div>
    <div class="sk-card sk-card--wide">
      <Skeleton height={14} width="35%" />
      {#each [1, 2, 3] as _}
        <div class="sk-row">
          <Skeleton circle height={36} width={36} />
          <div class="sk-row__body">
            <Skeleton height={12} width="40%" />
            <Skeleton height={14} width="65%" />
          </div>
          <Skeleton height={16} width={72} />
        </div>
      {/each}
    </div>
  </div>
{:else if variant === 'chat'}
  <div class="sk-chat" role="status" aria-busy="true" aria-label="Abriendo conversación">
    <div class="sk-chat__ai">
      <Skeleton height={14} width="88%" />
      <Skeleton height={14} width="72%" />
      <Skeleton height={14} width="54%" />
    </div>
    <div class="sk-chat__user">
      <Skeleton height={14} width="60%" />
      <Skeleton height={14} width="40%" />
    </div>
    <div class="sk-chat__ai">
      <Skeleton height={14} width="80%" />
      <Skeleton height={14} width="66%" />
    </div>
  </div>
{:else if variant === 'settings'}
  <div class="sk-settings" role="status" aria-busy="true" aria-label="Cargando configuración">
    {#each [1, 2, 3] as _}
      <div class="sk-card sk-card--wide">
        <Skeleton height={16} width="42%" />
        <Skeleton height={12} width="78%" />
        <Skeleton height={44} radius="12px" />
        <Skeleton height={44} radius="12px" />
        <Skeleton height={40} width="36%" radius="999px" />
      </div>
    {/each}
  </div>
{:else if variant === 'profile'}
  <div class="sk-profile" role="status" aria-busy="true" aria-label="Cargando perfil">
    <div class="sk-card sk-card--wide">
      <Skeleton height={16} width="38%" />
      <div class="sk-profile__grid">
        {#each [1, 2, 3, 4, 5, 6] as _}
          <div class="sk-field">
            <Skeleton height={10} width="40%" />
            <Skeleton height={40} radius="12px" />
          </div>
        {/each}
      </div>
    </div>
    <div class="sk-card sk-card--wide">
      <Skeleton height={16} width="28%" />
      {#each [1, 2] as _}
        <Skeleton height={64} radius="var(--radius-sm)" />
      {/each}
    </div>
  </div>
{:else if variant === 'movements'}
  <div class="sk-moves" role="status" aria-busy="true" aria-label="Cargando movimientos">
    {#each [1, 2, 3, 4, 5] as _}
      <div class="sk-row">
        <Skeleton circle height={40} width={40} />
        <div class="sk-row__body">
          <Skeleton height={11} width="28%" />
          <Skeleton height={14} width="62%" />
        </div>
        <Skeleton height={16} width={80} />
      </div>
    {/each}
  </div>
{:else if variant === 'investments'}
  <div class="sk-inv" role="status" aria-busy="true" aria-label="Cargando inversiones">
    <div class="sk-inv__stats">
      {#each [1, 2, 3, 4] as i}
        <div class="sk-card" class:sk-card--accent={i === 1}>
          <Skeleton height={11} width="55%" />
          <Skeleton height={28} width="70%" />
        </div>
      {/each}
    </div>
    <div class="sk-card sk-card--wide">
      <Skeleton height={180} radius="var(--radius-sm)" />
    </div>
    <div class="sk-card sk-card--wide">
      {#each [1, 2, 3, 4] as _}
        <div class="sk-row">
          <Skeleton height={12} width="18%" />
          <Skeleton height={12} width="22%" />
          <Skeleton height={12} width="16%" />
          <Skeleton height={12} width="20%" />
        </div>
      {/each}
    </div>
  </div>
{:else if variant === 'field'}
  <div class="sk-field" role="status" aria-busy="true" aria-label="Cargando">
    <Skeleton height={10} width="36%" />
    <Skeleton height={44} radius="12px" />
  </div>
{:else}
  <div class="sk-card" role="status" aria-busy="true" aria-label="Cargando">
    <Skeleton height={14} width="40%" />
    <Skeleton height={12} width="70%" />
    <Skeleton height={12} width="55%" />
  </div>
{/if}

<style>
  .sk-card {
    display: grid;
    gap: 10px;
    padding: 18px;
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.72);
    box-shadow: var(--shadow-soft);
  }

  .sk-card--wide {
    width: 100%;
  }

  .sk-card--accent {
    background: color-mix(in srgb, var(--primary) 10%, var(--surface));
  }

  .sk-dash,
  .sk-settings,
  .sk-profile,
  .sk-inv {
    display: grid;
    gap: 16px;
  }

  .sk-dash__hero {
    display: grid;
    gap: 12px;
    padding: 22px;
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--primary) 14%, #1e1b4b);
  }

  .sk-dash__hero-row {
    display: flex;
    gap: 10px;
  }

  .sk-dash__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  @media (min-width: 861px) {
    .sk-dash__grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  .sk-dash__peek {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .sk-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .sk-row__body {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 8px;
  }

  .sk-chat {
    display: grid;
    gap: 14px;
    padding: 12px 4px;
  }

  .sk-chat__ai,
  .sk-chat__user {
    display: grid;
    gap: 8px;
    padding: 14px 16px;
    border-radius: var(--radius-md);
    background: var(--surface);
    border: 1px solid var(--border-soft);
    max-width: 85%;
  }

  .sk-chat__user {
    justify-self: end;
    background: color-mix(in srgb, var(--primary) 8%, var(--surface));
  }

  .sk-settings {
    display: grid;
    gap: 16px;
  }

  @media (min-width: 861px) {
    .sk-settings {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  .sk-profile__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  @media (max-width: 520px) {
    .sk-profile__grid {
      grid-template-columns: 1fr;
    }
  }

  .sk-field {
    display: grid;
    gap: 8px;
  }

  .sk-moves {
    display: grid;
    gap: 14px;
    padding: 4px 0;
  }

  .sk-inv__stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  @media (min-width: 720px) {
    .sk-inv__stats {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
</style>
