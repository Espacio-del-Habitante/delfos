<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { formatCop } from '../../../../lib/format.js';
  import { categoryMeta } from '../../../../lib/categories.js';
  import { UNITS, convertQty } from '../../../../lib/units.js';
  import { fetchPriceQuotes, googlePriceUrl } from '../../../../lib/priceSearch.js';
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
  let sheetVisible = false;

  let priceLoading = false;
  let priceError = '';
  let priceQuotes: Array<{
    id: string;
    label: string;
    status: string;
    approx: number | null;
    url: string;
    sample: string | null;
  }> = [];
  let googleUrl = '';
  let priceQueryKey = '';

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
    priceQuotes = [];
    priceError = '';
    priceQueryKey = '';
  }

  $: if (typeof document !== 'undefined') {
    if (open) document.body.classList.add('modal-open');
    else {
      document.body.classList.remove('modal-open');
      sheetVisible = false;
    }
  }

  $: if (open) {
    // Same trick as Delfos Modal: mount then flip visible for slide-up.
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        sheetVisible = true;
      });
    });
  }

  onDestroy(() => {
    if (typeof document !== 'undefined') document.body.classList.remove('modal-open');
  });

  async function loadPrices(q: string) {
    priceLoading = true;
    priceError = '';
    googleUrl = googlePriceUrl(q);
    try {
      const res = await fetchPriceQuotes(q);
      if (priceQueryKey !== q.toLowerCase()) return;
      priceQuotes = res.quotes;
      googleUrl = res.googleUrl;
      if (!res.found) {
        priceError = 'No encontré precios automáticos. Búscalo en Google y vuelve con el número.';
      }
    } catch {
      if (priceQueryKey !== q.toLowerCase()) return;
      priceQuotes = [];
      priceError = 'No pude consultar precios ahora. Usa Google y pega el valor.';
      googleUrl = googlePriceUrl(q);
    } finally {
      if (priceQueryKey === q.toLowerCase()) priceLoading = false;
    }
  }

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

  function useApprox(n: number | null) {
    if (n == null) return;
    amountStr = String(n);
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
    priceQueryKey = '';
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
    priceQueryKey = '';
  }

  function remove() {
    if (draft?.id) dispatch('remove', { id: draft.id });
    seededKey = '';
    priceQueryKey = '';
  }

  $: title = mode === 'adjust' ? 'Ajustar' : 'Editar';

  function onExtrasToggle(e: Event) {
    const el = e.currentTarget as HTMLDetailsElement;
    if (el.open && name.trim() && !priceQuotes.length && !priceLoading) {
      void loadPrices(name.trim());
    }
  }
</script>

<svelte:window on:keydown={(e) => open && e.key === 'Escape' && close()} />

{#if open && draft}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="modal-overlay"
    class:is-visible={sheetVisible}
    role="presentation"
    on:click|self={close}
  >
    <div
      class="modal modal--narrow mercado-item-modal"
      class:is-visible={sheetVisible}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div class="modal__grabber" aria-hidden="true"></div>
      <header class="modal__header">
        <div class="mercado-item-modal__heading">
          <p class="mercado-item-modal__eyebrow">
            <span class="emoji-char" aria-hidden="true">{meta.emoji}</span>
            {meta.label}
          </p>
          <h2 class="modal__title">{title}</h2>
        </div>
        <button type="button" class="modal__close" aria-label="Cerrar" on:click={close}>&times;</button>
      </header>

      <div class="modal__body mercado-stack">
        <label class="muted" for="item-name">Producto</label>
        <input id="item-name" class="mercado-text-input" bind:value={name} />

        <div class="mercado-item-modal__qtyblock">
          <div class="mercado-item-modal__qty">
            <p class="muted" style="margin:0 0 8px">Cantidad</p>
            <div class="mercado-stepper">
              <button type="button" class="secondary-button mercado-stepper__btn" on:click={() => bump(-1)} aria-label="Menos">−</button>
              <input class="mercado-text-input mercado-stepper__input" type="number" step="0.05" min="0.05" bind:value={qty} />
              <button type="button" class="secondary-button mercado-stepper__btn" on:click={() => bump(1)} aria-label="Más">+</button>
            </div>
          </div>
          <div class="mercado-item-modal__units">
            <p class="muted" style="margin:0 0 8px">Unidad</p>
            <div class="mercado-unit-grid" role="group" aria-label="Unidad">
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

        <label class="muted" for="item-amount">Precio (COP)</label>
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

        <details class="mercado-extras" on:toggle={onExtrasToggle}>
          <summary class="mercado-extras__summary">Foto y precios web</summary>
          <div class="mercado-stack" style="margin-top:12px">
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
                {photoDataUrl ? 'Cambiar foto' : 'Foto'}
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
              <div class="mercado-price-search__head">
                <p class="mercado-price-search__title">🔎 ¿Cuánto cuesta afuera?</p>
                <button
                  type="button"
                  class="ghost-button"
                  style="padding:4px 8px;font-size:0.78rem"
                  on:click={() => loadPrices(name.trim())}
                  disabled={priceLoading || !name.trim()}
                >
                  Buscar
                </button>
              </div>

              {#if priceLoading}
                <p class="muted" style="margin:0">Buscando…</p>
              {:else}
                <div class="mercado-price-search__quotes">
                  {#each priceQuotes as q}
                    <div class="mercado-price-quote" class:is-missing={q.status !== 'ok'}>
                      <div>
                        <strong>{q.label}</strong>
                        {#if q.status === 'ok' && q.approx != null}
                          <p class="mercado-price-quote__approx">aprox. {formatCop(q.approx)}</p>
                        {:else}
                          <p class="muted" style="margin:4px 0 0">Sin precio auto</p>
                        {/if}
                      </div>
                      <div class="mercado-price-quote__actions">
                        {#if q.status === 'ok' && q.approx != null}
                          <button type="button" class="secondary-button" on:click={() => useApprox(q.approx)}>
                            Usar
                          </button>
                        {/if}
                        <a class="ghost-button" href={q.url} target="_blank" rel="noopener noreferrer">
                          {q.status === 'ok' ? 'Ver' : 'Google'}
                        </a>
                      </div>
                    </div>
                  {/each}
                </div>

                {#if priceError}
                  <p class="mercado-price-search__fallback">{priceError}</p>
                  <a class="primary-button mercado-price-search__google" href={googleUrl} target="_blank" rel="noopener noreferrer">
                    Buscar en Google
                  </a>
                {:else if priceQuotes.some((q) => q.status !== 'ok')}
                  <a class="secondary-button mercado-price-search__google" href={googleUrl} target="_blank" rel="noopener noreferrer">
                    Completar en Google
                  </a>
                {/if}
              {/if}
            </section>
          </div>
        </details>
      </div>

      <div class="modal__footer">
        <div class="modal__actions modal__actions--split">
          {#if draft.id}
            <button type="button" class="ghost-button" style="color:var(--danger)" on:click={remove}>Quitar</button>
          {:else}
            <span></span>
          {/if}
          <div class="modal__actions-right">
            <button type="button" class="secondary-button" on:click={close}>Cancelar</button>
            <button type="button" class="primary-button" on:click={save}>Guardar</button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
