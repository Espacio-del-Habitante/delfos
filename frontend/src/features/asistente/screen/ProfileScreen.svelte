<script lang="ts">
  import HeaderIsland from '@common/molecules/HeaderIsland.svelte';
  import BottomNav from '@common/molecules/BottomNav.svelte';
  import CustomSelect from '@common/molecules/CustomSelect.svelte';
  import MoneyInput from '@common/molecules/MoneyInput.svelte';
  import IconChevron from '@common/atoms/icons/IconChevron.svelte';
  import OnboardingWizard from '@features/asistente/components/organisms/OnboardingWizard.svelte';
  import {
    createAssistantGoal,
    deleteAssistantGoal,
    getAssistantGoals,
    getAssistantProfile,
    updateAssistantProfile,
  } from '@common/lib/api';
  import { finance, refreshFinanceData } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import type {
    AssistantKpis,
    FinancialProfile,
    FixedExpenseItem,
    Goal,
    GoalType,
    SelectOption,
  } from '@common/lib/types';
  import { onMount } from 'svelte';

  let profile: FinancialProfile | null = null;
  let goals: Goal[] = [];
  let showWizard = false;
  let loaded = false;
  let newTitle = '';
  let newAmount: number | null = null;
  let newType = 'savings';
  let adding = false;
  let fixedLabel = '';
  let fixedAmount: number | null = null;
  let savingFixed = false;

  const goalTypeOptions: SelectOption[] = [
    { value: 'emergency_fund', label: 'Fondo de emergencia' },
    { value: 'savings', label: 'Ahorro' },
    { value: 'investment', label: 'Inversión' },
    { value: 'debt', label: 'Pagar deuda' },
    { value: 'custom', label: 'Otra' },
  ];

  $: kpis = ($finance?.assistant_kpis ?? null) as AssistantKpis | null;
  $: activeGoals = goals.filter((g) => g.status === 'active' || !g.status);
  $: fixedItems = (profile?.fixed_expenses ?? []) as FixedExpenseItem[];
  $: fixedTotal = fixedItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  onMount(async () => {
    try {
      await refreshFinanceData();
      await reloadAssistant();
    } catch {
      showToast('No se pudo cargar el perfil', { type: 'error' });
    } finally {
      loaded = true;
    }
  });

  async function reloadAssistant() {
    const [{ profile: p }, { goals: g }] = await Promise.all([
      getAssistantProfile(),
      getAssistantGoals(),
    ]);
    profile = p;
    goals = g;
    showWizard = !p.onboarding_completed;
  }

  async function onCompleted(e: CustomEvent<FinancialProfile>) {
    profile = e.detail;
    showWizard = false;
    const { goals: g } = await getAssistantGoals();
    goals = g;
    await refreshFinanceData().catch(() => undefined);
  }

  async function removeGoal(id: string) {
    if (!confirm('¿Eliminar esta meta?')) return;
    try {
      const { goals: g } = await deleteAssistantGoal(id);
      goals = g;
      showToast('Meta eliminada', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al eliminar', { type: 'error' });
    }
  }

  async function addGoal() {
    const title = String(newTitle ?? '').trim();
    if (!title) {
      showToast('Escribe un título', { type: 'error' });
      return;
    }
    adding = true;
    try {
      const amount = newAmount != null && Number.isFinite(newAmount) ? newAmount : null;
      const { goals: g } = await createAssistantGoal({
        title,
        type: newType as GoalType,
        target_amount: amount,
        priority: goals.length + 1,
      });
      goals = g;
      newTitle = '';
      newAmount = null;
      showToast('Meta agregada', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al agregar', { type: 'error' });
    } finally {
      adding = false;
    }
  }

  async function persistFixedExpenses(items: FixedExpenseItem[]) {
    const sum = items.reduce((s, x) => s + Number(x.amount || 0), 0);
    const { profile: p } = await updateAssistantProfile({
      fixed_expenses: items,
      monthly_fixed_expenses: items.length ? sum : null,
    });
    profile = p;
    await refreshFinanceData().catch(() => undefined);
  }

  async function addFixedExpense() {
    const label = String(fixedLabel ?? '').trim();
    const amount = fixedAmount;
    if (!label) {
      showToast('Escribe un nombre', { type: 'error' });
      return;
    }
    if (amount == null || !Number.isFinite(amount) || amount <= 0) {
      showToast('Monto inválido', { type: 'error' });
      return;
    }
    savingFixed = true;
    try {
      await persistFixedExpenses([...fixedItems, { label, amount }]);
      fixedLabel = '';
      fixedAmount = null;
      showToast('Gasto fijo agregado', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al agregar', { type: 'error' });
    } finally {
      savingFixed = false;
    }
  }

  async function removeFixedExpense(index: number) {
    if (!confirm('¿Eliminar este gasto fijo?')) return;
    savingFixed = true;
    try {
      await persistFixedExpenses(fixedItems.filter((_, i) => i !== index));
      showToast('Gasto fijo eliminado', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al eliminar', { type: 'error' });
    } finally {
      savingFixed = false;
    }
  }

  function riskLabel(v: string | null | undefined) {
    if (v === 'conservative') return 'Conservador';
    if (v === 'aggressive') return 'Agresivo';
    if (v === 'moderate') return 'Moderado';
    return '—';
  }

  function horizonLabel(v: string | null | undefined) {
    if (v === 'short') return 'Corto';
    if (v === 'long') return 'Largo';
    if (v === 'medium') return 'Medio';
    return '—';
  }

  function typeLabel(t: string) {
    return goalTypeOptions.find((o) => o.value === t)?.label ?? t;
  }
</script>

<div class="app-shell">
  <HeaderIsland summary={$finance?.summary ?? null} />

  <section class="hero section">
    <div class="hero-titlebar">
      <a href="/" class="hero-back" aria-label="Volver al inicio"><IconChevron size={24} direction="left" /></a>
      <h1>Perfil financiero</h1>
    </div>
    <p>Contexto, colchón y metas que usa el asistente. Sin cuenta ni login.</p>
  </section>

  {#if !loaded}
    <p class="muted">Cargando…</p>
  {:else if showWizard}
    <section class="panel">
      <OnboardingWizard on:completed={onCompleted} />
    </section>
  {:else if profile}
    <div class="stat-grid" aria-label="KPIs del perfil">
      <article class="stat-card">
        <div class="stat-card__icon stat-card__icon--savings" aria-hidden="true">↗</div>
        <p class="stat-card__label">Ahorro actual</p>
        <p class="stat-card__value">
          {kpis?.savings_actual_percent != null ? `${kpis.savings_actual_percent}%` : '—'}
        </p>
        <p class="stat-card__meta">
          {kpis?.savings_actual_percent == null
            ? 'Registra el ingreso del mes'
            : '% del mes (ingreso − gasto)'}
        </p>
      </article>
      <article class="stat-card">
        <div class="stat-card__icon stat-card__icon--cushion" aria-hidden="true">◇</div>
        <p class="stat-card__label">Colchón</p>
        <p class="stat-card__value">{profile.cushion_percent ?? '—'}%</p>
        <p class="stat-card__meta">holgura del ingreso</p>
      </article>
      <article class="stat-card">
        <div class="stat-card__icon stat-card__icon--emergency" aria-hidden="true">⌂</div>
        <p class="stat-card__label">Emergencia</p>
        <p class="stat-card__value">
          {kpis?.emergency_months_approx != null ? kpis.emergency_months_approx : '—'}
          <span class="stat-card__unit">meses</span>
        </p>
        <p class="stat-card__meta">
          saldo en cuentas de emergencia · meta {profile.emergency_fund_target_months ?? '—'} meses
        </p>
      </article>
      <article class="stat-card">
        <div class="stat-card__icon stat-card__icon--goals" aria-hidden="true">◎</div>
        <p class="stat-card__label">Metas</p>
        <p class="stat-card__value">{activeGoals.length}</p>
        <p class="stat-card__meta">activas</p>
      </article>
    </div>

    <section class="panel" aria-label="Resumen de perfil">
      <header class="panel__head">
        <div>
          <h2>Contexto</h2>
          <p>Lo que Delfos usará como verdad estructural.</p>
        </div>
        <button type="button" class="btn" on:click={() => (showWizard = true)}>Editar</button>
      </header>
      <dl class="ctx-grid">
        <div>
          <dt>País</dt>
          <dd>{profile.fiscal_country || '—'}</dd>
        </div>
        <div>
          <dt>Ingreso fijo</dt>
          <dd>{profile.monthly_income_fixed ?? '—'}</dd>
        </div>
        <div>
          <dt>Ingreso variable</dt>
          <dd>{profile.monthly_income_variable_avg ?? '—'}</dd>
        </div>
        <div>
          <dt>Gastos fijos</dt>
          <dd>{profile.monthly_fixed_expenses ?? '—'}</dd>
        </div>
        <div>
          <dt>Día de pago</dt>
          <dd>{profile.income_payday_day ?? '—'}</dd>
        </div>
        <div>
          <dt>% inversión</dt>
          <dd>{profile.investment_target_percent ?? '—'}%</dd>
        </div>
        <div>
          <dt>Riesgo</dt>
          <dd>{riskLabel(profile.risk_profile)}</dd>
        </div>
        <div>
          <dt>Horizonte</dt>
          <dd>{horizonLabel(profile.investment_horizon)}</dd>
        </div>
      </dl>
      {#if profile.priorities?.length}
        <p class="note">Prioridades: {profile.priorities.join(' · ')}</p>
      {/if}
      {#if kpis?.portfolio?.top_asset}
        <p class="note">
          Concentración: {kpis.portfolio.top_asset}
          ({kpis.portfolio.top_weight_percent ?? '—'}% del costo)
        </p>
      {/if}
    </section>

    <section class="panel" aria-label="Gastos fijos">
      <header class="panel__head">
        <div>
          <h2>Gastos fijos</h2>
          <p>Arriendo, internet, etc. El total alimenta la distribución del salario.</p>
        </div>
      </header>

      {#if fixedItems.length === 0}
        <p class="muted">Sin gastos fijos — agrega el primero abajo.</p>
      {:else}
        <ul class="goal-list">
          {#each fixedItems as item, i (i)}
            <li class="goal-item">
              <div>
                <p class="goal-item__title">{item.label}</p>
                <p class="goal-item__meta">{item.amount}</p>
              </div>
              <button
                type="button"
                class="card-action-btn card-action-btn--danger"
                disabled={savingFixed}
                on:click={() => removeFixedExpense(i)}
              >
                Eliminar
              </button>
            </li>
          {/each}
        </ul>
        <p class="fixed-total">Total mensual = {fixedTotal}</p>
      {/if}

      <div class="add-goal">
        <input type="text" placeholder="Ej. Arriendo" bind:value={fixedLabel} />
        <MoneyInput placeholder="Monto" bind:value={fixedAmount} />
        <button
          type="button"
          class="btn btn--solid"
          disabled={savingFixed}
          on:click={addFixedExpense}
        >
          Agregar
        </button>
      </div>
    </section>

    <section class="panel" aria-label="Metas">
      <header class="panel__head">
        <div>
          <h2>Metas</h2>
          <p>Puedes tener varias; quita o suma cuando quieras.</p>
        </div>
      </header>

      {#if goals.length === 0}
        <p class="muted">Sin metas todavía — agrega la primera abajo.</p>
      {:else}
        <ul class="goal-list">
          {#each goals as g (g.id)}
            <li class="goal-item">
              <div>
                <p class="goal-item__type">{typeLabel(String(g.type))}</p>
                <p class="goal-item__title">{g.title}</p>
                <p class="goal-item__meta">
                  {#if g.target_amount != null}
                    {g.current_amount ?? 0} / {g.target_amount}
                  {:else if g.current_amount != null && g.current_amount > 0}
                    Acumulado {g.current_amount}
                  {:else}
                    Sin monto fijo
                  {/if}
                  · {g.status}
                </p>
                {#if g.linked_account_names?.length}
                  <p class="goal-item__accounts">
                    Cuentas: {g.linked_account_names.join(' · ')}
                  </p>
                {:else}
                  <p class="goal-item__accounts muted">Sin cuentas enlazadas</p>
                {/if}
              </div>
              <button
                type="button"
                class="card-action-btn card-action-btn--danger"
                on:click={() => removeGoal(g.id)}
              >
                Eliminar
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      <div class="add-goal">
        <CustomSelect options={goalTypeOptions} bind:value={newType} />
        <input type="text" placeholder="Nueva meta" bind:value={newTitle} />
        <MoneyInput placeholder="Monto" bind:value={newAmount} />
        <button type="button" class="btn btn--solid" disabled={adding} on:click={addGoal}>
          Agregar meta
        </button>
      </div>
    </section>
  {/if}

  <BottomNav active="perfil" />
</div>

<style>
  .hero {
    margin-bottom: 1rem;
  }

  .hero h1 {
    margin: 0 0 0.35rem;
    font-size: 1.55rem;
    letter-spacing: -0.02em;
  }

  .hero p {
    margin: 0;
    color: var(--text-muted);
    max-width: 44ch;
    font-size: 0.95rem;
    line-height: 1.45;
  }

  .panel {
    padding: 18px;
    margin-bottom: 16px;
    border-radius: var(--radius-md);
    background: var(--surface);
    border: 1px solid var(--border-soft);
    box-shadow: var(--shadow-soft);
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }

  .stat-card {
    padding: 14px;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid var(--border-soft);
    box-shadow: var(--shadow-soft);
    min-width: 0;
  }

  .stat-card__icon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    margin-bottom: 8px;
    border-radius: 10px;
    font-size: 0.85rem;
    font-weight: 700;
  }

  .stat-card__icon--savings {
    background: rgba(16, 185, 129, 0.12);
    color: var(--success);
  }
  .stat-card__icon--cushion {
    background: rgba(116, 185, 255, 0.16);
    color: #3b82f6;
  }
  .stat-card__icon--emergency {
    background: rgba(245, 158, 11, 0.14);
    color: var(--warning);
  }
  .stat-card__icon--goals {
    background: rgba(79, 70, 229, 0.12);
    color: var(--primary);
  }

  .stat-card__label {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .stat-card__value {
    margin: 2px 0 0;
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .stat-card__unit {
    margin-left: 0.2rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .stat-card__meta {
    margin: 2px 0 0;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .panel__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 14px;
  }

  .panel__head h2 {
    margin: 0;
    font-size: 1.02rem;
  }

  .panel__head p {
    margin: 0.2rem 0 0;
    font-size: 0.85rem;
    color: var(--text-muted);
    line-height: 1.45;
  }

  .btn {
    border: 1px solid var(--border-soft);
    background: var(--surface);
    border-radius: 999px;
    padding: 0.45rem 0.85rem;
    font: inherit;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    color: var(--text-strong);
    transition: transform 140ms var(--ease-out);
  }

  .btn:active {
    transform: scale(0.97);
  }

  .btn--solid {
    background: var(--text-strong);
    color: #fff;
    border-color: transparent;
  }

  .btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .ctx-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 16px;
    margin: 0;
  }

  .ctx-grid dt {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .ctx-grid dd {
    margin: 0.2rem 0 0;
    font-weight: 600;
  }

  .note {
    margin: 12px 0 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .goal-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }

  .goal-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-soft);
    background: var(--surface);
  }

  .goal-item__type {
    margin: 0;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .goal-item__title {
    margin: 0.15rem 0;
    font-size: 1rem;
    font-weight: 700;
  }

  .goal-item__meta {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .goal-item__accounts {
    margin: 0.2rem 0 0;
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  .fixed-total {
    margin: 12px 0 0;
    font-size: 0.9rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .add-goal {
    display: grid;
    gap: 0.55rem;
    margin-top: 1rem;
  }

  .add-goal :global(input),
  .add-goal input {
    width: 100%;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    padding: 0.65rem 0.8rem;
    font: inherit;
    background: var(--surface);
  }

  .muted {
    color: var(--text-muted);
  }

  @media (max-width: 560px) {
    .ctx-grid {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
