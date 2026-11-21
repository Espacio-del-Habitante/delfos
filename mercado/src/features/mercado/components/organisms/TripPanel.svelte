<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { parseUtterance, findItemMatches } from '../../../../lib/parseUtterance.js';
  import { speechSupported, speechSupportReason, listenOnce } from '../../../../lib/speech.js';
  import { formatCop, formatQty } from '../../../../lib/format.js';
  import { categoryMeta } from '../../../../lib/categories.js';
  import {
    addItem,
    updateItem,
    removeItem,
    tripTotal,
    setCheckout,
    closeTrip,
    startTrip,
    getState,
    getProducts,
    findCartItemByName,
    markSynced,
  } from '../../../../lib/store.js';
  import { syncTripToDelfos } from '../../../../lib/syncDelfos.js';
  import IconMic from '../atoms/IconMic.svelte';
  import IconCamera from '../atoms/IconCamera.svelte';
  import ItemEditorModal from '../molecules/ItemEditorModal.svelte';

  export let trip: any = null;

  const dispatch = createEventDispatcher<{
    change: void;
    toast: { message: string; type?: 'success' | 'error' | 'info' };
  }>();

  let draft = '';
  let listening = false;
  let pending: null | { kind: string; matches: any[]; parsed: any } = null;
  let ticketTotal = '';
  let receiptPreview = '';
  let receiptFileName = '';
  let fileInput: HTMLInputElement | undefined;
  let payOpen = false;
  let draftInput: HTMLInputElement | undefined;

  let modalOpen = false;
  let modalMode: 'confirm' | 'adjust' | 'edit' = 'edit';
  let modalDraft: any = null;
  let stopListening: (() => void) | null = null;

  $: total = tripTotal(trip);
  $: budget = Number(trip?.budget) || 0;
  $: pct = budget > 0 ? Math.min(100, Math.round((total / budget) * 100)) : 0;
  $: over = budget > 0 && total > budget;
  $: recent = (() => {
    trip;
    return Object.values(getProducts())
      .filter((p: any) => (p.priceHistory || []).length)
      .sort(
        (a: any, b: any) =>
          String(b.priceHistory.at(-1)?.date || '').localeCompare(
            String(a.priceHistory.at(-1)?.date || ''),
          ),
      )
      .slice(0, 6);
  })();

  function toast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    dispatch('toast', { message, type });
  }

  function changed() {
    dispatch('change');
  }

  function lastPriceFor(name: string) {
    const products = getProducts();
    const key = String(name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .trim();
    const hist = products[key]?.priceHistory || [];
    const last = hist.at(-1);
    if (!last) return null;
    const unitPrice = Number(last.unitPrice);
    if (!Number.isFinite(unitPrice)) return null;
    return {
      unitPrice,
      unit: last.unit || 'und',
      amountFor: (q: number) => Math.round(unitPrice * q),
      photo: (products[key]?.photos || [])[0] || null,
    };
  }

  function openModal(mode: 'confirm' | 'adjust' | 'edit', itemDraft: any) {
    modalMode = mode;
    modalDraft = itemDraft;
    modalOpen = true;
  }

  function closeModal() {
    modalOpen = false;
    modalDraft = null;
  }

  /** Suma al carrito sin modal. Toca el ítem si quieres editar. */
  function commitAdd(parsedItem: any) {
    const item = { ...parsedItem };
    const prev = lastPriceFor(item.name);
    if (item.amount == null && prev) {
      item.amount = prev.amountFor(Number(item.qty) || 1);
      if (!item.unit || item.unit === 'und') item.unit = prev.unit;
    }
    const qty = Number(item.qty) || 1;
    const unit = item.unit || 'und';
    const existing = findCartItemByName(item.name);
    if (existing) {
      const sameUnit = (existing.unit || 'und') === unit;
      const nextQty = sameUnit ? Number(existing.qty) + qty : qty;
      updateItem(existing.id, {
        qty: nextQty,
        unit: sameUnit ? existing.unit : unit,
        amount: item.amount ?? existing.amount,
        category: existing.category || item.category,
      });
      toast(`+ ${existing.name}`, 'success');
    } else {
      addItem({
        name: item.name,
        qty,
        unit,
        amount: item.amount ?? null,
        category: item.category || 'otros',
        photoDataUrl: prev?.photo || null,
      });
      toast(`Sumé ${item.name}`, 'success');
    }
    changed();
  }

  async function applyText(text: string) {
    const parsed = parseUtterance(text);
    if (parsed.intent === 'unknown' || parsed.confidence < 0.35) {
      toast('No entendí. Ej: “papa 8 mil” o solo “papa”', 'error');
      return;
    }
    if (parsed.intent === 'checkout') {
      payOpen = true;
      setCheckout({});
      changed();
      toast('Listo — cierra con el total de la factura', 'info');
      return;
    }
    if (parsed.intent === 'sync') {
      await doSync();
      return;
    }
    if (!trip || trip.status === 'closed') {
      toast('Abre un mercado primero', 'error');
      return;
    }

    if (parsed.intent === 'add') {
      commitAdd(parsed.item);
      return;
    }

    const matches = findItemMatches(trip.items, parsed.item.name);
    if (!matches.length) {
      if (parsed.intent === 'update') {
        commitAdd(parsed.item);
        return;
      }
      toast('No está en el carrito', 'error');
      return;
    }
    if (matches.length === 1) {
      const m = matches[0];
      if (parsed.intent === 'remove') {
        removeItem(m.id);
        changed();
        toast('Quitado', 'success');
        return;
      }
      updateItem(m.id, {
        qty: parsed.item.qty ?? m.qty,
        unit: parsed.item.unit || m.unit,
        amount: parsed.item.amount ?? m.amount,
      });
      changed();
      toast(`Actualicé ${m.name}`, 'success');
      return;
    }
    pending = { kind: parsed.intent, matches, parsed };
  }

  async function submitDraft() {
    const text = draft.trim();
    if (!text) return;
    draft = '';
    await applyText(text);
    queueMicrotask(() => draftInput?.focus());
  }

  async function dictate() {
    if (listening && stopListening) {
      stopListening();
      return;
    }
    const reason = speechSupportReason();
    if (reason === 'needs-https') {
      toast('Dictado necesita HTTPS — abre el túnel en el teléfono', 'error');
      return;
    }
    if (!speechSupported()) {
      toast('Dictado no disponible aquí — escribe', 'error');
      return;
    }
    listening = true;
    toast('Escuchando…', 'info');
    const session = listenOnce({
      onPartial: (t) => {
        draft = t;
      },
    });
    stopListening = () => session.stop();
    try {
      const text = await session.promise;
      draft = text;
      await applyText(text);
      draft = '';
    } catch (e: any) {
      const msg = e?.message || 'Error de micrófono';
      if (!/cancelad/i.test(msg)) toast(msg, 'error');
    } finally {
      listening = false;
      stopListening = null;
      queueMicrotask(() => draftInput?.focus());
    }
  }

  function pickPending(itemId: string) {
    if (!pending) return;
    const m = pending.matches.find((x) => x.id === itemId);
    if (!m) return;
    if (pending.kind === 'remove') {
      removeItem(m.id);
      changed();
      toast('Quitado', 'success');
    } else {
      updateItem(m.id, {
        qty: pending.parsed.item.qty ?? m.qty,
        unit: pending.parsed.item.unit || m.unit,
        amount: pending.parsed.item.amount ?? m.amount,
      });
      changed();
      toast(`Actualicé ${m.name}`, 'success');
    }
    pending = null;
  }

  function quickAdd(product: any) {
    const last = (product.priceHistory || []).at(-1);
    const qty = Number(last?.qty) || 1;
    const unit = last?.unit || 'und';
    const amount =
      last?.unitPrice != null ? Math.round(Number(last.unitPrice) * qty) : last?.amount ?? null;
    commitAdd({
      name: product.name,
      qty,
      unit,
      amount,
      category: product.category || 'otros',
    });
  }

  function openItem(item: any) {
    openModal('edit', {
      id: item.id,
      name: item.name,
      qty: item.qty,
      unit: item.unit,
      amount: item.amount,
      category: item.category,
      photoDataUrl: item.photoDataUrl || null,
    });
  }

  function onModalSave(e: CustomEvent) {
    const d = e.detail;
    if (d.mode === 'confirm') {
      addItem({
        name: d.name,
        qty: d.qty,
        unit: d.unit,
        amount: d.amount,
        category: d.category,
        photoDataUrl: d.photoDataUrl,
      });
      toast(`Sumé ${d.name}`, 'success');
    } else if (d.id) {
      updateItem(d.id, {
        name: d.name,
        qty: d.qty,
        unit: d.unit,
        amount: d.amount,
        category: d.category,
        photoDataUrl: d.photoDataUrl,
      });
      toast(d.mode === 'adjust' ? `Actualicé ${d.name}` : 'Guardado', 'success');
    }
    closeModal();
    changed();
  }

  function onModalRemove(e: CustomEvent) {
    removeItem(e.detail.id);
    closeModal();
    changed();
    toast('Quitado', 'success');
  }

  function onReceiptFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    receiptFileName = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      receiptPreview = String(reader.result || '');
      setCheckout({ photoDataUrl: receiptPreview });
      changed();
      toast('Factura guardada', 'success');
    };
    reader.readAsDataURL(file);
  }

  function clearReceipt() {
    receiptPreview = '';
    receiptFileName = '';
    if (fileInput) fileInput.value = '';
    setCheckout({ photoDataUrl: null });
    changed();
  }

  function applyTicket() {
    const t = Number(String(ticketTotal).replace(/\D/g, ''));
    if (!t) {
      toast('Escribe el total de la caja', 'error');
      return;
    }
    const diff = t - total;
    setCheckout({ ticketTotal: t, notes: `diff=${diff}` });
    changed();
    if (Math.abs(diff) < 1) toast('Cuadra con el carrito', 'success');
    else if (diff > 0) toast(`La caja sale ${formatCop(diff)} más`, 'info');
    else toast(`Calculaste ${formatCop(-diff)} de más`, 'info');
  }

  async function doSync() {
    try {
      const settings = getState().settings;
      if (!trip) throw new Error('No hay viaje');
      if (ticketTotal.trim()) applyTicket();
      const res = await syncTripToDelfos(trip, settings);
      markSynced(trip.id, {
        at: new Date().toISOString(),
        ok: true,
        expenseId: res.expense?.id || null,
      });
      changed();
      toast('Sincronizado con Delfos', 'success');
    } catch (e: any) {
      if (trip) {
        markSynced(trip.id, { at: new Date().toISOString(), ok: false, error: e.message });
        changed();
      }
      toast(e?.message || 'No se pudo sincronizar', 'error');
    }
  }

  function finishTrip() {
    if (ticketTotal.trim()) applyTicket();
    closeTrip();
    startTrip({ budget: getState().settings.budgetDefault });
    ticketTotal = '';
    receiptPreview = '';
    receiptFileName = '';
    pending = null;
    payOpen = false;
    closeModal();
    changed();
    toast('Mercado cerrado', 'success');
  }

  function newTrip() {
    startTrip({ budget: getState().settings.budgetDefault });
    changed();
  }
