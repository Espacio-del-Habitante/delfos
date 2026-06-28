<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let label: string | undefined = undefined;
  export let value = '';
  export let name: string | undefined = undefined;
  export let id: string | undefined = undefined;
  export let required = false;
  export let disabled = false;
  export let min: string | undefined = undefined;
  export let max: string | undefined = undefined;

  const dispatch = createEventDispatcher<{ change: { value: string } }>();

  function onInput(e: Event) {
    const next = (e.currentTarget as HTMLInputElement).value;
    value = next;
    dispatch('change', { value: next });
  }
</script>

{#if label}
  <label class="edit-form__field date-field" for={id}>
    {label}
    <input
      class="form-control edit-form__input date-field__input"
      type="date"
      {id}
      {name}
      {required}
      {disabled}
      {min}
      {max}
      {value}
      on:input={onInput}
    />
  </label>
{:else}
  <input
    class="form-control edit-form__input date-field__input"
    type="date"
    {id}
    {name}
    {required}
    {disabled}
    {min}
    {max}
    {value}
    on:input={onInput}
  />
{/if}

<style>
  .date-field {
    width: 100%;
  }

  .date-field__input {
    width: 100%;
    min-height: 44px;
    padding: 11px 14px;
    border-radius: 12px;
    color-scheme: light;
  }

  .date-field__input::-webkit-calendar-picker-indicator {
    opacity: 0.55;
    cursor: pointer;
    transition: opacity 140ms var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .date-field__input:hover::-webkit-calendar-picker-indicator {
      opacity: 0.85;
    }
  }

  .date-field__input:focus {
    outline: none;
    border-color: rgba(79, 70, 229, 0.35);
    box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.08);
    background: var(--surface);
  }
</style>
