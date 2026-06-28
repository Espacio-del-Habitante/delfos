<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CustomSelect from './CustomSelect.svelte';
  import { categoriesForKind, type CategorySelection } from '@common/lib/categories';
  import type { Category } from '@common/lib/types';

  export let categories: Category[] = [];
  export let kind: string = 'expense';
  export let selected: { id?: string; name?: string; emoji?: string } | null = null;

  const dispatch = createEventDispatcher<{ change: CategorySelection; requestCreate: { text: string } }>();

  let selectedValue = '';
  let unmatchedName = '';

  $: filtered = categoriesForKind(categories, kind);
  $: options = [
    { value: '', label: 'Seleccionar categoría' },
    ...filtered.map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}`, emoji: c.emoji, name: c.name })),
    { value: '__new__', label: '+ Crear nueva categoría' },
  ];

  $: {
    selectedValue = '';
    unmatchedName = '';
    if (selected?.id) {
      selectedValue = selected.id;
    } else if (selected?.name) {
      const match = filtered.find((c) => c.name.toLowerCase() === selected.name!.toLowerCase());
      if (match) selectedValue = match.id;
      else unmatchedName = selected.name;
    }
  }

  function notify() {
    if (!selectedValue) {
      dispatch('change', { name: '', emoji: '' });
      return;
    }
    const cat = categories.find((c) => c.id === selectedValue);
    if (cat) dispatch('change', { id: cat.id, name: cat.name, emoji: cat.emoji });
  }

  function onSelectChange(e: CustomEvent<{ value: string }>) {
    if (e.detail.value === '__new__') {
      dispatch('requestCreate', { text: unmatchedName });
      return;
    }
    selectedValue = e.detail.value;
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
</div>