</script>

{#if !trip}
  <section class="manual-card">
    <div class="empty-state">
      <div class="empty-state__icon" aria-hidden="true">🛒</div>
      <p class="empty-state__title">Sin mercado abierto</p>
      <p class="empty-state__text">Un toque y empiezas a sumar.</p>
      <button type="button" class="primary-button" style="margin-top:14px" on:click={newTrip}>Empezar</button>
    </div>
  </section>
{:else}
  <div class="mercado-stack mercado-trip">
    <section class="hero-card mercado-hero" aria-live="polite">
      <p class="hero-card__label">Total del carrito</p>
      <p class="hero-card__amount amount">{formatCop(total)}</p>
      <div class="hero-card__stats">
        <div>
          <p class="hero-card__stat-label">Presupuesto</p>
          <p class="hero-card__stat-value amount">{formatCop(budget)}</p>
        </div>
        <div>
          <p class="hero-card__stat-label">Ítems</p>
          <p class="hero-card__stat-value">{trip.items.length}</p>
        </div>
      </div>
      <div class="hero-card__footer">
        <span class="hero-card__status">
          <span class="hero-card__status-dot" aria-hidden="true"></span>
          <span>{over ? 'Sobre presupuesto' : 'Dentro del presupuesto'}</span>
        </span>
        <span class="pill">{pct}% usado</span>
      </div>
      {#if budget}
        <div class="mercado-budget-bar" class:is-over={over} style="margin-top:14px">
          <span style={`width:${pct}%`}></span>
        </div>
      {/if}
    </section>

    {#if recent.length && !trip.items.length}
      <section class="mercado-chips" aria-label="Recientes">
        <p class="mercado-chips__label">⚡ De antes — un toque</p>
        <div class="mercado-chips__row">
          {#each recent as p}
            {@const meta = categoryMeta(p.category)}
            <button type="button" class="mercado-chip" on:click={() => quickAdd(p)}>
              <span class="emoji-char" aria-hidden="true">{meta.emoji}</span>
              {p.name}
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if pending}
      <section class="manual-card mercado-confirm">
        <h2 class="card-title" style="margin-top:0">
          ¿Cuál {pending.kind === 'remove' ? 'quito' : 'cambio'}?
        </h2>
        <div class="mercado-stack">
          {#each pending.matches as m}
            <button type="button" class="secondary-button" on:click={() => pickPending(m.id)}>
              {m.name} · {formatQty(m.qty, m.unit)} · {formatCop(m.amount)}
            </button>
          {/each}
          <button type="button" class="ghost-button" on:click={() => (pending = null)}>Cancelar</button>
        </div>
      </section>
    {/if}

    <section class="manual-card" aria-label="Carrito">
      {#if !trip.items.length}
        <div class="empty-state" style="padding:8px 0">
          <div class="empty-state__icon" aria-hidden="true">🧺</div>
          <p class="empty-state__title">Carrito vacío</p>
          <p class="empty-state__text">Escribe o dicta abajo — se suma al toque. Ej: “papa 8 mil”.</p>
        </div>
      {:else}
        {#each [...trip.items].reverse() as item}
          {@const meta = categoryMeta(item.category)}
          <button type="button" class="mercado-item mercado-item--btn" on:click={() => openItem(item)}>
            <div class="mercado-item__main">
              {#if item.photoDataUrl}
                <img class="mercado-item__thumb" src={item.photoDataUrl} alt="" />
              {:else}
                <span class="mercado-item__emoji emoji-char" aria-hidden="true">{meta.emoji}</span>
              {/if}
              <div>
                <p class="mercado-item__name">{item.name}</p>
                <p class="mercado-item__meta">{formatQty(item.qty, item.unit)} · {meta.label}</p>
              </div>
            </div>
            <div class="mercado-item__right">
              <p class="mercado-item__amt amount" class:is-missing={item.amount == null}>
                {item.amount == null ? 'sin precio' : formatCop(item.amount)}
              </p>
              <span class="mercado-item__hint muted">tocar</span>
            </div>
          </button>
        {/each}
      {/if}
    </section>

    <section class="manual-card mercado-pay">
      <button
        type="button"
        class="mercado-pay__toggle"
        aria-expanded={payOpen}
        on:click={() => (payOpen = !payOpen)}
      >
        <span>Cerrar / pagar</span>
        <span class="muted">{payOpen ? 'ocultar' : 'factura + sync'}</span>
      </button>

      {#if payOpen}
        <div class="manual-form mercado-stack" style="margin-top:14px">
          <input
            bind:this={fileInput}
            class="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            on:change={onReceiptFile}
          />
          <div class="mercado-file">
            <button type="button" class="secondary-button mercado-file__btn" on:click={() => fileInput?.click()}>
              <IconCamera size={18} />
              {receiptFileName || trip.receipt?.photoDataUrl ? 'Cambiar foto' : 'Foto de factura'}
            </button>
            {#if receiptFileName || trip.receipt?.photoDataUrl}
              <div class="mercado-file__meta">
                <span class="mercado-file__name">{receiptFileName || 'Factura adjuntada'}</span>
                <button type="button" class="ghost-button mercado-file__clear" on:click={clearReceipt}>Quitar</button>
              </div>
            {/if}
          </div>
          {#if receiptPreview || trip.receipt?.photoDataUrl}
            <img
              class="mercado-receipt-preview"
              src={receiptPreview || trip.receipt.photoDataUrl}
              alt="Factura"
            />
          {/if}
          <input
            class="mercado-text-input"
            type="text"
            bind:value={ticketTotal}
            placeholder="Total en caja"
            inputmode="numeric"
            on:keydown={(e) => e.key === 'Enter' && applyTicket()}
            on:blur={() => ticketTotal.trim() && applyTicket()}
          />
          {#if trip.receipt?.ticketTotal != null}
            <p class="muted" style="margin:0">
              Caja {formatCop(trip.receipt.ticketTotal)} · carrito {formatCop(total)} ·
              diff {formatCop(Number(trip.receipt.ticketTotal) - total)}
            </p>
          {/if}
          <button type="button" class="primary-button" on:click={finishTrip}>Cerrar mercado</button>
          <button type="button" class="secondary-button" on:click={doSync}>Sincronizar con Delfos</button>
        </div>
      {/if}
    </section>
  </div>

  <div class="mercado-composer">
    <div class="mercado-composer__row">
      <input
        bind:this={draftInput}
        class="mercado-text-input mercado-composer__input"
        bind:value={draft}
        placeholder={listening ? 'Escuchando…' : 'papa 8 mil · Enter'}
        enterkeyhint="done"
        autocomplete="off"
        autocorrect="on"
        on:keydown={(e) => e.key === 'Enter' && !listening && submitDraft()}
      />
      <button
        type="button"
        class="primary-button mercado-mic"
        class:is-listening={listening}
        aria-label={listening ? 'Detener dictado' : 'Dictar'}
        title={listening ? 'Toca para detener' : 'Dictar'}
        on:click={dictate}
      >
        <IconMic size={20} />
      </button>
    </div>
    {#if listening}
      <p class="mercado-composer__hint">Escuchando — toca el mic para cortar</p>
    {/if}
  </div>
{/if}

<ItemEditorModal
  open={modalOpen}
  mode={modalMode}
  draft={modalDraft}
  on:close={closeModal}
  on:save={onModalSave}
  on:remove={onModalRemove}
/>
