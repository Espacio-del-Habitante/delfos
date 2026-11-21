<script>
  import { parseUtterance, findItemMatches } from '../lib/parseUtterance.js';
  import { speechSupported, listenOnce } from '../lib/speech.js';
  import { formatCop, formatQty } from '../lib/format.js';
  import { categoryMeta } from '../lib/categories.js';
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
  } from '../lib/store.js';
  import { syncTripToDelfos } from '../lib/syncDelfos.js';

  let { trip = null, onToast = () => {}, onChange = () => {} } = $props();

  let draft = $state('');
  let listening = $state(false);
  let pending = $state(null); // { kind, matches, parsed }
  let ticketTotal = $state('');
  let receiptPreview = $state('');

  const total = $derived(tripTotal(trip));
  const budget = $derived(Number(trip?.budget) || 0);
  const pct = $derived(budget > 0 ? Math.min(100, Math.round((total / budget) * 100)) : 0);
  const over = $derived(budget > 0 && total > budget);

  async function applyText(text) {
    const parsed = parseUtterance(text);
    if (parsed.intent === 'unknown' || parsed.confidence < 0.35) {
      onToast('No entendí. Prueba: “3 libras de papa 30 mil”');
      return;
    }
    if (parsed.intent === 'checkout') {
      setCheckout({});
      onChange();
      onToast('Modo pago: toma foto de la factura o escribe el total');
      return;
    }
    if (parsed.intent === 'sync') {
      await doSync();
      return;
    }
    if (!trip || trip.status === 'closed') {
      onToast('Abre un mercado primero');
      return;
    }

    if (parsed.intent === 'add') {
      if (parsed.item.amount == null) {
        onToast('Falta el precio. Di también el valor, ej. “30 mil”');
        return;
      }
      addItem(parsed.item);
      onChange();
      onToast(`Sumé ${parsed.item.name}`);
      return;
    }

    const matches = findItemMatches(trip.items, parsed.item.name);
    if (!matches.length) {
      onToast('No encontré ese producto en el carrito');
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
      onToast('Dictado no disponible aquí. Usa el teclado.');
      return;
    }
    listening = true;
    try {
      const text = await listenOnce();
      draft = text;
      await applyText(text);
    } catch (e) {
      onToast(e.message || 'Error de micrófono');
    } finally {
      listening = false;
    }
  }

  function confirmPending(itemId) {
    if (!pending) return;
    const { kind, parsed } = pending;
    if (kind === 'remove') {
      removeItem(itemId);
      onToast('Ítem quitado');
    } else {
      const patch = { qty: parsed.item.qty, unit: parsed.item.unit };
      if (parsed.item.amount != null) patch.amount = parsed.item.amount;
      // If only qty changed and amount existed, scale amount proportionally.
      const current = trip.items.find((i) => i.id === itemId);
      if (current && parsed.item.amount == null && current.amount != null && current.qty) {
        patch.amount = Math.round((Number(current.amount) / Number(current.qty)) * Number(parsed.item.qty));
      }
      updateItem(itemId, patch);
      onToast('Ítem actualizado');
    }
    pending = null;
    onChange();
  }

  function onReceiptFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      receiptPreview = String(reader.result || '');
      setCheckout({ photoDataUrl: receiptPreview });
      onChange();
      onToast('Factura guardada en el viaje');
    };
    reader.readAsDataURL(file);
  }

  function compareTicket() {
    const t = Number(String(ticketTotal).replace(/\D/g, ''));
    if (!t) {
      onToast('Escribe el total de la factura');
      return;
    }
    const calc = total;
    const diff = t - calc;
    setCheckout({ ticketTotal: t, notes: `diff=${diff}` });
    onChange();
    if (Math.abs(diff) < 1) onToast('Cuadra con la factura ✓');
    else if (diff > 0) onToast(`La factura sale ${formatCop(diff)} más cara`);
    else onToast(`Calculaste ${formatCop(-diff)} de más`);
  }

  async function doSync() {
    try {
      const settings = getState().settings;
      const target = trip;
      if (!target) throw new Error('No hay viaje');
      const res = await syncTripToDelfos(target, settings);
      markSynced(target.id, {
        at: new Date().toISOString(),
        ok: true,
        expenseId: res.expense?.id || null,
      });
      onChange();
      onToast('Sincronizado con Delfos');
    } catch (e) {
      if (trip) {
        markSynced(trip.id, { at: new Date().toISOString(), ok: false, error: e.message });
        onChange();
      }
      onToast(e.message || 'No se pudo sincronizar');
    }
  }

  function finishTrip() {
    closeTrip();
    startTrip({ budget: getState().settings.budgetDefault });
    ticketTotal = '';
    receiptPreview = '';
    pending = null;
    onChange();
    onToast('Mercado cerrado. Nuevo viaje listo.');
  }

  function newTrip() {
    startTrip({ budget: getState().settings.budgetDefault });
    onChange();
  }
