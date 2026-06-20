<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CustomSelect from './CustomSelect.svelte';
  import EmojiPicker from './EmojiPicker.svelte';
  import { categoriesForKind, type CategorySelection } from '@/lib/categories';
  import type { Category } from '@/lib/types';

  export let categories: Category[] = [];
  export let kind: string = 'expense';
  export let selected: { id?: string; name?: string; emoji?: string } | null = null;

  const dispatch = createEventDispatcher<{ change: CategorySelection }>();

  let selectedValue = '';
  let showNew = false;
  let newName = '';
  let newEmoji = '🏷️';

  $: filtered = categoriesForKind(categories, kind);
  $: options = [
    { value: '', label: 'Seleccionar categoría' },
    ...filtered.map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}`, emoji: c.emoji, name: c.name })),
    { value: '__new__', label: '+ Crear nueva categoría' },
  ];

  $: {
    selectedValue = '';
    if (selected?.id) {
      selectedValue = selected.id;
    } else if (selected?.name) {
      const match = filtered.find((c) => c.name.toLowerCase() === selected.name!.toLowerCase());
      if (match) selectedValue = match.id;
      else {
        selectedValue = '__new__';
        showNew = true;
        newName = selected.name;
        newEmoji = selected.emoji || '🏷️';
      }
    }
  }

  function notify() {
    if (selectedValue === '__new__') {
      const name = newName.trim();
      if (name) dispatch('change', { name, emoji: newEmoji, isNew: true });
      return;
    }
    if (!selectedValue) {
      dispatch('change', { name: '', emoji: '' });
      return;
    }
    const cat = categories.find((c) => c.id === selectedValue);
    if (cat) dispatch('change', { id: cat.id, name: cat.name, emoji: cat.emoji });
  }

  function onSelectChange(e: CustomEvent<{ value: string }>) {
    selectedValue = e.detail.value;
    showNew = selectedValue === '__new__';
    notify();
  }

  function onNewNameInput() {
    notify();
  }

  function onEmojiChange(e: CustomEvent<string>) {
    newEmoji = e.detail;
    notify();
  }
</script>

<div class="category-selector">
  <CustomSelect
    class="category-selector__select"
    {options}
    value={selectedValue}
    placeholder="Seleccionar categoría"
    on:change={onSelectChange}
  />

  {#if showNew}
    <div class="category-selector__new">
      <span class="category-selector__new-label">Nueva categoría</span>
      <input
        type="text"
        class="form-control"
        placeholder="Nombre de categoría"
        aria-label="Nombre de nueva categoría"
        bind:value={newName}
        on:input={onNewNameInput}
      />
      <EmojiPicker value={newEmoji} on:change={onEmojiChange} />
    </div>
  {/if}
</div>
