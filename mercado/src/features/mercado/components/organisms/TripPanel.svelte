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
    markSynced,
  } from '../../../../lib/store.js';
  import { syncTripToDelfos } from '../../../../lib/syncDelfos.js';

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

  $: total = tripTotal(trip);
  $: budget = Number(trip?.budget) || 0;
  $: pct = budget > 0 ? Math.min(100, Math.round((total / budget) * 100)) : 0;
  $: over = budget > 0 && total > budget;

  function toast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    dispatch('toast', { message, type });
  }

  function changed() {
    dispatch('change');
  }

  async function applyText(text: string) {
    const parsed = parseUtterance(text);
    if (parsed.intent === 'unknown' || parsed.confidence < 0.35) {
      toast('No entendí. Prueba: “3 libras de papa 30 mil”', 'error');
      return;
    }
    if (parsed.intent === 'checkout') {
      setCheckout({});
      changed();
      toast('Modo pago: foto de factura o total', 'info');
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
      if (parsed.item?.amount == null) {
        toast('Falta el precio. Di también el valor, ej. “30 mil”', 'error');
        return;
      }
      addItem(parsed.item);
      changed();
      toast(`Sumé ${parsed.item.name}`, 'success');
      return;
    }

    const matches = findItemMatches(trip.items, parsed.item.name);
    if (!matches.length) {
      toast('No encontré ese producto en el carrito', 'error');
      return;
    }
    pending = { kind: parsed.intent, matches, parsed };
  }

  async function submitDraft() {
    const text = draft.trim();
    if (!text) return;
    draft = '';
    await applyText(text);
  }

  async function dictate() {
    if (!speechSupported()) {
      toast('Dictado no disponible. Usa el teclado.', 'error');
      return;
    }
    listening = true;
    try {
      const text = await listenOnce();
      draft = text;
      await applyText(text);
    } catch (e: any) {
      toast(e?.message || 'Error de micrófono', 'error');
    } finally {
      listening = false;
    }
  }

  function confirmPending(itemId: string) {
    if (!pending) return;
    const { kind, parsed } = pending;
    if (kind === 'remove') {
      removeItem(itemId);
      toast('Ítem quitado', 'success');
    } else {
      const patch: Record<string, unknown> = { qty: parsed.item.qty, unit: parsed.item.unit };
      if (parsed.item.amount != null) patch.amount = parsed.item.amount;
      const current = trip.items.find((i: any) => i.id === itemId);
      if (current && parsed.item.amount == null && current.amount != null && current.qty) {
        patch.amount = Math.round((Number(current.amount) / Number(current.qty)) * Number(parsed.item.qty));
      }
      updateItem(itemId, patch);
      toast('Ítem actualizado', 'success');
    }
    pending = null;
    changed();
  }

  function onReceiptFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      receiptPreview = String(reader.result || '');
      setCheckout({ photoDataUrl: receiptPreview });
      changed();
      toast('Factura guardada', 'success');
    };
    reader.readAsDataURL(file);
  }

  function compareTicket() {
    const t = Number(String(ticketTotal).replace(/\D/g, ''));
    if (!t) {
      toast('Escribe el total de la factura', 'error');
      return;
    }
    const diff = t - total;
    setCheckout({ ticketTotal: t, notes: `diff=${diff}` });
    changed();
    if (Math.abs(diff) < 1) toast('Cuadra con la factura', 'success');
    else if (diff > 0) toast(`La factura sale ${formatCop(diff)} más cara`, 'info');
    else toast(`Calculaste ${formatCop(-diff)} de más`, 'info');
  }

  async function doSync() {
    try {
      const settings = getState().settings;
      if (!trip) throw new Error('No hay viaje');
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
    closeTrip();
    startTrip({ budget: getState().settings.budgetDefault });
    ticketTotal = '';
    receiptPreview = '';
    pending = null;
    changed();
    toast('Mercado cerrado. Nuevo viaje listo.', 'success');
  }

  function newTrip() {
    startTrip({ budget: getState().settings.budgetDefault });
    changed();
  }
</script>

{#if !trip}
  <section class="manual-card">
    <div class="empty-state">
      <div class="empty-state__icon" aria-hidden="true">◎</div>
      <p class="empty-state__title">No hay mercado activo</p>
      <p class="empty-state__text">Empieza un viaje para dictar productos y controlar el presupuesto.</p>
      <button type="button" class="primary-button" style="margin-top:14px" on:click={newTrip}>Empezar mercado</button>
    </div>
  </section>
{:else}
  <div class="mercado-stack">
    <section class="hero-card" aria-live="polite">
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
      <div class="mercado-budget-bar" class:is-over={over}><span style={`width:${pct}%`}></span></div>
    </section>

    <section class="quick-entry-card">
      <h2 class="card-title" style="margin-top:0">Dicta o escribe</h2>
      <p class="muted" style="margin:0 0 12px">
        Ej: “compré 3 libras de papa 30 mil”. Parser local — sin tokens de IA.
      </p>
      <div class="mercado-input-row">
        <input
          class="manual-form"
          style="width:100%;border:1px solid var(--border-soft);border-radius:var(--radius-sm);padding:14px 16px;background:rgba(246,247,251,0.8)"
          bind:value={draft}
          placeholder="Di o escribe el producto…"
          on:keydown={(e) => e.key === 'Enter' && submitDraft()}
        />
        <button
          type="button"
          class="primary-button mercado-mic"
          class:is-listening={listening}
          aria-label="Dictar"
          on:click={dictate}
        >
          {listening ? '…' : '🎙️'}
        </button>
      </div>
      <div class="quick-entry-card__actions">
        <button type="button" class="primary-button" on:click={submitDraft}>Agregar</button>
        <button type="button" class="secondary-button" on:click={() => (draft = '')}>Limpiar</button>
      </div>
    </section>

    {#if pending}
      <section class="manual-card mercado-confirm">
        <h2 class="card-title" style="margin-top:0">
          ¿Cuál quieres {pending.kind === 'remove' ? 'quitar' : 'cambiar'}?
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
      <h2 class="card-title" style="margin-top:0">Carrito</h2>
      {#if !trip.items.length}
        <div class="empty-state">
          <div class="empty-state__icon" aria-hidden="true">◎</div>
          <p class="empty-state__title">Aún vacío</p>
          <p class="empty-state__text">Recorre el súper y dicta lo que vas llevando.</p>
        </div>
      {:else}
        {#each [...trip.items].reverse() as item}
          {@const meta = categoryMeta(item.category)}
          <div class="mercado-item">
            <div>
              <p class="mercado-item__name">{meta.emoji} {item.name}</p>
              <p class="mercado-item__meta">{formatQty(item.qty, item.unit)} · {meta.label}</p>
            </div>
            <div>
              <p class="mercado-item__amt amount">{formatCop(item.amount)}</p>
              <button
                type="button"
                class="ghost-button"
                style="margin-top:8px;padding:6px 10px;font-size:0.78rem;color:var(--danger)"
                on:click={() => {
                  removeItem(item.id);
                  changed();
                }}
              >
                Quitar
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </section>

    <section class="manual-card">
      <h2 class="card-title" style="margin-top:0">Voy a pagar</h2>
      <p class="muted" style="margin:0 0 12px">
        Foto de la factura + total manual para contrastar (OCR con IA después).
      </p>
      <div class="manual-form mercado-stack">
        <input type="file" accept="image/*" capture="environment" on:change={onReceiptFile} />
        {#if receiptPreview || trip.receipt?.photoDataUrl}
          <img
            class="mercado-receipt-preview"
            src={receiptPreview || trip.receipt.photoDataUrl}
            alt="Factura"
          />
        {/if}
        <input type="text" bind:value={ticketTotal} placeholder="Total factura (ej. 185000)" inputmode="numeric" />
        <div class="quick-entry-card__actions">
          <button type="button" class="secondary-button" on:click={compareTicket}>Contrastar</button>
          <button type="button" class="primary-button" on:click={doSync}>Sincronizar con Delfos</button>
        </div>
        {#if trip.receipt?.ticketTotal != null}
          <p class="muted">
            Factura {formatCop(trip.receipt.ticketTotal)} vs carrito {formatCop(total)} →
            diff {formatCop(Number(trip.receipt.ticketTotal) - total)}
          </p>
        {/if}
        <button type="button" class="secondary-button" on:click={finishTrip}>Cerrar mercado</button>
      </div>
    </section>
  </div>
{/if}
