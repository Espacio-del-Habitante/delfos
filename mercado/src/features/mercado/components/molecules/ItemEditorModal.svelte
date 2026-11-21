<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { formatCop } from '../../../../lib/format.js';
  import { categoryMeta } from '../../../../lib/categories.js';
  import { UNITS, convertQty } from '../../../../lib/units.js';
  import { priceSearchLinks } from '../../../../lib/priceSearch.js';
  import { getProducts } from '../../../../lib/store.js';
  import IconCamera from '../atoms/IconCamera.svelte';

  export let open = false;
  /** 'confirm' | 'adjust' | 'edit' */
  export let mode: 'confirm' | 'adjust' | 'edit' = 'confirm';
  export let draft: {
    id?: string;
    name: string;
    qty: number;
    unit: string;
    amount: number | null;
    category?: string;
    photoDataUrl?: string | null;
  } | null = null;

  const dispatch = createEventDispatcher<{
    close: void;
    save: {
      id?: string;
      name: string;
      qty: number;
      unit: string;
      amount: number | null;
      category: string;
      photoDataUrl: string | null;
      mode: string;
    };
    remove: { id: string };
  }>();

  let name = '';
  let qty = 1;
  let unit = 'und';
  let amountStr = '';
  let photoDataUrl: string | null = null;
  let category = 'otros';
  let fileInput: HTMLInputElement | undefined;
  let seededKey = '';

  $: links = priceSearchLinks(name);
  $: meta = categoryMeta(category);
  $: lastPhotos = (() => {
    name;
    const key = String(name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .trim();
    return (getProducts()[key]?.photos || []).slice(0, 2);
  })();

  $: seedKey = open && draft ? `${mode}:${draft.id || ''}:${draft.name}:${draft.qty}:${draft.unit}` : '';
  $: if (seedKey && seedKey !== seededKey && draft) {
    seededKey = seedKey;
    name = draft.name || '';
    qty = Number(draft.qty) || 1;
    unit = draft.unit || 'und';
    amountStr = draft.amount != null ? String(draft.amount) : '';
    photoDataUrl = draft.photoDataUrl || null;
    category = draft.category || 'otros';
  }

  $: if (typeof document !== 'undefined') {
    if (open) document.body.classList.add('modal-open');
    else document.body.classList.remove('modal-open');
  }

  onDestroy(() => {
    if (typeof document !== 'undefined') document.body.classList.remove('modal-open');
  });

  function bump(delta: number) {
    qty = Math.max(0.05, Math.round((Number(qty) + delta) * 100) / 100);
  }

  function setUnit(next: string) {
    const from = unit;
    const oldQty = Number(qty) || 1;
    const converted = convertQty(oldQty, from, next);
    const n = Number(String(amountStr).replace(/\D/g, ''));
    if (converted != null) {
      const oldKg = convertQty(oldQty, from, 'kg');
      const newKg = convertQty(converted, next, 'kg');
      qty = converted;
      if (n && oldKg && newKg) amountStr = String(Math.round((n / oldKg) * newKg));
    }
    unit = next;
  }

  function onPhoto(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      photoDataUrl = String(reader.result || '') || null;
    };
    reader.readAsDataURL(file);
  }

  function clearPhoto() {
    photoDataUrl = null;
    if (fileInput) fileInput.value = '';
  }

  function close() {
    seededKey = '';
    dispatch('close');
  }

  function save() {
    const amount = amountStr.trim() ? Number(String(amountStr).replace(/\D/g, '')) : null;
    dispatch('save', {
      id: draft?.id,
      name: name.trim() || 'producto',
      qty: Number(qty) || 1,
      unit,
      amount: amount && Number.isFinite(amount) ? amount : null,
      category: category || 'otros',
      photoDataUrl,
      mode,
    });
    seededKey = '';
  }

  function remove() {
    if (draft?.id) dispatch('remove', { id: draft.id });
    seededKey = '';
  }

  $: title =
    mode === 'adjust' ? 'Ya está en el carrito' : mode === 'edit' ? 'Editar ítem' : 'Confirmar producto';
</script>

