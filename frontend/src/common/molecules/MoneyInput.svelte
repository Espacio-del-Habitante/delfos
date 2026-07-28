<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import {
    caretAfterMoneyFormat,
    formatMoneyInput,
    formatMoneyTyping,
    parseMoneyInput,
  } from '@common/lib/moneyInput.mjs';

  /** Plain number for API / parent state. Empty → null (or 0 if emptyAsNull=false). */
  export let value: number | null = null;
  export let placeholder = '';
  export let required = false;
  export let disabled = false;
  export let name = '';
  export let id = '';
  export let maxFractionDigits = 2;
  /** Empty field: null (default) vs 0. */
  export let emptyAsNull = true;

  let className = '';
  export { className as class };

  const dispatch = createEventDispatcher<{ change: number | null }>();

  let inputEl: HTMLInputElement;
  let text = formatMoneyInput(value, maxFractionDigits);
  let focused = false;
  let lastExternal: number | null = value;

  $: if (!focused && value !== lastExternal) {
    lastExternal = value;
    text = formatMoneyInput(value, maxFractionDigits);
  }

  $: formValue = value == null ? '' : String(value);

  function commit(n: number | null, format: boolean) {
    value = n;
    lastExternal = value;
    if (format) {
      text = n == null ? '' : formatMoneyInput(n, maxFractionDigits);
    }
    dispatch('change', value);
  }

  async function applyTyping(raw: string, caret: number | null) {
    const next = formatMoneyTyping(raw, maxFractionDigits);
    const newCaret = caretAfterMoneyFormat(raw, caret, next);
    text = next;
    commit(parseMoneyInput(next), false);
    await tick();
    inputEl?.setSelectionRange(newCaret, newCaret);
  }

  function onFocus() {
    focused = true;
  }

  function onInput(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    void applyTyping(el.value, el.selectionStart);
  }

  function onKeyDown(e: KeyboardEvent) {
    const el = e.currentTarget as HTMLInputElement;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start !== end) return;

    // Don't fight the user: backspace/delete through thousand dots.
    if (e.key === 'Backspace' && start > 0 && el.value[start - 1] === '.') {
      e.preventDefault();
      void applyTyping(el.value.slice(0, start - 2) + el.value.slice(start), start - 2);
    } else if (e.key === 'Delete' && start < el.value.length && el.value[start] === '.') {
      e.preventDefault();
      void applyTyping(el.value.slice(0, start) + el.value.slice(start + 2), start);
    }
  }

  function onBlur() {
    focused = false;
    const n = parseMoneyInput(text);
    if (n == null) {
      commit(emptyAsNull ? null : 0, true);
      if (!emptyAsNull) text = formatMoneyInput(0, maxFractionDigits);
    } else {
      commit(n, true);
    }
  }
</script>

<input
  bind:this={inputEl}
  type="text"
  inputmode="decimal"
  class={className}
  {id}
  {placeholder}
  {required}
  {disabled}
  value={text}
  autocomplete="off"
  on:focus={onFocus}
  on:keydown={onKeyDown}
  on:input={onInput}
  on:blur={onBlur}
/>
{#if name}
  <input type="hidden" {name} value={formValue} />
{/if}
