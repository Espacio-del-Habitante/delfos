<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import EmojiPickerField from '@common/molecules/EmojiPickerField.svelte';
  import { createCategory } from '@common/lib/api';
  import { applyFinancePayload } from '@common/stores/finance';
  import { guessEmoji } from '@common/lib/categories';
  import { showToast } from '@common/lib/toast';
  import type { Category } from '@common/lib/types';

  export let kind = 'expense';
  export let initialName = '';
  export let categories: Category[] = [];
  export let formId = 'category-create-form';
  export let submitting = false;

  const dispatch = createEventDispatcher<{ created: Category }>();

  let name = initialName;
  let emoji = guessEmoji(initialName);

  let lastInitial = initialName;
  $: if (initialName !== lastInitial) {
    lastInitial = initialName;
    name = initialName;
    emoji = guessEmoji(initialName);
  }

  async function submit(e: Event) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      showToast('El nombre no puede estar vacío', { type: 'error' });
      return;
    }
    submitting = true;
    try {
      const data = await createCategory({ name: trimmed, emoji, kind });
      applyFinancePayload(data);
      categories = data.categories;
      const created =
        data.categories.find(
          (c) =>
            c.name.toLowerCase() === trimmed.toLowerCase() && (c.kind === kind || c.kind === 'general'),
        ) ?? null;
      showToast('Categoría creada', { type: 'success' });
      name = '';
      emoji = '🏷️';
      if (created) dispatch('created', created);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al crear categoría', { type: 'error' });
    } finally {
      submitting = false;
    }
  }
</script>

<form id={formId} class="category-create" on:submit={submit}>
  <div class="category-create__field">
    <span class="category-create__label">Nombre y emoji</span>
    <div class="category-create__row">
      <div class="category-create__emoji">
        <EmojiPickerField value={emoji} ariaLabel="Emoji de categoría" on:change={(e) => (emoji = e.detail)} />
      </div>
      <input
        type="text"
        class="form-control category-create__name"
        bind:value={name}
        placeholder="Nombre de categoría"
        aria-label="Nombre de categoría"
        required
      />
    </div>
  </div>
</form>

<style>
  .category-create {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .category-create__field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .category-create__label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .category-create__row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .category-create__emoji {
    flex: 0 0 auto;
  }

  .category-create__name {
    flex: 1 1 auto;
    min-width: 0;
  }
</style>