{#if open && draft}
  <div
    class="modal-overlay is-visible"
    role="presentation"
    on:click|self={close}
    on:keydown={(e) => e.key === 'Escape' && close()}
  >
    <div
      class="modal is-visible mercado-item-modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header class="modal__header">
        <div>
          <p class="mercado-item-modal__eyebrow">
            <span class="emoji-char" aria-hidden="true">{meta.emoji}</span>
            {meta.label}
          </p>
          <h2 class="modal__title">{title}</h2>
        </div>
        <button type="button" class="ghost-button" on:click={close} aria-label="Cerrar">Cerrar</button>
      </header>

      <div class="modal__body mercado-stack">
        <label class="muted" for="item-name">Producto</label>
        <input id="item-name" class="mercado-text-input" bind:value={name} />

        <div class="mercado-item-modal__row">
          <div>
            <p class="muted" style="margin:0 0 8px">Cantidad</p>
            <div class="mercado-stepper">
              <button type="button" class="secondary-button mercado-stepper__btn" on:click={() => bump(-1)} aria-label="Menos">−</button>
              <input class="mercado-text-input mercado-stepper__input" type="number" step="0.05" min="0.05" bind:value={qty} />
              <button type="button" class="secondary-button mercado-stepper__btn" on:click={() => bump(1)} aria-label="Más">+</button>
            </div>
          </div>
          <div>
            <p class="muted" style="margin:0 0 8px">Unidad</p>
            <div class="mercado-unit-grid">
              {#each UNITS as u}
                <button
                  type="button"
                  class="mercado-unit"
                  class:is-active={unit === u.id}
                  on:click={() => setUnit(u.id)}
                >
                  {u.id}
                </button>
              {/each}
            </div>
          </div>
        </div>

        <label class="muted" for="item-amount">Precio en caja (COP)</label>
        <input
          id="item-amount"
          class="mercado-text-input"
          inputmode="numeric"
          placeholder="Ej. 8000"
          bind:value={amountStr}
        />
        {#if amountStr}
          <p class="muted" style="margin:0">{formatCop(Number(String(amountStr).replace(/\D/g, '')))}</p>
        {/if}

        <div class="mercado-file">
          <input
            bind:this={fileInput}
            class="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            on:change={onPhoto}
          />
          <button type="button" class="secondary-button mercado-file__btn" on:click={() => fileInput?.click()}>
            <IconCamera size={18} />
            {photoDataUrl ? 'Cambiar foto del producto' : 'Foto del producto'}
          </button>
          {#if photoDataUrl}
            <img class="mercado-item-modal__photo" src={photoDataUrl} alt="Producto" />
            <button type="button" class="ghost-button mercado-file__clear" on:click={clearPhoto}>Quitar foto</button>
          {:else if lastPhotos[0]}
            <button type="button" class="ghost-button" on:click={() => (photoDataUrl = lastPhotos[0])}>
              Usar foto anterior
            </button>
          {/if}
        </div>

        <section class="mercado-price-search" aria-label="Comparar precios">
          <p class="mercado-price-search__title">🔎 ¿Cuánto cuesta afuera?</p>
          <p class="muted" style="margin:0 0 10px">
            Abre buscadores con este producto. Sin tokens: tú miras y decides.
          </p>
          <div class="mercado-price-search__links">
            {#each links as link}
              <a class="mercado-price-search__link" href={link.url} target="_blank" rel="noopener noreferrer">
                <strong>{link.label}</strong>
                <span class="muted">{link.hint}</span>
              </a>
            {/each}
          </div>
        </section>
      </div>

      <footer class="modal__footer">
        {#if mode === 'edit' && draft.id}
          <button type="button" class="ghost-button" style="color:var(--danger)" on:click={remove}>Quitar del carrito</button>
        {/if}
        <div class="modal__actions-right">
          <button type="button" class="secondary-button" on:click={close}>Cancelar</button>
          <button type="button" class="primary-button" on:click={save}>
            {mode === 'edit' || mode === 'adjust' ? 'Guardar cambios' : 'Sumar al carrito'}
          </button>
        </div>
      </footer>
    </div>
  </div>
{/if}
