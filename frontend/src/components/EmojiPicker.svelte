<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { FREQUENT_EMOJIS } from '@/lib/categories';

  export let value = '🏷️';

  const dispatch = createEventDispatcher<{ change: string }>();

  function setEmoji(emoji: string) {
    value = emoji || '🏷️';
    dispatch('change', value);
  }
</script>

<div class="emoji-picker">
  <div class="emoji-picker__grid">
    {#each FREQUENT_EMOJIS as emoji}
      <button
        type="button"
        class="emoji-picker__btn"
        class:is-selected={emoji === value}
        aria-label={emoji}
        on:click={() => setEmoji(emoji)}
      >
        {emoji}
      </button>
    {/each}
  </div>
  <div class="emoji-picker__manual">
    <span class="emoji-picker__manual-label">Otro:</span>
    <input
      type="text"
      maxlength="4"
      aria-label="Emoji manual"
      bind:value
      on:input={() => setEmoji(value.trim() || '🏷️')}
    />
  </div>
</div>
