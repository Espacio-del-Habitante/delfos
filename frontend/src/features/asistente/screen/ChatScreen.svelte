<script lang="ts">
  import { onMount, tick } from 'svelte';
  import HeaderIsland from '@common/molecules/HeaderIsland.svelte';
  import BottomNav from '@common/molecules/BottomNav.svelte';
  import {
    ApiError,
    applyAssistantAccountSuggestion,
    applyAssistantProfileSuggestion,
    confirmAnalysis,
    ensureAssistantThread,
    getAssistantMessages,
    sendAssistantChat,
  } from '@common/lib/api';
  import { applyFinancePayload, finance, refreshFinanceData } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import type {
    AccountDraft,
    AnalysisPreview,
    ChatMessage,
    FinancialProfilePatch,
    FixedExpenseItem,
    PreviewItem,
  } from '@common/lib/types';

  let threadId: string | null = null;
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
  let scroller: HTMLElement | undefined;
  let inputEl: HTMLTextAreaElement | undefined;

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

  onMount(async () => {
    try {
      await refreshFinanceData().catch(() => undefined);
      const { thread } = await ensureAssistantThread();
      threadId = thread.id;
      const { messages: msgs } = await getAssistantMessages(thread.id);
      messages = msgs;
      const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
      followUps = lastAssistant?.meta?.follow_ups?.length
        ? lastAssistant.meta.follow_ups
        : [];
      profileSuggestion = suggestionFromMessage(lastAssistant);
      setMovementDraft(movementFromMessage(lastAssistant));
      accountDraft = accountFromMessage(lastAssistant);
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

<div class="app-shell chat-shell">
  <HeaderIsland summary={$finance?.summary ?? null} />

  <header class="chat-head">
    <div>
      <h1>Delfos</h1>
      <p>Tu copiloto — habla con naturalidad</p>
    </div>
    <a class="chat-head__link" href="/perfil">Perfil</a>
  </header>

  <div class="chat-panel" bind:this={scroller} aria-live="polite">
    {#if loading}
      <p class="muted center">Abriendo conversación…</p>
    {:else if empty}
      <div class="welcome">
        <p class="welcome__title">¿En qué te ayudo?</p>
        <p class="welcome__hint">
          Registra varios gastos, busca con /buscar Uber, o crea una cuenta. Todo con
          confirmación. Si el chat crece, /sumarize.
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
    ></textarea>
    <button type="submit" class="send" disabled={sending || loading || !draft.trim()} aria-label="Enviar">
      ↑
    </button>
  </form>

  <BottomNav active="chat" />
</div>

<style>
  .chat-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    padding-bottom: 120px;
  }

  .chat-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    margin: 0.25rem 0 0.75rem;
  }

  .chat-head h1 {
    margin: 0;
    font-size: 1.35rem;
    letter-spacing: -0.02em;
  }

  .chat-head p {
    margin: 0.2rem 0 0;
    color: var(--text-muted);
    font-size: 0.88rem;
  }

  .chat-head__link {
    flex-shrink: 0;
    padding: 0.4rem 0.8rem;
    border-radius: 999px;
    border: 1px solid var(--border-soft);
    background: var(--surface);
    color: var(--text-strong);
    font-size: 0.8rem;
    font-weight: 700;
    text-decoration: none;
    transition: transform 140ms var(--ease-out);
  }

  .chat-head__link:active {
    transform: scale(0.97);
  }

  .chat-panel {
    flex: 1;
    min-height: 42vh;
    max-height: calc(100vh - 280px);
    overflow-y: auto;
    padding: 4px 2px 12px;
    -webkit-overflow-scrolling: touch;
  }

  .center {
    text-align: center;
    padding: 2rem 0;
  }

  .welcome {
    padding: 1.25rem 0.25rem;
  }

  .welcome__title {
    margin: 0 0 0.4rem;
    font-size: 1.2rem;
    font-weight: 700;
  }

  .welcome__hint {
    margin: 0 0 1rem;
    color: var(--text-muted);
    font-size: 0.9rem;
    line-height: 1.45;
    max-width: 36ch;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chips--follow {
    margin: 0 0 10px;
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
    gap: 10px;
  }

  .bubble {
    max-width: min(92%, 420px);
    padding: 12px 14px;
    border-radius: 18px;
    font-size: 0.95rem;
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
    bottom: calc(72px + env(safe-area-inset-bottom, 0px));
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 10px;
    border-radius: var(--radius-md);
    background: var(--surface);
    border: 1px solid var(--border-soft);
    box-shadow: var(--shadow-soft);
    z-index: 40;
  }

  .composer textarea {
    flex: 1;
    resize: none;
    border: none;
    outline: none;
    font: inherit;
    font-size: 0.95rem;
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
