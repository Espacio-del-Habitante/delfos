<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { parseUtterance, findItemMatches } from '../../../../lib/parseUtterance.js';
  import { speechSupported, listenOnce } from '../../../../lib/speech.js';
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
    markSynced,
  } from '../../../../lib/store.js';
  import { syncTripToDelfos } from '../../../../lib/syncDelfos.js';
  import IconMic from '../atoms/IconMic.svelte';
  import IconCamera from '../atoms/IconCamera.svelte';

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
  let editingId: string | null = null;
  let editAmount = '';
  let draftInput: HTMLInputElement | undefined;

  $: total = tripTotal(trip);
  $: budget = Number(trip?.budget) || 0;
  $: pct = budget > 0 ? Math.min(100, Math.round((total / budget) * 100)) : 0;
  $: over = budget > 0 && total > budget;
  $: recent = (() => {
    trip; // recompute when the active trip refreshes
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
    const qty = Number(last.qty) || 1;
    const unitPrice = Number(last.unitPrice);
    if (!Number.isFinite(unitPrice)) return null;
    return { unitPrice, unit: last.unit || 'und', amountFor: (q: number) => Math.round(unitPrice * q) };
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
      const item = { ...parsed.item };
      if (item.amount == null) {
        const prev = lastPriceFor(item.name);
        if (prev) {
          item.amount = prev.amountFor(Number(item.qty) || 1);
          if (!item.unit || item.unit === 'und') item.unit = prev.unit;
          toast(`Sumé ${item.name} (precio de la vez pasada)`, 'success');
        } else {
          toast(`Sumé ${item.name} — toca el monto para poner precio`, 'info');
        }
      } else {
        toast(`Sumé ${item.name}`, 'success');
      }
      addItem(item);
      changed();
      return;
    }

    const matches = findItemMatches(trip.items, parsed.item.name);
    if (!matches.length) {
      toast('No está en el carrito', 'error');
      return;
    }
    if (matches.length === 1) {
      confirmPending(matches[0].id, parsed.intent, parsed);
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
    if (!speechSupported()) {
      toast('Dictado no disponible aquí — escribe', 'error');
      return;
    }
    listening = true;
    try {
      const text = await listenOnce();
      draft = text;
      await applyText(text);
      draft = '';
    } catch (e: any) {
      toast(e?.message || 'Error de micrófono', 'error');
    } finally {
      listening = false;
      queueMicrotask(() => draftInput?.focus());
    }
  }

  function confirmPending(itemId: string, kind = pending?.kind, parsed = pending?.parsed) {
    if (!kind || !parsed) return;
    if (kind === 'remove') {
      removeItem(itemId);
      toast('Quitado', 'success');
    } else {
      const patch: Record<string, unknown> = { qty: parsed.item.qty, unit: parsed.item.unit };
      if (parsed.item.amount != null) patch.amount = parsed.item.amount;
      const current = trip.items.find((i: any) => i.id === itemId);
      if (current && parsed.item.amount == null && current.amount != null && current.qty) {
        patch.amount = Math.round((Number(current.amount) / Number(current.qty)) * Number(parsed.item.qty));
      }
      updateItem(itemId, patch);
      toast('Actualizado', 'success');
    }
    pending = null;
    changed();
  }

  function quickAdd(product: any) {
    const last = (product.priceHistory || []).at(-1);
    const qty = Number(last?.qty) || 1;
    const unit = last?.unit || 'und';
    const amount =
      last?.unitPrice != null ? Math.round(Number(last.unitPrice) * qty) : last?.amount ?? null;
    addItem({
      name: product.name,
      qty,
      unit,
      amount,
      category: product.category || 'otros',
    });
    changed();
    toast(`Sumé ${product.name}`, 'success');
  }

  function startEdit(item: any) {
    editingId = item.id;
    editAmount = item.amount != null ? String(item.amount) : '';
  }

  function saveEdit() {
    if (!editingId) return;
    const n = Number(String(editAmount).replace(/\D/g, ''));
    if (!n) {
      toast('Pon un monto', 'error');
      return;
    }
    updateItem(editingId, { amount: n });
    editingId = null;
    editAmount = '';
    changed();
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
      <p class="empty-state__title">Sin mercado abierto</p>
      <p class="empty-state__text">Un toque y empiezas a sumar.</p>
      <button type="button" class="primary-button" style="margin-top:14px" on:click={newTrip}>Empezar</button>
    </div>
  </section>
{:else}
  <div class="mercado-stack mercado-trip">
    <section class="hero-card mercado-hero-compact" aria-live="polite">
      <div class="mercado-hero-compact__row">
        <div>
          <p class="hero-card__label" style="margin:0">Carrito</p>
          <p class="hero-card__amount amount" style="margin:4px 0 0">{formatCop(total)}</p>
        </div>
        <div class="mercado-hero-compact__right">
          <span class="pill">{trip.items.length} ítems</span>
          {#if budget}
            <span class="pill">{pct}%{over ? '!' : ''}</span>
          {/if}
        </div>
      </div>
      {#if budget}
        <div class="mercado-budget-bar" class:is-over={over} style="margin-top:12px">
          <span style={`width:${pct}%`}></span>
        </div>
      {/if}
    </section>

    {#if recent.length && !trip.items.length}
      <section class="mercado-chips" aria-label="Recientes">
        <p class="mercado-chips__label">De antes — un toque</p>
        <div class="mercado-chips__row">
          {#each recent as p}
            <button type="button" class="mercado-chip" on:click={() => quickAdd(p)}>{p.name}</button>
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
            <button type="button" class="secondary-button" on:click={() => confirmPending(m.id)}>
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
          <p class="empty-state__title">Vacío</p>
          <p class="empty-state__text">Dicta o escribe abajo. Ej: “papa 8 mil”.</p>
        </div>
      {:else}
        {#each [...trip.items].reverse() as item}
          {@const meta = categoryMeta(item.category)}
          <div class="mercado-item">
            <div>
              <p class="mercado-item__name">{item.name}</p>
              <p class="mercado-item__meta">{formatQty(item.qty, item.unit)} · {meta.label}</p>
            </div>
            <div class="mercado-item__right">
              {#if editingId === item.id}
                <form
                  class="mercado-inline-edit"
                  on:submit|preventDefault={saveEdit}
                >
                  <input
                    class="mercado-text-input"
                    type="text"
                    inputmode="numeric"
                    bind:value={editAmount}
                    placeholder="Monto"
                    aria-label="Monto"
                  />
                  <button type="submit" class="primary-button mercado-inline-edit__ok">OK</button>
                </form>
              {:else}
                <button
                  type="button"
                  class="mercado-item__amt-btn amount"
                  class:is-missing={item.amount == null}
                  on:click={() => startEdit(item)}
                >
                  {item.amount == null ? 'poner precio' : formatCop(item.amount)}
                </button>
                <button
                  type="button"
                  class="ghost-button mercado-item__rm"
                  on:click={() => {
                    removeItem(item.id);
                    changed();
                  }}
                >
                  Quitar
                </button>
              {/if}
            </div>
          </div>
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
        placeholder="papa 8 mil · Enter"
        enterkeyhint="done"
        autocomplete="off"
        autocorrect="on"
        on:keydown={(e) => e.key === 'Enter' && submitDraft()}
      />
      <button
        type="button"
        class="primary-button mercado-mic"
        class:is-listening={listening}
        aria-label={listening ? 'Escuchando' : 'Dictar'}
        on:click={dictate}
      >
        <IconMic size={20} />
      </button>
    </div>
  </div>
{/if}
