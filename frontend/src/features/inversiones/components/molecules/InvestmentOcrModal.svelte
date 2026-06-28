<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Modal from '@common/atoms/Modal.svelte';
  import InvestmentOcrUpload from '@features/inversiones/components/organisms/InvestmentOcrUpload.svelte';

  export let open = false;

  const dispatch = createEventDispatcher<{ refreshed: void; close: void }>();

  function close() {
    open = false;
    dispatch('close');
  }

  function onRefreshed() {
    dispatch('refreshed');
    close();
  }
</script>

<Modal bind:open title="OCR — pantallazo del broker" onClose={close}>
  <div class="investment-ocr-modal">
    <p class="muted investment-actions__export-hint">
      Sube una captura de tu broker. La IA extraerá filas para revisar antes de guardar.
    </p>
    <InvestmentOcrUpload embedded on:refreshed={onRefreshed} />
  </div>

  <div slot="footer" class="modal__actions modal__actions-right">
    <button type="button" class="ghost-button" on:click={close}>Cerrar</button>
  </div>
</Modal>
