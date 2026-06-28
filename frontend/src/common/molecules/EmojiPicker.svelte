<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { FREQUENT_EMOJIS } from '@common/lib/categories';

  export let value = '🏷️';

  const dispatch = createEventDispatcher<{ change: string }>();

  const DEFAULT_EMOJI = '🏷️';

  function normalizeEmoji(emoji: string): string {
    return (emoji || DEFAULT_EMOJI).normalize('NFC');
  }

  function setEmoji(emoji: string) {
    value = normalizeEmoji(emoji);
    dispatch('change', value);
  }

  $: normalizedValue = normalizeEmoji(value);
</script>

<div class="emoji-picker">
  <div class="emoji-picker__grid">
    {#each FREQUENT_EMOJIS as emoji}
      <button
        type="button"
        class="emoji-picker__btn"
        class:is-selected={normalizeEmoji(emoji) === normalizedValue}
        aria-label={emoji}
        aria-pressed={normalizeEmoji(emoji) === normalizedValue}
        on:click={() => setEmoji(emoji)}
      >
        <span class="emoji-char" aria-hidden="true">{emoji}</span>
      </button>
    {/each}
  </div>
  <div class="emoji-picker__manual">
    <span class="emoji-picker__manual-label">Otro:</span>
    <input
      type="text"
      class="emoji-char"
      maxlength="4"
      aria-label="Emoji manual"
      bind:value
      on:input={() => setEmoji(value.trim() || DEFAULT_EMOJI)}
    />
  </div>
</div>
