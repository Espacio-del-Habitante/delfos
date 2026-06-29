<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CustomSelect from './CustomSelect.svelte';
  import { createInvestmentAsset } from '@common/lib/api';
  import { applyFinancePayload } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import type { InvestmentAsset } from '@common/lib/types';

  export let assets: InvestmentAsset[] = [];
  export let value = '';
  export let name: string | undefined = undefined;
  export let required = false;
  export let disabled = false;
  export let placeholder = 'Seleccionar activo';

  const dispatch = createEventDispatcher<{ change: { symbol: string } }>();
  const OTHER = '__other__';

  let selectValue = '';
  let showOther = false;
  let otherSymbol = '';
  let creating = false;

  function normalize(sym: string): string {
    return sym.trim().toUpperCase();
  }

  function symbolExists(sym: string): boolean {
    const key = normalize(sym);
    return assets.some((a) => normalize(a.symbol) === key);
  }

  $: options = [
    { value: '', label: placeholder },
    ...assets.map((a) => ({
      value: a.symbol,
      label: a.label ? `${a.symbol} — ${a.label}` : a.symbol,
    })),
    { value: OTHER, label: 'Otro…' },
  ];

  $: syncFromValue(value, assets);

  function syncFromValue(sym: string, _assets: InvestmentAsset[]) {
    const trimmed = (sym || '').trim();
    if (!trimmed) {
      selectValue = '';
      showOther = false;
      otherSymbol = '';
      return;
    }
    if (symbolExists(trimmed)) {
      const match = assets.find((a) => normalize(a.symbol) === normalize(trimmed));
      selectValue = match?.symbol ?? trimmed;
      showOther = false;
      otherSymbol = '';
      return;
    }
    selectValue = OTHER;
    showOther = true;
    otherSymbol = trimmed;
  }

  async function ensureAsset(sym: string): Promise<string | null> {
    const key = normalize(sym);
    if (!key) return null;
    if (symbolExists(key)) return key;
    if (!confirm(`¿Deseas crear el activo ${key}?`)) return null;
    creating = true;
    try {
      const data = await createInvestmentAsset(key);
      applyFinancePayload(data);
      dispatch('change', { symbol: key });
      showToast(`Activo ${key} creado`, { type: 'success' });
      return key;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al crear activo', { type: 'error' });
      return null;
    } finally {
      creating = false;
    }
  }

  function onSelectChange(e: CustomEvent<{ value: string }>) {
    const next = e.detail.value;
    selectValue = next;
    if (next === OTHER) {
      showOther = true;
      otherSymbol = '';
      value = '';
      return;
    }
    showOther = false;
    otherSymbol = '';
    value = next;
    dispatch('change', { symbol: next });
  }

  async function onOtherBlur() {
    const key = normalize(otherSymbol);
    if (!key) {
      value = '';
      return;
    }
    if (symbolExists(key)) {
      value = key;
      showOther = false;
      selectValue = key;
      dispatch('change', { symbol: key });
      return;
    }
    const created = await ensureAsset(key);
    if (created) {
      value = created;
      showOther = false;
      selectValue = created;
    }
  }

  async function onOtherKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      await onOtherBlur();
    }
  }

  /** Flush pending input and ensure catalog entry exists before save. */
  export async function commit(): Promise<string | null> {
    if (showOther) {
      return onOtherBlur().then(() => value.trim() || null);
    }
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!symbolExists(trimmed)) {
      const created = await ensureAsset(trimmed);
      return created;
    }
    return trimmed;
  }
</script>

<div class="asset-select">
  {#if showOther}
    <input
      type="text"
      class="edit-form__input asset-select__other"
      {name}
      {required}
      placeholder="Símbolo del activo (ej. VTI)"
      bind:value={otherSymbol}
      on:blur={onOtherBlur}
      on:keydown={onOtherKeydown}
      disabled={disabled || creating}
    />
  {:else}
    <CustomSelect
      {options}
      value={selectValue}
      {name}
      {required}
      {placeholder}
      on:change={onSelectChange}
    />
  {/if}
</div>
