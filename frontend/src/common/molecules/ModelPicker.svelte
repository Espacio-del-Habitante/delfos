<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CustomSelect from '@common/molecules/CustomSelect.svelte';
  import Skeleton from '@common/atoms/Skeleton.svelte';
  import type { SelectOption } from '@common/lib/types';

  export let label = 'Modelo';
  export let value = '';
  export let models: string[] = [];
  export let placeholder = 'Selecciona un modelo';
  export let help = '';
  export let loading = false;

  const CUSTOM = '__custom__';
  const dispatch = createEventDispatcher<{ change: string }>();

  let customMode = false;
  let customValue = '';

  $: options = buildOptions(models, value, customMode);
  $: selectValue = resolveSelectValue(value, models, customMode);

  function buildOptions(list: string[], current: string, custom: boolean): SelectOption[] {
    const seen = new Set<string>();
    const opts: SelectOption[] = [];
    for (const id of list) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      opts.push({ value: id, label: id });
    }
    if (current && !seen.has(current) && !custom) {
      opts.unshift({ value: current, label: current });
    }
    opts.push({ value: CUSTOM, label: 'Otro (escribir id)…' });
    return opts;
  }

  function resolveSelectValue(current: string, list: string[], custom: boolean): string {
    if (custom) return CUSTOM;
    if (current && list.includes(current)) return current;
    if (current) return current;
    return list[0] || CUSTOM;
  }

  function onSelect(next: string) {
    if (next === CUSTOM) {
      customMode = true;
      customValue = value && !models.includes(value) ? value : '';
      return;
    }
    customMode = false;
    value = next;
    dispatch('change', next);
  }

  function onCustomInput() {
    value = customValue.trim();
    dispatch('change', value);
  }

  function leaveCustom() {
    customMode = false;
    if (!value && models[0]) {
      value = models[0];
      dispatch('change', value);
    }
  }
</script>

<div class="model-picker">
  <span class="model-picker__label">{label}</span>
  {#if loading}
    <Skeleton height={44} radius="12px" label="Consultando catálogo" />
  {:else}
    <CustomSelect
      options={options}
      value={selectValue}
      searchable={models.length >= 8}
      searchPlaceholder="Buscar modelo…"
      on:change={(e) => onSelect(e.detail.value)}
    />
  {/if}
  {#if customMode}
    <div class="model-picker__custom">
      <input
        type="text"
        class="form-control"
        bind:value={customValue}
        placeholder={placeholder}
        autocomplete="off"
        on:input={onCustomInput}
      />
      <button type="button" class="model-picker__back" on:click={leaveCustom}>Usar lista</button>
    </div>
  {/if}
  {#if help}
    <span class="model-picker__help">{help}</span>
  {/if}
</div>

<style>
  .model-picker {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
  }

  .model-picker__label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .model-picker__custom {
    display: grid;
    gap: 8px;
  }

  .model-picker__back {
    justify-self: start;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
    min-height: 32px;
    transition: color 140ms var(--ease-out), transform 140ms var(--ease-out);
  }

  .model-picker__back:active {
    transform: scale(0.97);
  }

  .model-picker__help {
    font-size: 0.76rem;
    color: var(--text-muted);
    line-height: 1.45;
  }
</style>
