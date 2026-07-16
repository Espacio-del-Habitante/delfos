<script lang="ts">
  import { onMount } from 'svelte';
  import IconX from '@common/atoms/icons/IconX.svelte';

  // La app de escritorio corre frameless (sin title bar ni menú nativo); esta
  // pequeña isla solo aparece dentro de Electron y da: (1) una franja fina para
  // poder arrastrar la ventana y (2) el único botón de salida que queda.
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
  <button type="button" class="electron-close" aria-label="Cerrar Delfos" on:click={closeApp}>
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

  .electron-close {
    position: fixed;
    top: 8px;
    right: 10px;
    z-index: 600;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--text-muted);
    -webkit-app-region: no-drag;
    transition: transform 160ms var(--ease-out), background 160ms var(--ease-out), color 160ms var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .electron-close:hover {
      color: white;
      background: var(--danger);
    }
  }

  .electron-close:active {
    transform: scale(0.9);
  }

  @media (prefers-reduced-motion: reduce) {
    .electron-close:active {
      transform: none;
    }
  }
</style>
