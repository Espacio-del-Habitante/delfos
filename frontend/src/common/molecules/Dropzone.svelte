<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  /** File types accepted, e.g. "image/png,image/jpeg" or ".csv,text/csv". Empty = any. */
  export let accept = '';
  /** Max file size in MB. 0 (default) disables the size check. */
  export let maxSizeMb = 0;
  export let disabled = false;
  let className = '';
  export { className as class };

  const dispatch = createEventDispatcher<{ file: File; reject: { reason: string; file: File } }>();

  let fileInput: HTMLInputElement;
  let dragOver = false;

  function openPicker() {
    if (disabled) return;
    fileInput?.click();
  }

  function matchesAccept(file: File): boolean {
    if (!accept.trim()) return true;
    const patterns = accept
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (!patterns.length) return true;
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return patterns.some((pattern) => {
      if (pattern.startsWith('.')) return name.endsWith(pattern);
      if (pattern.endsWith('/*')) return type.startsWith(pattern.slice(0, -1));
      return type === pattern;
    });
  }

  function handleFile(file: File | null | undefined) {
    if (!file) return;
    if (!matchesAccept(file)) {
      dispatch('reject', { reason: 'type', file });
      return;
    }
    if (maxSizeMb > 0 && file.size > maxSizeMb * 1024 * 1024) {
      dispatch('reject', { reason: 'size', file });
      return;
    }
    dispatch('file', file);
  }

  function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    handleFile(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    if (disabled) return;
    handleFile(e.dataTransfer?.files?.[0]);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    if (disabled) return;
    dragOver = true;
  }

  function onDragLeave() {
    dragOver = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class={`ledger-ocr__dropzone ${className}`.trim()}
  class:is-dragover={dragOver}
  on:click={openPicker}
  on:drop={onDrop}
  on:dragover={onDragOver}
  on:dragleave={onDragLeave}
  on:keydown={(e) => e.key === 'Enter' && openPicker()}
  role="button"
  tabindex="0"
  aria-disabled={disabled}
>
  <span class="ledger-ocr__dropzone-icon" aria-hidden="true">
    <slot name="icon" />
  </span>
  <p class="ledger-ocr__dropzone-title">
    <slot name="title">Arrastra un archivo o haz clic</slot>
  </p>
  <p class="ledger-ocr__dropzone-hint">
    <slot name="hint">Selecciona un archivo desde tu dispositivo</slot>
  </p>
  <slot />
</div>

<input
  bind:this={fileInput}
  type="file"
  {accept}
  class="sr-only"
  {disabled}
  on:change={onFileChange}
/>

<style>
  /* Global .ledger-ocr__dropzone (in global.css) handles border/bg + their transitions.
     Scoped here: the dragover scale lift, disabled under reduced motion. */
  .ledger-ocr__dropzone {
    transition: transform 140ms ease-out;
    will-change: transform;
  }

  .ledger-ocr__dropzone.is-dragover {
    transform: scale(1.01);
  }

  @media (prefers-reduced-motion: reduce) {
    .ledger-ocr__dropzone {
      transition: none;
    }
    .ledger-ocr__dropzone.is-dragover {
      transform: none;
    }
  }
</style>
