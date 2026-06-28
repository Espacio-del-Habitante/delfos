<script lang="ts">
  import EmojiPicker from '@common/molecules/EmojiPicker.svelte';
  import CustomSelect from '@common/molecules/CustomSelect.svelte';
  import { createCategory, deleteCategory, resetData, updateCategory } from '@common/lib/api';
  import { KIND_LABELS } from '@common/lib/categories';
  import { applyFinancePayload } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import { createModalShellState, hideModalShell, showModalShell } from '@common/lib/modalShell';
  import type { Category } from '@common/lib/types';

  export let open = false;
  export let categories: Category[] = [];

  let shell = createModalShellState();
  let resetShell = createModalShellState();
  let resetOpen = false;
  let resetInput = '';
  let newName = '';
  let newKind = 'expense';
  let newEmoji = '🏷️';

  $: syncSettingsOpen(open);
  $: syncResetOpen(resetOpen);

  function syncSettingsOpen(isOpen: boolean) {
    if (isOpen) {
      void showSettingsModal();
    } else if (shell.rendered && !shell.exiting) {
      void hideSettingsModal();
    }
  }

  function syncResetOpen(isOpen: boolean) {
    if (isOpen) {
      void showResetModal();
    } else if (resetShell.rendered && !resetShell.exiting) {
      void hideResetModal();
    }
  }

  async function showSettingsModal() {
    document.body.classList.add('modal-open');
    shell = { rendered: true, exiting: false, visible: false };
    shell = await showModalShell(shell);
  }

  async function hideSettingsModal() {
    shell = { ...shell, exiting: true, visible: false };
    shell = await hideModalShell(shell);
    if (!resetShell.rendered) document.body.classList.remove('modal-open');
  }

  async function showResetModal() {
    document.body.classList.add('modal-open');
    resetShell = { rendered: true, exiting: false, visible: false };
    resetShell = await showModalShell(resetShell);
  }

  async function hideResetModal() {
    resetShell = { ...resetShell, exiting: true, visible: false };
    resetShell = await hideModalShell(resetShell);
    if (!shell.rendered) document.body.classList.remove('modal-open');
  }

  const kindOptions = [
    { value: 'expense', label: 'Gasto' },
    { value: 'investment', label: 'Inversión' },
    { value: 'note', label: 'Nota' },
    { value: 'general', label: 'General' },
  ];

  function close() {
    open = false;
  }

  function onSettingsOverlay(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  async function addCategory(e: Event) {
    e.preventDefault();
    try {
      const data = await createCategory({ name: newName.trim(), emoji: newEmoji, kind: newKind });
      applyFinancePayload(data);
      categories = data.categories;
      newName = '';
      newEmoji = '🏷️';
      showToast('Categoría creada', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al crear categoría', { type: 'error' });
    }
  }

  async function editCategory(cat: Category) {
    const newNamePrompt = prompt('Nombre de categoría', cat.name);
    if (newNamePrompt === null) return;
    const trimmed = newNamePrompt.trim();
    if (!trimmed) {
      showToast('El nombre no puede estar vacío', { type: 'error' });
      return;
    }
    const newEmojiPrompt = prompt('Emoji', cat.emoji);
    if (newEmojiPrompt === null) return;
    try {
      const data = await updateCategory(cat.id, { name: trimmed, emoji: newEmojiPrompt.trim() || cat.emoji });
      applyFinancePayload(data);
      categories = data.categories;
      showToast('Categoría actualizada', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al actualizar', { type: 'error' });
    }
  }

  async function removeCategory(cat: Category) {
    if (!confirm(`¿Eliminar la categoría "${cat.name}"?`)) return;
    try {
      const data = await deleteCategory(cat.id);
      applyFinancePayload(data);
      categories = data.categories;
      showToast('Categoría eliminada', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al eliminar', { type: 'error' });
    }
  }

  async function confirmReset() {
    try {
      const data = await resetData();
      applyFinancePayload(data);
      resetOpen = false;
      open = false;
      resetInput = '';
      showToast('Delfos restablecido', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al restablecer', { type: 'error' });
    }
  }
</script>

{#if shell.rendered}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="modal-overlay"
    class:is-visible={shell.visible}
    class:is-exiting={shell.exiting}
    aria-hidden={!shell.visible}
    on:click={onSettingsOverlay}
  >
    <div
      class="modal"
      class:is-visible={shell.visible}
      class:is-exiting={shell.exiting}
      role="dialog"
      aria-labelledby="settings-modal-title"
      aria-modal="true"
    >
      <div class="modal__header">
        <h2 class="modal__title" id="settings-modal-title">Configuración</h2>
        <button type="button" class="modal__close" aria-label="Cerrar" on:click={close}>&times;</button>
      </div>
      <div class="modal__body modal__body--scroll">
        <p class="settings-intro">Ajustes de Delfos. Los cambios en cuentas y movimientos se gestionan desde sus tarjetas.</p>

        <section class="settings-section" aria-label="Categorías">
          <h3 class="settings-section__title">Categorías</h3>
          <p class="settings-section__hint">Organiza tus gastos, inversiones y notas con categorías reutilizables.</p>
          <div class="category-admin-list">
            {#if categories.length}
              {#each categories as cat (cat.id)}
                <div class="category-admin-item" data-category-id={cat.id}>
                  <span class="category-admin-item__emoji">{cat.emoji}</span>
                  <div class="category-admin-item__info">
                    <p class="category-admin-item__name">{cat.name}</p>
                    <p class="category-admin-item__kind">{KIND_LABELS[cat.kind] || cat.kind}</p>
                  </div>
                  <div class="category-admin-item__actions">
                    <button type="button" class="card-action-btn" on:click={() => editCategory(cat)}>Editar</button>
                    <button type="button" class="card-action-btn card-action-btn--danger" on:click={() => removeCategory(cat)}>Eliminar</button>
                  </div>
                </div>
              {/each}
            {:else}
              <p class="muted" style="font-size:0.85rem;margin:0;">Sin categorías. Agrega la primera abajo.</p>
            {/if}
          </div>
          <form class="category-admin-form" on:submit={addCategory}>
            <div class="category-admin-form__row">
              <input type="text" bind:value={newName} placeholder="Nueva categoría" required class="form-control" />
              <CustomSelect options={kindOptions} bind:value={newKind} />
            </div>
            <div class="category-admin-form__emoji">
              <EmojiPicker value={newEmoji} on:change={(e) => (newEmoji = e.detail)} />
            </div>
            <button type="submit" class="secondary-button category-admin-form__submit">Agregar categoría</button>
          </form>
        </section>

        <div class="danger-zone">
          <p class="danger-zone__label">Zona de riesgo</p>
          <p class="danger-zone__text">Elimina todas las cuentas, movimientos y notas. Esta acción no se puede deshacer.</p>
          <button type="button" class="danger-button" on:click={() => { resetOpen = true; resetInput = ''; }}>Restablecer Delfos</button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if resetShell.rendered}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="modal-overlay"
    class:is-visible={resetShell.visible}
    class:is-exiting={resetShell.exiting}
    aria-hidden={!resetShell.visible}
    on:click={(e) => { if (e.target === e.currentTarget) resetOpen = false; }}
  >
    <div
      class="modal modal--narrow"
      class:is-visible={resetShell.visible}
      class:is-exiting={resetShell.exiting}
      role="dialog"
      aria-labelledby="reset-modal-title"
      aria-modal="true"
    >
      <div class="modal__header">
        <h2 class="modal__title" id="reset-modal-title">Restablecer Delfos</h2>
        <button type="button" class="modal__close" aria-label="Cerrar" on:click={() => (resetOpen = false)}>&times;</button>
      </div>
      <div class="modal__body">
        <p class="danger-zone__text">Se borrarán todos los datos. Escribe <strong>RESTABLECER</strong> para confirmar.</p>
        <input type="text" class="edit-form__input" bind:value={resetInput} placeholder="RESTABLECER" autocomplete="off" />
        <div class="modal__actions">
          <button type="button" class="secondary-button" on:click={() => (resetOpen = false)}>Cancelar</button>
          <button type="button" class="danger-button" disabled={resetInput.trim() !== 'RESTABLECER'} on:click={confirmReset}>Restablecer</button>
        </div>
      </div>
    </div>
  </div>
{/if}