</script>

{#if !trip}
  <div class="card empty">
    <p>No hay mercado activo.</p>
    <button class="btn btn--block" onclick={newTrip}>Empezar mercado</button>
  </div>
{:else}
  <section class="hero" aria-live="polite">
    <div class="hero__label">Total del carrito</div>
    <div class="hero__total">{formatCop(total)}</div>
    <div class="hero__meta">
      <span class="pill">Presupuesto {formatCop(budget)}</span>
      <span class="pill" class:pill--warn={over}>{pct}% usado</span>
      <span class="pill">{trip.items.length} ítems</span>
    </div>
    <div class="bar" class:is-over={over}><span style={`width:${pct}%`}></span></div>
  </section>

  <section class="card">
    <h2>Dicta o escribe</h2>
    <p class="muted">Ej: “compré 3 libras de papa 30 mil”. Sin IA: parser local.</p>
    <div class="row" style="margin-top:10px">
      <input
        class="input"
        bind:value={draft}
        placeholder="Di o escribe el producto…"
        onkeydown={(e) => e.key === 'Enter' && submitDraft()}
      />
      <button class="btn btn--mic" class:is-listening={listening} onclick={dictate} aria-label="Dictar">
        {listening ? '…' : '🎙️'}
      </button>
    </div>
    <button class="btn btn--ghost btn--block" style="margin-top:8px" onclick={submitDraft}>Agregar</button>
  </section>

  {#if pending}
    <section class="card confirm">
      <h2>¿Cuál quieres {pending.kind === 'remove' ? 'quitar' : 'cambiar'}?</h2>
      {#each pending.matches as m}
        <button class="btn btn--ghost btn--block" style="margin-bottom:6px" onclick={() => confirmPending(m.id)}>
          {m.name} · {formatQty(m.qty, m.unit)} · {formatCop(m.amount)}
        </button>
      {/each}
      <button class="btn btn--danger btn--block" onclick={() => (pending = null)}>Cancelar</button>
    </section>
  {/if}

  <section class="card">
    <h2>Carrito</h2>
    {#if !trip.items.length}
      <div class="empty">Empieza a recorrer el súper y dicta lo que llevas.</div>
    {:else}
      {#each [...trip.items].reverse() as item}
        {@const meta = categoryMeta(item.category)}
        <div class="item">
          <div>
            <div class="item__name">{meta.emoji} {item.name}</div>
            <div class="item__meta">{formatQty(item.qty, item.unit)} · {meta.label}</div>
          </div>
          <div>
            <div class="item__amt">{formatCop(item.amount)}</div>
            <button class="btn btn--danger" style="padding:6px 10px;margin-top:6px;font-size:0.75rem" onclick={() => { removeItem(item.id); onChange(); }}>Quitar</button>
          </div>
        </div>
      {/each}
    {/if}
  </section>

  <section class="card stack">
    <h2>Voy a pagar</h2>
    <p class="muted">Toma foto de la factura y escribe el total para contrastar (sin OCR caro aún).</p>
    <input class="input" type="file" accept="image/*" capture="environment" onchange={onReceiptFile} />
    {#if receiptPreview || trip.receipt?.photoDataUrl}
      <img src={receiptPreview || trip.receipt.photoDataUrl} alt="Factura" style="width:100%;border-radius:14px;max-height:220px;object-fit:cover" />
    {/if}
    <input class="input" bind:value={ticketTotal} placeholder="Total factura (ej. 185000)" inputmode="numeric" />
    <button class="btn btn--ghost btn--block" onclick={compareTicket}>Contrastar con carrito</button>
    {#if trip.receipt?.ticketTotal != null}
      <p class="muted">
        Factura {formatCop(trip.receipt.ticketTotal)} vs carrito {formatCop(total)}
        → diferencia {formatCop(Number(trip.receipt.ticketTotal) - total)}
      </p>
    {/if}
    <button class="btn btn--block" onclick={doSync}>Sincronizar con Delfos</button>
    <button class="btn btn--ghost btn--block" onclick={finishTrip}>Cerrar mercado</button>
  </section>
{/if}
