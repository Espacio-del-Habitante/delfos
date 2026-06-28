<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CustomSelect from './CustomSelect.svelte';
  import { categoriesForKind, type CategorySelection } from '@common/lib/categories';
  import type { Category, SelectOption } from '@common/lib/types';

  export let categories: Category[] = [];
  export let kind: string = 'expense';
  export let selected: { id?: string; name?: string; emoji?: string } | null = null;

  const dispatch = createEventDispatcher<{ change: CategorySelection; requestCreate: { text: string } }>();

  let selectedValue = '';
  let lastExternalKey = '';

  $: filtered = categoriesForKind(categories, kind);
  $: options = [
    { value: '', label: 'Seleccionar categoría' },
    ...filtered.map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}`, emoji: c.emoji, name: c.name })),
    { value: '__new__', label: '+ Crear nueva categoría' },
  ];

  function resolveId(sel: typeof selected, list: Category[]): string {
    if (!sel) return '';
    if (sel.id) return sel.id;
    if (sel.name) {
      const match = list.find((c) => c.name.toLowerCase() === sel.name!.toLowerCase());
      return match?.id ?? '';
    }
    return '';
  }

  // Sync from parent only when the external selection identity changes.
  $: externalKey = `${selected?.id ?? ''}|${selected?.name ?? ''}|${kind}`;
  $: if (externalKey !== lastExternalKey) {
    lastExternalKey = externalKey;
    selectedValue = resolveId(selected, filtered);
  }
  // Categories may load after the first render.
  $: if (selected?.name && !selectedValue && filtered.length) {
    const id = resolveId(selected, filtered);
    if (id) selectedValue = id;
  }

  function onSelectChange(e: CustomEvent<{ value: string; option?: SelectOption & { name?: string; emoji?: string } }>) {
    if (e.detail.value === '__new__') {
      dispatch('requestCreate', { text: selected?.name ?? '' });
      return;
    }
    selectedValue = e.detail.value;
    const cat = categories.find((c) => c.id === selectedValue);
    if (cat) {
      dispatch('change', { id: cat.id, name: cat.name, emoji: cat.emoji });
      return;
    }
    const opt = e.detail.option;
    if (opt?.name) {
      dispatch('change', { name: opt.name, emoji: opt.emoji ?? '' });
    }
  }
</script>

<div class="category-selector">
  <CustomSelect
    class="category-selector__select"
    {options}
    bind:value={selectedValue}
    placeholder="Seleccionar categoría"
    on:change={onSelectChange}
  />
</div>
