<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import HeaderIsland from '@common/molecules/HeaderIsland.svelte';
  import BottomNav from '@common/molecules/BottomNav.svelte';
  import SkeletonLayout from '@common/molecules/SkeletonLayout.svelte';
  import Modal from '@common/atoms/Modal.svelte';
  import IconChevron from '@common/atoms/icons/IconChevron.svelte';
  import {
    ApiError,
    applyAssistantAccountSuggestion,
    applyAssistantProfileSuggestion,
    confirmAnalysis,
    createAssistantThread,
    deleteAssistantMemoryFact,
    ensureAssistantThread,
    getAssistantMemory,
    getAssistantMessages,
    listAssistantThreads,
    sendAssistantChat,
    setAssistantMemoryFactActive,
  } from '@common/lib/api';
  import { applyFinancePayload, finance, refreshFinanceData } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import type {
    AccountDraft,
    AnalysisPreview,
    ChatMessage,
    ChatThread,
    FinancialProfilePatch,
    FixedExpenseItem,
    MemoryFact,
    PreviewItem,
  } from '@common/lib/types';

  const THREAD_KEY = 'delfos_active_thread_id';

  let threadId: string | null = null;
  let threadTitle = 'Conversación';
  let threads: ChatThread[] = [];
  let messages: ChatMessage[] = [];
  let followUps: string[] = [];
  let profileSuggestion: FinancialProfilePatch | null = null;
  let movementItemsEditable: PreviewItem[] = [];
  let accountDraft: AccountDraft | null = null;
  let draft = '';
  let loading = true;
  let sending = false;
  let applyingProfile = false;
  let applyingMovements = false;
  let applyingAccount = false;
  type SheetView = null | 'menu' | 'threads' | 'memory';
  let sheet: SheetView = null;
  let memorySummary: string | null = null;
  let memoryFacts: MemoryFact[] = [];
  let memoryLoading = false;

  $: sheetTitle =
    sheet === 'threads' ? 'Conversaciones' : sheet === 'memory' ? 'Memoria compartida' : 'Asistente';
  $: sheetOpen = sheet != null;
  let scroller: HTMLElement | undefined;
  let inputEl: HTMLTextAreaElement | undefined;
  let composerFocused = false;
  /** Pixels the software keyboard covers at the bottom of the layout viewport. */
  let kbInset = 0;
  let blurTimer: ReturnType<typeof setTimeout> | null = null;

  $: typing = composerFocused && kbInset > 48;

  const starters = [
    'Gasté 12 mil en café, 45 mil en almuerzo y 18 mil en Uber',
    'Me pagaron 2 millones de freelance',
    '¿Cuánto gasté en Uber este mes?',
    'Crea una cuenta Nequi en COP',
  ];

  const kindLabels: Record<string, string> = {
    expense: 'Gasto',
    income: 'Ingreso',
    investment: 'Inversión',
    note: 'Nota',
  };

  const accountTypeLabels: Record<string, string> = {
    cash: 'Efectivo',
    bank: 'Banco',
    credit_card: 'Tarjeta crédito',
    debit_card: 'Tarjeta débito',
    wallet: 'Billetera',
    broker: 'Broker',
    crypto: 'Cripto',
    savings: 'Ahorros',
    other: 'Otro',
  };

  const SUMMARIZE_CMD = '/sumarize';
  const SUMMARIZE_HINT_MIN = 10;

  const patchLabels: Record<string, string> = {
    monthly_income_fixed: 'Ingreso fijo',
    monthly_income_variable_avg: 'Ingreso variable',
    monthly_fixed_expenses: 'Gastos fijos (total)',
    savings_target_percent: 'Meta de ahorro %',
    investment_target_percent: 'Meta de inversión %',
    cushion_percent: 'Colchón %',
    emergency_fund_target_months: 'Meses de emergencia',
    pay_frequency: 'Frecuencia de pago',
    income_payday_day: 'Día de pago',
    income_payday_weekday: 'Día de cobro (semana)',
    risk_profile: 'Perfil de riesgo',
    investment_horizon: 'Horizonte',
    fiscal_country: 'País fiscal',
    priorities: 'Prioridades',
  };

  function suggestionFromMessage(m?: ChatMessage | null): FinancialProfilePatch | null {
    const s = m?.meta?.profile_suggestion;
    if (!s || typeof s !== 'object' || !Object.keys(s).length) return null;
    return s;
  }

  function movementFromMessage(m?: ChatMessage | null): AnalysisPreview | null {
    const d = m?.meta?.movement_draft;
    if (!d || typeof d !== 'object') return null;
    if (!d.items?.length && !(d.expenses?.length || d.incomes?.length || d.investments?.length)) {
      return null;
    }
    return d;
  }

  function accountFromMessage(m?: ChatMessage | null): AccountDraft | null {
    const d = m?.meta?.account_draft;
    if (!d || typeof d !== 'object' || !d.name) return null;
    return d;
  }

  function movementItems(d: AnalysisPreview | null): PreviewItem[] {
    if (!d) return [];
    if (d.items?.length) return d.items;
    return [
      ...(d.expenses || []),
      ...(d.incomes || []),
      ...(d.investments || []),
      ...(d.notes || []),
    ];
  }

  function setMovementDraft(d: AnalysisPreview | null) {
    movementItemsEditable = d ? movementItems(d).map((item) => ({ ...item })) : [];
  }

  function formatMovementLine(item: PreviewItem): string {
    const kind = kindLabels[item.kind] || item.kind;
    if (item.kind === 'note') {
      return `${kind}: ${item.text || item.description || '—'}`;
    }
    const amount = item.amount != null ? `${item.amount} ${item.currency || ''}`.trim() : '—';
    const label =
      item.kind === 'investment'
        ? item.asset || item.description || 'Activo'
        : item.description || item.category || 'Movimiento';
    return `${kind}: ${label} · ${amount}`;
  }

  function removeMovementAt(index: number) {
    movementItemsEditable = movementItemsEditable.filter((_, i) => i !== index);
  }

  function movementCounts(items: PreviewItem[]) {
    const c = { expense: 0, income: 0, investment: 0, note: 0 };
    for (const item of items) {
      if (item.kind in c) c[item.kind as keyof typeof c] += 1;
    }
    return c;
  }

  function formatSuggestionLines(s: FinancialProfilePatch): string[] {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(s)) {
      if (key === 'fixed_expenses' && Array.isArray(value)) {
        const items = value as FixedExpenseItem[];
        if (!items.length) continue;
        lines.push(
          `Fijos: ${items.map((x) => `${x.label} ${x.amount}`).join(' · ')}`,
        );
        continue;
      }
      const label = patchLabels[key] || key;
      if (Array.isArray(value)) {
        lines.push(`${label}: ${value.join(', ')}`);
      } else {
        lines.push(`${label}: ${value}`);
      }
    }
    return lines;
  }

  function rememberThread(id: string) {
    try {
      localStorage.setItem(THREAD_KEY, id);
    } catch {
      /* ignore */
    }
  }

  function applyThreadState(msgs: ChatMessage[]) {
    messages = msgs;
    const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
    followUps = lastAssistant?.meta?.follow_ups?.length ? lastAssistant.meta.follow_ups : [];
    profileSuggestion = suggestionFromMessage(lastAssistant);
    setMovementDraft(movementFromMessage(lastAssistant));
    accountDraft = accountFromMessage(lastAssistant);
  }

  async function refreshThreads() {
    const data = await listAssistantThreads();
    threads = data.threads || [];
  }

  async function openThread(thread: ChatThread) {
    threadId = thread.id;
    threadTitle = thread.title || 'Conversación';
    rememberThread(thread.id);
    loading = true;
    sheet = null;
    try {
      const { messages: msgs } = await getAssistantMessages(thread.id);
      applyThreadState(msgs);
      await scrollBottom();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo abrir el chat', {
        type: 'error',
      });
    } finally {
      loading = false;
      await tick();
      inputEl?.focus();
    }
  }

  async function startNewChat() {
    try {
      const { thread } = await createAssistantThread();
      await refreshThreads();
      await openThread(thread);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo crear el chat', {
        type: 'error',
      });
    }
  }

  async function openMemoryPanel() {
    sheet = 'memory';
    memoryLoading = true;
    try {
      const data = await getAssistantMemory();
      memorySummary = data.summary || null;
      memoryFacts = data.facts || [];
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo cargar la memoria', {
        type: 'error',
      });
    } finally {
      memoryLoading = false;
    }
  }

  async function openThreadsPanel() {
    try {
      await refreshThreads();
    } catch {
      /* ignore */
    }
    sheet = 'threads';
  }

  async function startNewChatFromHeader() {
    sheet = null;
    await startNewChat();
  }

  async function deactivateFact(id: string) {
    try {
      const data = await setAssistantMemoryFactActive(id, false);
      memorySummary = data.summary || null;
      memoryFacts = data.facts || [];
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo desactivar', { type: 'error' });
    }
  }

  async function removeFact(id: string) {
    try {
      const data = await deleteAssistantMemoryFact(id);
      memorySummary = data.summary || null;
      memoryFacts = data.facts || [];
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo borrar', { type: 'error' });
    }
  }

  function syncKeyboardInset() {
    if (typeof window === 'undefined') {
      kbInset = 0;
      return;
    }
    const vv = window.visualViewport;
    if (!vv) {
      kbInset = 0;
      return;
    }
    // Gap between layout bottom and visual viewport bottom (keyboard / browser chrome).
    kbInset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  }

  function onComposerFocus() {
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }
    composerFocused = true;
    syncKeyboardInset();
    void tick().then(() => {
      resizeComposer();
      void scrollBottom();
    });
  }

  function onComposerBlur() {
    // Delay so tapping Enviar doesn't flash the nav back mid-click.
    blurTimer = setTimeout(() => {
      composerFocused = false;
      blurTimer = null;
    }, 180);
  }

  function resizeComposer() {
    if (!inputEl) return;
    inputEl.style.height = 'auto';
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 120)}px`;
  }

  onMount(async () => {
    syncKeyboardInset();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', syncKeyboardInset);
    vv?.addEventListener('scroll', syncKeyboardInset);
    window.addEventListener('resize', syncKeyboardInset);

    try {
      await refreshFinanceData().catch(() => undefined);
      await refreshThreads();
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(THREAD_KEY);
      } catch {
        saved = null;
      }
      const existing = saved ? threads.find((t) => t.id === saved) : null;
      if (existing) {
        await openThread(existing);
      } else {
        const { thread } = await ensureAssistantThread();
        await refreshThreads();
        await openThread(thread);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo abrir el chat', {
        type: 'error',
      });
      loading = false;
    }
  });

  onDestroy(() => {
    if (blurTimer) clearTimeout(blurTimer);
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    vv?.removeEventListener('resize', syncKeyboardInset);
    vv?.removeEventListener('scroll', syncKeyboardInset);
    window.removeEventListener('resize', syncKeyboardInset);
  });

  async function scrollBottom() {
    await tick();
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  async function send(text?: string) {
    const content = String(text ?? draft).trim();
    if (!content || sending) return;
    sending = true;
    draft = '';
    followUps = [];
    profileSuggestion = null;
    setMovementDraft(null);
    accountDraft = null;

    const optimistic: ChatMessage = {
      id: `local_${Date.now()}`,
      thread_id: threadId || 'pending',
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    messages = [...messages, optimistic];
    await scrollBottom();

    try {
      const res = await sendAssistantChat(content, threadId);
      threadId = res.thread?.id || threadId;
      if (res.thread?.title) threadTitle = res.thread.title;
      rememberThread(threadId || '');
      void refreshThreads().catch(() => undefined);
      if (res.messages?.length) {
        messages = res.messages;
      } else if (res.assistant_message) {
        messages = [
          ...messages.filter((m) => m.id !== optimistic.id),
          { ...optimistic, id: optimistic.id.replace('local_', 'user_') },
          res.assistant_message,
        ];
      }
      followUps = res.follow_ups?.length ? res.follow_ups : [];
      profileSuggestion =
        res.profile_suggestion && Object.keys(res.profile_suggestion).length
          ? res.profile_suggestion
          : suggestionFromMessage(res.assistant_message);
      const nextMov =
        res.movement_draft && movementItems(res.movement_draft).length
          ? res.movement_draft
          : movementFromMessage(res.assistant_message);
      setMovementDraft(nextMov);
      accountDraft =
        res.account_draft && res.account_draft.name
          ? res.account_draft
          : accountFromMessage(res.assistant_message);
      if (res.summarized) {
        showToast(
          res.compacted_count
            ? `Contexto aligerado: ${res.compacted_count} mensajes condensados`
            : 'Contexto aligerado',
          { type: 'success' },
        );
      }
      if (res.ai_available === false) {
        showToast(res.error || 'IA no disponible', { type: 'error' });
      }
    } catch (err) {
      messages = messages.filter((m) => m.id !== optimistic.id);
      draft = content;
      const msg =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Error al enviar';
      showToast(msg, { type: 'error' });
    } finally {
      sending = false;
      await scrollBottom();
      inputEl?.focus();
    }
  }

  async function confirmProfile() {
    if (!profileSuggestion || applyingProfile) return;
    applyingProfile = true;
    try {
      await applyAssistantProfileSuggestion(profileSuggestion);
      profileSuggestion = null;
      await refreshFinanceData().catch(() => undefined);
      showToast('Perfil actualizado', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar', { type: 'error' });
    } finally {
      applyingProfile = false;
    }
  }

  function dismissProfile() {
    profileSuggestion = null;
  }

  async function confirmMovements() {
    const items = movementItemsEditable;
    if (!items.length || applyingMovements) return;
    applyingMovements = true;
    try {
      await confirmAnalysis({ items });
      setMovementDraft(null);
      await refreshFinanceData().catch(() => undefined);
      showToast(
        items.length === 1 ? 'Movimiento guardado' : `${items.length} movimientos guardados`,
        { type: 'success' },
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar', { type: 'error' });
    } finally {
      applyingMovements = false;
    }
  }

  function dismissMovements() {
    setMovementDraft(null);
  }

  async function confirmAccount() {
    if (!accountDraft || applyingAccount) return;
    applyingAccount = true;
    try {
      const data = await applyAssistantAccountSuggestion(accountDraft);
      accountDraft = null;
      applyFinancePayload(data);
      showToast(`Cuenta ${data.account ? 'creada' : 'guardada'}`, { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo crear la cuenta', {
        type: 'error',
      });
    } finally {
      applyingAccount = false;
    }
  }

  function dismissAccount() {
    accountDraft = null;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  $: empty = !loading && messages.length === 0;
  $: suggestionLines = profileSuggestion ? formatSuggestionLines(profileSuggestion) : [];
  $: movCounts = movementCounts(movementItemsEditable);
  $: movementTitle =
    movementItemsEditable.length <= 1
      ? '¿Registrar en mis movimientos?'
      : `¿Registrar ${movementItemsEditable.length} movimientos?`;
  $: canSummarize = !loading && messages.length >= SUMMARIZE_HINT_MIN;
</script>

<div
  class="app-shell chat-shell"
  class:is-typing={typing}
  style={`--kb-inset: ${kbInset}px`}
>
  <HeaderIsland
    summary={$finance?.summary ?? null}
    kpis={$finance?.assistant_kpis ?? null}
  />

  <header class="chat-head">
    <div class="hero-titlebar">
      <a href="/" class="hero-back" aria-label="Volver al inicio"><IconChevron size={24} direction="left" /></a>
      <div class="chat-head__titles">
        <h1>Delfos</h1>
        <p title={threadTitle}>{threadTitle}</p>
      </div>
    </div>
    <div class="chat-head__actions">
      <button type="button" class="chat-head__btn chat-head__btn--primary" on:click={startNewChatFromHeader}>
        Nuevo
      </button>
      <button
        type="button"
        class="chat-head__btn"
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        on:click={() => (sheet = 'menu')}
      >
        Más
      </button>
    </div>
  </header>

  <div class="chat-panel" bind:this={scroller} aria-live="polite">
    {#if loading}
      <SkeletonLayout variant="chat" />
    {:else if empty}
      <div class="welcome">
        <p class="welcome__title">¿En qué te ayudo?</p>
        <p class="welcome__hint">
          Pregunta por metas, ahorro o gastos. Cada chat tiene su historial; la memoria
          compartida viaja entre conversaciones. Si el hilo crece, /sumarize.
        </p>
        <div class="chips">
          {#each starters as s}
            <button type="button" class="chip" disabled={sending} on:click={() => send(s)}>
              {s}
            </button>
          {/each}
        </div>
      </div>
    {:else}
      <ul class="bubbles">
        {#each messages as m (m.id)}
          <li class="bubble" class:bubble--user={m.role === 'user'} class:bubble--ai={m.role === 'assistant'}>
            <p>{m.content}</p>
          </li>
        {/each}
        {#if sending}
          <li class="bubble bubble--ai bubble--typing" aria-label="Escribiendo">
            <span></span><span></span><span></span>
          </li>
        {/if}
      </ul>
    {/if}
  </div>

  {#if (followUps.length || canSummarize) && !sending}
    <div class="chips chips--follow" aria-label="Sugerencias">
      {#if canSummarize}
        <button
          type="button"
          class="chip chip--cmd"
          title="Condensa historial viejo y deja el chat liviano"
          on:click={() => send(SUMMARIZE_CMD)}
        >
          /sumarize
        </button>
      {/if}
      {#each followUps as s}
        <button type="button" class="chip" on:click={() => send(s)}>{s}</button>
      {/each}
    </div>
  {/if}

  {#if movementItemsEditable.length && !sending}
    <aside class="profile-card" aria-label="Registrar movimientos">
      <div class="profile-card__body">
        <p class="profile-card__title">{movementTitle}</p>
        <p class="profile-card__hint">
          Puedes quitar ítems antes de confirmar. Quedará en tu historial y saldos.
        </p>
        {#if movementItemsEditable.length > 1}
          <p class="profile-card__meta">
            {#if movCounts.expense}{movCounts.expense} gasto{movCounts.expense === 1 ? '' : 's'}{/if}
            {#if movCounts.income}
              {movCounts.expense ? ' · ' : ''}{movCounts.income} ingreso{movCounts.income === 1
                ? ''
                : 's'}{/if}
            {#if movCounts.investment}
              {movCounts.expense || movCounts.income ? ' · ' : ''}{movCounts.investment} inversión{movCounts.investment ===
              1
                ? ''
                : 'es'}{/if}
            {#if movCounts.note}
              {movCounts.expense || movCounts.income || movCounts.investment ? ' · ' : ''}{movCounts.note}
              nota{movCounts.note === 1 ? '' : 's'}{/if}
          </p>
        {/if}
        <ul class="profile-card__editable">
          {#each movementItemsEditable as item, i}
            <li>
              <span>{formatMovementLine(item)}</span>
              <button
                type="button"
                class="pill-remove"
                disabled={applyingMovements}
                aria-label="Quitar"
                on:click={() => removeMovementAt(i)}
              >
                ×
              </button>
            </li>
          {/each}
        </ul>
      </div>
      <div class="profile-card__actions">
        <button type="button" class="chip" disabled={applyingMovements} on:click={dismissMovements}>
          Ahora no
        </button>
        <button
          type="button"
          class="chip chip--solid"
          disabled={applyingMovements || !movementItemsEditable.length}
          on:click={confirmMovements}
        >
          {applyingMovements
            ? 'Guardando…'
            : movementItemsEditable.length > 1
              ? `Registrar ${movementItemsEditable.length}`
              : 'Registrar'}
        </button>
      </div>
    </aside>
  {/if}

  {#if accountDraft && !sending}
    <aside class="profile-card" aria-label="Crear cuenta">
      <div class="profile-card__body">
        <p class="profile-card__title">¿Crear esta cuenta?</p>
        <p class="profile-card__hint">Quedará disponible para asociar gastos e ingresos.</p>
        <ul class="profile-card__list">
          <li>
            {accountDraft.emoji || '💰'}
            {accountDraft.name}
          </li>
          <li>
            {accountTypeLabels[accountDraft.type] || accountDraft.type}
            · {accountDraft.currency}
          </li>
          {#if accountDraft.initial_balance}
            <li>Saldo inicial: {accountDraft.initial_balance}</li>
          {/if}
        </ul>
      </div>
      <div class="profile-card__actions">
        <button type="button" class="chip" disabled={applyingAccount} on:click={dismissAccount}>
          Ahora no
        </button>
        <button
          type="button"
          class="chip chip--solid"
          disabled={applyingAccount}
          on:click={confirmAccount}
        >
          {applyingAccount ? 'Creando…' : 'Crear cuenta'}
        </button>
      </div>
    </aside>
  {/if}

  {#if profileSuggestion && suggestionLines.length && !sending}
    <aside class="profile-card" aria-label="Actualizar perfil">
      <div class="profile-card__body">
        <p class="profile-card__title">¿Guardar en mi perfil?</p>
        <p class="profile-card__hint">Así Delfos lo usa como contexto en las próximas charlas.</p>
        <ul class="profile-card__list">
          {#each suggestionLines as line}
            <li>{line}</li>
          {/each}
        </ul>
      </div>
      <div class="profile-card__actions">
        <button type="button" class="chip" disabled={applyingProfile} on:click={dismissProfile}>
          Ahora no
        </button>
        <button
          type="button"
          class="chip chip--solid"
          disabled={applyingProfile}
          on:click={confirmProfile}
        >
          {applyingProfile ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </aside>
  {/if}

  <form
    class="composer"
    on:submit|preventDefault={() => send()}
    aria-label="Escribir mensaje"
  >
    <textarea
      bind:this={inputEl}
      bind:value={draft}
      rows="1"
      placeholder="Cuéntame… /buscar Uber · /sumarize"
      disabled={sending || loading}
      on:keydown={onKeydown}
      on:focus={onComposerFocus}
      on:blur={onComposerBlur}
      on:input={resizeComposer}
    ></textarea>
    <button type="submit" class="send" disabled={sending || loading || !draft.trim()} aria-label="Enviar">
      ↑
    </button>
  </form>

  <Modal open={sheetOpen} title={sheetTitle} narrow onClose={() => (sheet = null)}>
    <div class="sheet-stack">
      {#if sheet === 'menu'}
        <button type="button" class="sheet-nav" on:click={openThreadsPanel}>
          <span class="sheet-nav__title">Conversaciones</span>
          <span class="sheet-nav__hint">Cambiar de chat sin mezclar contextos</span>
        </button>
        <button type="button" class="sheet-nav" on:click={openMemoryPanel}>
          <span class="sheet-nav__title">Memoria compartida</span>
          <span class="sheet-nav__hint">Hechos que viajan entre todos los chats</span>
        </button>
        <a class="sheet-nav sheet-nav--link" href="/perfil" on:click={() => (sheet = null)}>
          <span class="sheet-nav__title">Perfil financiero</span>
          <span class="sheet-nav__hint">Ingresos, colchón y metas</span>
        </a>
      {:else if sheet === 'threads'}
        <button type="button" class="chip sheet-back" on:click={() => (sheet = 'menu')}>← Menú</button>
        <button type="button" class="primary-button sheet-stack__cta" on:click={startNewChat}>
          Nuevo chat
        </button>
        <ul class="sheet-list">
          {#each threads as t (t.id)}
            <li>
              <button
                type="button"
                class="sheet-list__item"
                class:is-active={t.id === threadId}
                on:click={() => openThread(t)}
              >
                <span class="sheet-list__title">{t.title || 'Conversación'}</span>
                <span class="sheet-list__meta">{t.kind === 'main' ? 'Principal' : 'Chat'}</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else if sheet === 'memory'}
        <button type="button" class="chip sheet-back" on:click={() => (sheet = 'menu')}>← Menú</button>
        <p class="sheet-hint">
          Hechos y resumen que Delfos reutiliza en todos tus chats. No reenvía el historial completo.
        </p>
        {#if memoryLoading}
          <SkeletonLayout variant="movements" />
        {:else}
          {#if memorySummary}
            <div class="memory-summary">
              <p class="memory-summary__label">Resumen</p>
              <p>{memorySummary}</p>
            </div>
          {/if}
          {#if memoryFacts.length}
            <ul class="sheet-list">
              {#each memoryFacts as fact (fact.id)}
                <li class="memory-fact">
                  <p class="memory-fact__text">{fact.fact}</p>
                  <div class="memory-fact__actions">
                    <button type="button" class="chip" on:click={() => deactivateFact(fact.id)}>
                      Desactivar
                    </button>
                    <button type="button" class="chip" on:click={() => removeFact(fact.id)}>Borrar</button>
                  </div>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="muted">Todavía no hay hechos guardados. Aparecerán al conversar.</p>
          {/if}
        {/if}
      {/if}
    </div>
  </Modal>

  <BottomNav active="chat" />
</div>

<style>
  .chat-shell {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    /* BottomNav (~56) + safe area; composer is sticky inside the flow */
    padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
  }

  @media (min-width: 861px) {
    .chat-shell {
      padding-bottom: 24px;
    }
  }

  .chat-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.85rem;
    margin: 0.35rem 0 1rem;
  }

  .chat-head :global(.hero-titlebar) {
    min-width: 0;
    flex: 1;
    gap: 0.35rem;
  }

  .chat-head__titles {
    min-width: 0;
  }

  .chat-head h1 {
    margin: 0;
    font-size: 1.28rem;
    letter-spacing: -0.02em;
  }

  .chat-head p {
    margin: 0.25rem 0 0;
    color: var(--text-muted);
    font-size: 0.84rem;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-head__actions {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-shrink: 0;
  }

  .chat-head__btn {
    min-height: 40px;
    padding: 0.45rem 0.9rem;
    border-radius: 999px;
    border: 1px solid var(--border-soft);
    background: var(--surface);
    color: var(--text-strong);
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 140ms var(--ease-out);
  }

  .chat-head__btn--primary {
    background: var(--text-strong);
    color: #fff;
    border-color: transparent;
  }

  .chat-head__btn:active {
    transform: scale(0.97);
  }

  .sheet-stack {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    padding-bottom: 0.35rem;
  }

  .sheet-stack__cta {
    width: 100%;
    min-height: 44px;
  }

  .sheet-back {
    align-self: flex-start;
  }

  .sheet-nav {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    width: 100%;
    text-align: left;
    padding: 0.95rem 1rem;
    border-radius: var(--radius-md, 14px);
    border: 1px solid var(--border-soft);
    background: var(--surface);
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-decoration: none;
    transition: transform 140ms var(--ease-out);
  }

  .sheet-nav--link {
    display: flex;
  }

  .sheet-nav:active {
    transform: scale(0.98);
  }

  .sheet-nav__title {
    font-weight: 700;
    font-size: 0.95rem;
  }

  .sheet-nav__hint {
    font-size: 0.8rem;
    color: var(--text-muted);
    line-height: 1.35;
  }

  .sheet-hint {
    margin: 0;
    font-size: 0.9rem;
    color: var(--text-muted);
    line-height: 1.45;
  }

  .sheet-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    max-height: min(52dvh, 380px);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .sheet-list__item {
    width: 100%;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.75rem 0.85rem;
    border-radius: var(--radius-md, 14px);
    border: 1px solid var(--border-soft);
    background: var(--surface);
    cursor: pointer;
    transition: transform 140ms var(--ease-out);
  }

  .sheet-list__item.is-active {
    border-color: color-mix(in srgb, var(--primary) 45%, var(--border-soft));
    background: color-mix(in srgb, var(--primary) 8%, var(--surface));
  }

  .sheet-list__item:active {
    transform: scale(0.98);
  }

  .sheet-list__title {
    font-weight: 700;
    font-size: 0.92rem;
  }

  .sheet-list__meta {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .memory-summary {
    padding: 0.75rem 0.85rem;
    border-radius: var(--radius-md, 14px);
    background: color-mix(in srgb, var(--soft-blue) 35%, var(--surface));
    border: 1px solid var(--border-soft);
  }

  .memory-summary__label {
    margin: 0 0 0.35rem;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .memory-summary p:last-child {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .memory-fact {
    padding: 0.75rem 0.85rem;
    border-radius: var(--radius-md, 14px);
    border: 1px solid var(--border-soft);
    background: var(--surface);
  }

  .memory-fact__text {
    margin: 0 0 0.55rem;
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .memory-fact__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .chat-panel {
    flex: 1 1 auto;
    min-height: 0;
    /* Fill leftover viewport instead of fragile 100vh - Npx math */
    max-height: none;
    overflow-y: auto;
    padding: 8px 4px 16px;
    -webkit-overflow-scrolling: touch;
  }

  .center {
    text-align: center;
    padding: 2.5rem 0;
  }

  .welcome {
    padding: 1.75rem 0.35rem 1rem;
  }

  .welcome__title {
    margin: 0 0 0.55rem;
    font-size: 1.28rem;
    font-weight: 700;
  }

  .welcome__hint {
    margin: 0 0 1.25rem;
    color: var(--text-muted);
    font-size: 0.92rem;
    line-height: 1.5;
    max-width: 34ch;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .chips--follow {
    margin: 0 0 14px;
  }

  .chip {
    border: 1px solid var(--border-soft);
    background: var(--surface);
    border-radius: 999px;
    padding: 0.5rem 0.85rem;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-strong);
    cursor: pointer;
    text-align: left;
    box-shadow: var(--shadow-soft);
    transition: transform 140ms var(--ease-out);
  }

  .chip--solid {
    background: var(--text-strong);
    color: #fff;
    border-color: transparent;
  }

  .chip--cmd {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.78rem;
    letter-spacing: 0.01em;
  }

  .chip:active {
    transform: scale(0.97);
  }

  .chip:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .profile-card {
    margin: 0 0 10px;
    padding: 12px 14px;
    border-radius: var(--radius-md);
    background: var(--surface);
    border: 1px solid var(--border-soft);
    box-shadow: var(--shadow-soft);
    animation: card-in 200ms var(--ease-out) both;
  }

  .profile-card__title {
    margin: 0;
    font-size: 0.92rem;
    font-weight: 700;
  }

  .profile-card__hint {
    margin: 0.25rem 0 0.55rem;
    font-size: 0.8rem;
    color: var(--text-muted);
    line-height: 1.35;
  }

  .profile-card__list {
    margin: 0;
    padding: 0 0 0 1rem;
    font-size: 0.85rem;
    line-height: 1.45;
    color: var(--text-strong);
  }

  .profile-card__meta {
    margin: 0 0 0.55rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .profile-card__editable {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }

  .profile-card__editable li {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-soft);
    background: var(--bg, transparent);
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .pill-remove {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
    transition: transform 140ms var(--ease-out), color 140ms ease;
  }

  .pill-remove:active {
    transform: scale(0.94);
  }

  .pill-remove:hover {
    color: var(--text-strong);
  }

  .profile-card__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }

  @keyframes card-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .bubbles {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 14px;
  }

  .bubble {
    max-width: min(92%, 420px);
    padding: 14px 16px;
    border-radius: 18px;
    font-size: 0.96rem;
    line-height: 1.45;
    box-shadow: var(--shadow-soft);
  }

  .bubble p {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .bubble--user {
    justify-self: end;
    background: var(--text-strong);
    color: #fff;
    border-bottom-right-radius: 6px;
  }

  .bubble--ai {
    justify-self: start;
    background: var(--surface);
    border: 1px solid var(--border-soft);
    border-bottom-left-radius: 6px;
    color: var(--text-strong);
  }

  .bubble--typing {
    display: inline-flex;
    gap: 5px;
    align-items: center;
    min-width: 52px;
  }

  .bubble--typing span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-muted);
    opacity: 0.45;
    animation: bounce 1s var(--ease-out) infinite;
  }

  .bubble--typing span:nth-child(2) {
    animation-delay: 120ms;
  }
  .bubble--typing span:nth-child(3) {
    animation-delay: 240ms;
  }

  @keyframes bounce {
    0%,
    80%,
    100% {
      transform: translateY(0);
      opacity: 0.35;
    }
    40% {
      transform: translateY(-3px);
      opacity: 0.9;
    }
  }

  .composer {
    position: sticky;
    bottom: calc(68px + env(safe-area-inset-bottom, 0px));
    display: flex;
    align-items: flex-end;
    gap: 10px;
    width: 100%;
    box-sizing: border-box;
    margin-top: auto;
    padding: 12px 14px;
    border-radius: var(--radius-md);
    background: var(--surface);
    border: 1px solid var(--border-soft);
    box-shadow: var(--shadow-soft);
    z-index: 40;
    transition: bottom 160ms var(--ease-out);
  }

  .chat-shell.is-typing {
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  }

  .chat-shell.is-typing .composer {
    bottom: max(8px, var(--kb-inset, 0px));
  }

  .chat-shell.is-typing :global(.bottom-nav) {
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, 140%);
    transition:
      opacity 160ms var(--ease-out),
      transform 160ms var(--ease-out);
  }

  @media (min-width: 861px) {
    .composer {
      bottom: 0;
    }

    .chat-shell.is-typing .composer {
      bottom: 0;
    }
  }

  @media (max-width: 520px) {
    .chat-head {
      gap: 0.55rem;
      margin: 0.15rem 0 0.75rem;
    }

    .chat-head__btn {
      padding: 0.4rem 0.7rem;
      font-size: 0.78rem;
    }

    .composer {
      bottom: calc(64px + env(safe-area-inset-bottom, 0px));
      padding: 10px 12px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .composer,
    .chat-shell.is-typing :global(.bottom-nav) {
      transition: none;
    }
  }

  .composer textarea {
    flex: 1;
    resize: none;
    border: none;
    outline: none;
    font: inherit;
    font-size: 16px; /* evita zoom iOS al enfocar */
    line-height: 1.4;
    max-height: 120px;
    background: transparent;
    color: var(--text-strong);
    padding: 6px 4px;
  }

  .send {
    width: 42px;
    height: 42px;
    border: none;
    border-radius: 50%;
    background: var(--text-strong);
    color: #fff;
    font-size: 1.15rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 140ms var(--ease-out);
  }

  .send:active {
    transform: scale(0.95);
  }

  .send:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .muted {
    color: var(--text-muted);
  }

  @media (prefers-reduced-motion: reduce) {
    .bubble--typing span {
      animation: none;
      opacity: 0.55;
    }

    .profile-card {
      animation: none;
    }
  }
</style>
