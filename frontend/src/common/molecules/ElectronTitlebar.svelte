<script lang="ts">
  import { onMount } from 'svelte';
  import IconX from '@common/atoms/icons/IconX.svelte';

  // La app de escritorio corre frameless (sin title bar ni menú nativo); esta
  // pequeña isla solo aparece dentro de Electron y da: (1) una franja fina para
  // poder arrastrar la ventana, (2) un affordance visible de mover a la izquierda
  // y (3) el botón de salida a la derecha.
  let isElectron = false;

  onMount(() => {
    isElectron = navigator.userAgent.includes('Electron');
  });

  function closeApp() {
    window.close();
  }
</script>

{#if isElectron}
  <div class="electron-drag-strip" aria-hidden="true"></div>
  <!-- ponytail: drag nativo via -webkit-app-region; no IPC. Solo funciona con pointer. -->
  <div class="electron-chrome electron-move" role="img" aria-label="Mover ventana" title="Mover ventana">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="5 9 2 12 5 15" />
      <polyline points="9 5 12 2 15 5" />
      <polyline points="15 19 12 22 9 19" />
      <polyline points="19 9 22 12 19 15" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="12" y1="2" x2="12" y2="22" />
    </svg>
  </div>
  <button type="button" class="electron-chrome electron-close" aria-label="Cerrar Delfos" on:click={closeApp}>
    <IconX size={15} />
  </button>
{/if}

<style>
  .electron-drag-strip {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 10px;
    z-index: 500;
    -webkit-app-region: drag;
  }

  .electron-chrome {
    position: fixed;
    top: 8px;
    z-index: 600;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--text-muted);
    transition: transform 160ms var(--ease-out), background 160ms var(--ease-out), color 160ms var(--ease-out);
  }

  .electron-move {
    left: 10px;
    -webkit-app-region: drag;
  }

  .electron-close {
    right: 10px;
    -webkit-app-region: no-drag;
  }

  @media (hover: hover) and (pointer: fine) {
    .electron-move:hover {
      color: var(--text-strong);
      background: var(--border-soft);
    }

    .electron-close:hover {
      color: white;
      background: var(--danger);
    }
  }

  .electron-chrome:active {
    transform: scale(0.9);
  }

  @media (prefers-reduced-motion: reduce) {
    .electron-chrome:active {
      transform: none;
    }
  }
</style>
