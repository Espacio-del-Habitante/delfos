<script lang="ts">
  import CustomSelect from '@common/molecules/CustomSelect.svelte';
  import MoneyInput from '@common/molecules/MoneyInput.svelte';
  import {
    createAssistantGoal,
    deleteAssistantGoal,
    getAssistantGoals,
    getAssistantProfile,
    updateAssistantProfile,
  } from '@common/lib/api';
  import { showToast } from '@common/lib/toast';
  import type { FinancialProfile, Goal, GoalType, SelectOption } from '@common/lib/types';
  import { createEventDispatcher, onMount } from 'svelte';

  const dispatch = createEventDispatcher<{ completed: FinancialProfile }>();

  const STEP_LABELS = ['Contexto', 'Metas', 'Riesgo'] as const;

  const STEP_TIPS: Record<number, { title: string; body: string }> = {
    1: {
      title: '¿Para qué sirve esto?',
      body: 'Los montos son totales mensuales. La frecuencia (mensual, quincenal o semanal) adapta el recordatorio de cobro y la propuesta al tamaño del cheque.',
    },
    2: {
      title: 'Cómo se usan los %',
      body: 'Ahorro, inversión y colchón alimentan la propuesta al registrar un ingreso. El colchón no se mueve: queda en tu cuenta operativa. La emergencia solo cuenta si enlazas una cuenta a esa meta.',
    },
    3: {
      title: 'Sin presión',
      body: 'Riesgo y horizonte guían el tono del asistente. No son asesoría; puedes cambiarlos cuando quieras en Perfil.',
    },
  };

  let step = 1;
  let loading = true;
  let saving = false;

  let fiscalCountry = 'CO';
  let incomeFixed: number | null = null;
  let incomeVariable: number | null = null;
  let fixedExpensesTotal: number | null = null;
  let payFrequency = 'monthly';
  let paydayDay = '';
  let paydayWeekday = '4';
  let savingsPercent = '20';
  let investmentPercent = '10';
  let cushionPercent = '10';
  let emergencyMonths = '6';
  let riskProfile = 'moderate';
  let investmentHorizon = 'medium';
  let prioritiesText = '';
  let goalTitle = '';
  let goalAmount: number | null = null;
  let goalType = 'savings';
  let existingGoals: Goal[] = [];

  const riskOptions: SelectOption[] = [
    { value: 'conservative', label: 'Conservador' },
    { value: 'moderate', label: 'Moderado' },
    { value: 'aggressive', label: 'Agresivo' },
  ];

  const horizonOptions: SelectOption[] = [
    { value: 'short', label: 'Corto (< 2 años)' },
    { value: 'medium', label: 'Medio (2–5 años)' },
    { value: 'long', label: 'Largo (> 5 años)' },
  ];

  const frequencyOptions: SelectOption[] = [
    { value: 'monthly', label: 'Mensual' },
    { value: 'biweekly', label: 'Quincenal' },
    { value: 'weekly', label: 'Semanal' },
  ];

  const weekdayOptions: SelectOption[] = [
    { value: '0', label: 'Lunes' },
    { value: '1', label: 'Martes' },
    { value: '2', label: 'Miércoles' },
    { value: '3', label: 'Jueves' },
    { value: '4', label: 'Viernes' },
    { value: '5', label: 'Sábado' },
    { value: '6', label: 'Domingo' },
  ];

  const goalTypeOptions: SelectOption[] = [
    { value: 'emergency_fund', label: 'Fondo de emergencia' },
    { value: 'savings', label: 'Ahorro' },
    { value: 'investment', label: 'Inversión' },
    { value: 'debt', label: 'Pagar deuda' },
    { value: 'custom', label: 'Otra' },
  ];

  $: allocSum =
    (numOrNull(savingsPercent) ?? 0) +
    (numOrNull(investmentPercent) ?? 0) +
    (numOrNull(cushionPercent) ?? 0);
  $: allocOver = allocSum > 100;
  $: tip = STEP_TIPS[step];
  $: showPaydayDay = payFrequency === 'monthly' || payFrequency === 'biweekly';
  $: showPaydayWeekday = payFrequency === 'weekly';
  $: paydayDayLabel =
    payFrequency === 'biweekly'
      ? 'Día de cobro de la 1ª quincena (1–14)'
      : 'Día de pago (1–28)';
  $: paydayDayHelp =
    payFrequency === 'biweekly'
      ? 'La 2ª quincena recuerda desde el día 15. Si cobras el 30, usa 14 en la 1ª.'
      : 'Día del mes en que suele llegar el salario. Si cobras el 30, usa 28.';

  onMount(async () => {
    try {
      const [{ profile }, { goals }] = await Promise.all([
        getAssistantProfile(),
        getAssistantGoals(),
      ]);
      applyProfile(profile);
      existingGoals = goals;
      if (profile.onboarding_completed) step = 3;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo cargar el perfil', {
        type: 'error',
      });
    } finally {
      loading = false;
    }
  });

  function applyProfile(profile: FinancialProfile) {
    fiscalCountry = profile.fiscal_country || 'CO';
    incomeFixed = profile.monthly_income_fixed ?? null;
    incomeVariable = profile.monthly_income_variable_avg ?? null;
    fixedExpensesTotal = profile.monthly_fixed_expenses ?? null;
    payFrequency = String(profile.pay_frequency || 'monthly');
    paydayDay = profile.income_payday_day != null ? String(profile.income_payday_day) : '';
    paydayWeekday =
      profile.income_payday_weekday != null ? String(profile.income_payday_weekday) : '4';
    savingsPercent =
      profile.savings_target_percent != null ? String(profile.savings_target_percent) : '20';
    investmentPercent =
      profile.investment_target_percent != null
        ? String(profile.investment_target_percent)
        : '10';
    cushionPercent =
      profile.cushion_percent != null ? String(profile.cushion_percent) : '10';
    emergencyMonths =
      profile.emergency_fund_target_months != null
        ? String(profile.emergency_fund_target_months)
        : '6';
    riskProfile = profile.risk_profile || 'moderate';
    investmentHorizon = profile.investment_horizon || 'medium';
    prioritiesText = (profile.priorities || []).join(', ');
  }

  function numOrNull(raw: string | number | null | undefined): number | null {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    const t = String(raw).trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  function goalTypeLabel(t: string) {
    return goalTypeOptions.find((o) => o.value === t)?.label ?? t;
  }

  async function saveStep1() {
    saving = true;
    try {
      const { profile } = await updateAssistantProfile({
        fiscal_country: String(fiscalCountry ?? '').trim() || 'CO',
        monthly_income_fixed: incomeFixed,
        monthly_income_variable_avg: incomeVariable,
        monthly_fixed_expenses: fixedExpensesTotal,
        pay_frequency: payFrequency as FinancialProfile['pay_frequency'],
        income_payday_day: showPaydayDay ? numOrNull(paydayDay) : null,
        income_payday_weekday: showPaydayWeekday ? numOrNull(paydayWeekday) : null,
      });
      applyProfile(profile);
      step = 2;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al guardar', { type: 'error' });
    } finally {
      saving = false;
    }
  }

  async function addGoal(): Promise<boolean> {
    const title = String(goalTitle ?? '').trim();
    if (!title) {
      showToast('Escribe un título para la meta', { type: 'error' });
      return false;
    }
    saving = true;
    try {
      const { goals } = await createAssistantGoal({
        title,
        type: goalType as GoalType,
        target_amount: goalAmount,
        priority: existingGoals.length + 1,
      });
      existingGoals = goals;
      goalTitle = '';
      goalAmount = null;
      showToast('Meta agregada', { type: 'success' });
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al agregar meta', { type: 'error' });
      return false;
    } finally {
      saving = false;
    }
  }

  async function removeGoal(id: string) {
    saving = true;
    try {
      const { goals } = await deleteAssistantGoal(id);
      existingGoals = goals;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al eliminar', { type: 'error' });
    } finally {
      saving = false;
    }
  }

  async function saveStep2() {
    if (allocOver) {
      showToast('Ahorro + inversión + colchón no debe superar 100%', { type: 'error' });
      return;
    }
    // Auto-agrega la meta en borrador si el usuario no pulsó "Agregar"
    if (String(goalTitle ?? '').trim()) {
      const ok = await addGoal();
      if (!ok) return;
    }
    saving = true;
    try {
      await updateAssistantProfile({
        savings_target_percent: numOrNull(savingsPercent),
        investment_target_percent: numOrNull(investmentPercent),
        cushion_percent: numOrNull(cushionPercent),
        emergency_fund_target_months: numOrNull(emergencyMonths),
      });
      const { goals } = await getAssistantGoals();
      existingGoals = goals;
      step = 3;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al guardar metas', { type: 'error' });
    } finally {
      saving = false;
    }
  }

  async function finish() {
    saving = true;
    try {
      const { profile } = await updateAssistantProfile({
        risk_profile: riskProfile as FinancialProfile['risk_profile'],
        investment_horizon: investmentHorizon as FinancialProfile['investment_horizon'],
        priorities: prioritiesText,
        onboarding_completed: true,
      });
      applyProfile(profile);
      showToast('Perfil listo', { type: 'success' });
      dispatch('completed', profile);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al finalizar', { type: 'error' });
    } finally {
      saving = false;
    }
  }
</script>

<div class="onboarding" aria-label="Onboarding financiero">
  <header class="onboarding__page-head">
    <div class="onboarding__title-slot">
      <slot name="title" />
    </div>
    <div class="onboarding__tagline-slot">
      <slot name="tagline" />
    </div>
  </header>

  {#if loading}
    <p class="onboarding__loading">Cargando perfil…</p>
  {:else}
    <div class="onboarding__layout">
      <div class="onboarding__card-stack">
        <nav class="delfos-stepper delfos-stepper--on-card" aria-label={`Paso ${step} de 3`}>
          <ol class="delfos-stepper__list" aria-label="Pasos">
            {#each STEP_LABELS as label, i}
              {@const n = i + 1}
              <li class:is-active={step === n} class:is-done={step > n}>
                <span class="delfos-stepper__num" aria-hidden="true">
                  {#if step > n}✓{:else}{n}{/if}
                </span>
                <span class="delfos-stepper__label">{label}</span>
              </li>
            {/each}
          </ol>
        </nav>
        <div class="onboarding__main">
        {#if step === 1}
          <div class="onboarding__panel">
            <h2 class="onboarding__title">Tu contexto básico</h2>
            <p class="onboarding__hint">
              Cuéntanos cuánto entra y qué gastos fijos tienes. Esto alimenta la propuesta al
              registrar un ingreso.
            </p>
            <label class="field">
              <span class="field__label">País fiscal</span>
              <input type="text" bind:value={fiscalCountry} maxlength="4" autocomplete="country" />
            </label>
            <label class="field">
              <span class="field__label">Ingreso mensual fijo</span>
              <MoneyInput bind:value={incomeFixed} />
            </label>
            <label class="field">
              <span class="field__label">Ingreso variable (promedio)</span>
              <MoneyInput bind:value={incomeVariable} />
            </label>
            <label class="field">
              <span class="field__label">
                Gastos fijos mensuales
                <span class="field-help" tabindex="0" role="note" title="Arriendo, servicios, seguros… lo que sale sí o sí cada mes.">
                  ?
                  <span class="field-help__tip" role="tooltip"
                    >Arriendo, servicios, seguros… lo que sale sí o sí cada mes.</span
                  >
                </span>
              </span>
              <MoneyInput bind:value={fixedExpensesTotal} placeholder="Arriendo + servicios + …" />
            </label>
            <label class="field">
              <span class="field__label">
                Frecuencia de pago
                <span
                  class="field-help"
                  tabindex="0"
                  role="note"
                  title="Los montos de arriba siguen siendo mensuales. La frecuencia adapta recordatorio y propuesta al cheque."
                >
                  ?
                  <span class="field-help__tip" role="tooltip"
                    >Los montos de arriba siguen siendo mensuales. La frecuencia adapta recordatorio
                    y propuesta al cheque.</span
                  >
                </span>
              </span>
              <CustomSelect options={frequencyOptions} bind:value={payFrequency} />
            </label>
            {#if showPaydayDay}
              <label class="field">
                <span class="field__label">
                  {paydayDayLabel}
                  <span class="field-help" tabindex="0" role="note" title={paydayDayHelp}>
                    ?
                    <span class="field-help__tip" role="tooltip">{paydayDayHelp}</span>
                  </span>
                </span>
                <input
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max={payFrequency === 'biweekly' ? 14 : 28}
                  step="1"
                  bind:value={paydayDay}
                  placeholder={payFrequency === 'biweekly' ? 'Ej. 1 o 15→usa 1' : 'Ej. 30 → usa 28'}
                />
              </label>
            {/if}
            {#if showPaydayWeekday}
              <label class="field">
                <span class="field__label">Día de cobro de la semana</span>
                <CustomSelect options={weekdayOptions} bind:value={paydayWeekday} />
              </label>
            {/if}
            <div class="onboarding__actions">
              <button type="button" class="btn btn-primary" disabled={saving} on:click={saveStep1}>
                Continuar
              </button>
            </div>
          </div>
        {:else if step === 2}
          <div class="onboarding__panel">
            <h2 class="onboarding__title">Metas y colchón</h2>
            <p class="onboarding__hint">
              Define cuánto quieres apartar. Deja un colchón sin comprometer en la cuenta del día a
              día.
            </p>

            <label class="field">
              <span class="field__label">
                % ahorro objetivo
                <span
                  class="field-help"
                  tabindex="0"
                  role="note"
                  title="Parte del ingreso que quieres guardar. Alimenta la propuesta al registrar un ingreso."
                >
                  ?
                  <span class="field-help__tip" role="tooltip"
                    >Parte del ingreso que quieres guardar. Alimenta la propuesta al registrar un
                    ingreso.</span
                  >
                </span>
              </span>
              <input
                type="number"
                inputmode="decimal"
                min="0"
                max="100"
                step="1"
                bind:value={savingsPercent}
              />
            </label>
            <label class="field">
              <span class="field__label">% inversión objetivo</span>
              <input
                type="number"
                inputmode="decimal"
                min="0"
                max="100"
                step="1"
                bind:value={investmentPercent}
              />
            </label>
            <label class="field">
              <span class="field__label">
                % colchón (holgura)
                <span
                  class="field-help"
                  tabindex="0"
                  role="note"
                  title="Porcentaje que no se mueve: queda en tu cuenta operativa como líquido del mes."
                >
                  ?
                  <span class="field-help__tip" role="tooltip"
                    >Porcentaje que no se mueve: queda en tu cuenta operativa como líquido del
                    mes.</span
                  >
                </span>
              </span>
              <input
                type="number"
                inputmode="decimal"
                min="0"
                max="100"
                step="1"
                bind:value={cushionPercent}
              />
            </label>
            <p class="alloc" class:alloc--bad={allocOver}>
              Comprometido: {allocSum}%{#if allocOver}
                — supera 100%{/if}
            </p>
            <label class="field">
              <span class="field__label">
                Meses de fondo de emergencia
                <span
                  class="field-help"
                  tabindex="0"
                  role="note"
                  title="Cuántos meses de gastos fijos quieres cubrir. Solo cuenta si enlazas una cuenta a esa meta."
                >
                  ?
                  <span class="field-help__tip" role="tooltip"
                    >Cuántos meses de gastos fijos quieres cubrir. Solo cuenta si enlazas una cuenta
                    a esa meta.</span
                  >
                </span>
              </span>
              <input
                type="number"
                inputmode="decimal"
                min="0"
                step="1"
                bind:value={emergencyMonths}
              />
            </label>

            <div class="goals-box">
              <h3 class="goals-box__title">Metas concretas</h3>
              {#if existingGoals.length}
                <ul class="onboarding__goals">
                  {#each existingGoals as g (g.id)}
                    <li>
                      <span>
                        <strong>{g.title}</strong>
                        <span class="muted"> · {goalTypeLabel(g.type)}</span>
                        {#if g.target_amount != null}
                          <span class="muted"> · ${Number(g.target_amount).toLocaleString('es-CO')}</span>
                        {/if}
                      </span>
                      <button
                        type="button"
                        class="btn-text"
                        disabled={saving}
                        on:click={() => removeGoal(g.id)}
                      >
                        Quitar
                      </button>
                    </li>
                  {/each}
                </ul>
              {:else}
                <p class="muted">Aún no hay metas. Agrega las que necesites.</p>
              {/if}

              {#if existingGoals.some((g) => g.type === 'emergency_fund')}
                <p class="goals-box__note">
                  Tienes una meta de emergencia: enlázale una cuenta (rol “De meta”) para que el KPI
                  sea honesto.
                </p>
              {/if}

              <label class="field">
                <span class="field__label">Tipo</span>
                <CustomSelect options={goalTypeOptions} bind:value={goalType} />
              </label>
              <label class="field">
                <span class="field__label">Título</span>
                <input type="text" bind:value={goalTitle} placeholder="Ej. Viaje, aparte casa…" />
              </label>
              <label class="field">
                <span class="field__label">Monto objetivo (opcional)</span>
                <MoneyInput bind:value={goalAmount} />
              </label>
              <button type="button" class="btn btn-ghost" disabled={saving} on:click={addGoal}>
                Agregar meta
              </button>
            </div>

            <div class="onboarding__actions">
              <button type="button" class="btn btn-ghost" disabled={saving} on:click={() => (step = 1)}>
                Atrás
              </button>
              <button
                type="button"
                class="btn btn-primary"
                disabled={saving || allocOver}
                on:click={saveStep2}
              >
                Continuar
              </button>
            </div>
          </div>
        {:else}
          <div class="onboarding__panel">
            <h2 class="onboarding__title">Riesgo y prioridades</h2>
            <p class="onboarding__hint">
              Último paso. Podrás editarlo después en Perfil cuando cambien tus prioridades.
            </p>
            <label class="field">
              <span class="field__label">Tolerancia al riesgo</span>
              <CustomSelect options={riskOptions} bind:value={riskProfile} />
            </label>
            <label class="field">
              <span class="field__label">Horizonte de inversión</span>
              <CustomSelect options={horizonOptions} bind:value={investmentHorizon} />
            </label>
            <label class="field">
              <span class="field__label">Prioridades (separadas por coma)</span>
              <input
                type="text"
                bind:value={prioritiesText}
                placeholder="liquidez, ahorro, inversión"
              />
            </label>
            <div class="onboarding__actions">
              <button type="button" class="btn btn-ghost" disabled={saving} on:click={() => (step = 2)}>
                Atrás
              </button>
              <button type="button" class="btn btn-primary" disabled={saving} on:click={finish}>
                Guardar y terminar
              </button>
            </div>
          </div>
        {/if}
        </div>
      </div>

      {#if tip}
        {#key step}
          <aside class="onboarding__tip" aria-label="Consejo">
            <div class="onboarding__tip-head">
              <p class="onboarding__tip-kicker">Consejo</p>
              <p class="onboarding__tip-title">{tip.title}</p>
            </div>
            <div class="onboarding__tip-body-wrap">
              <p class="onboarding__tip-body">{tip.body}</p>
            </div>
          </aside>
        {/key}
      {/if}
    </div>
  {/if}
</div>

<style>
  .onboarding__loading {
    color: var(--text-muted);
    margin: 0;
  }

  .onboarding {
    display: grid;
    gap: 1.15rem;
  }

  .onboarding__page-head {
    display: grid;
    gap: 0.35rem;
  }

  .onboarding__title-slot {
    min-width: 0;
    display: flex;
    align-items: center;
    min-height: 1.7rem;
  }

  .onboarding__tagline-slot {
    min-width: 0;
  }

  /* Card stack hosts the shared .delfos-stepper--on-card tab (top-right) */
  .onboarding__card-stack {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    min-width: 0;
  }

  .onboarding__layout {
    display: grid;
    gap: 1rem;
  }

  @media (min-width: 720px) {
    .onboarding__layout {
      grid-template-columns: minmax(0, 1fr) minmax(190px, 248px);
      align-items: start;
      gap: 1.15rem;
    }
  }

  .onboarding__main {
    position: relative;
    z-index: 0;
    min-width: 0;
    padding: 1.35rem 1.2rem 1.15rem;
    border-radius: var(--radius-md);
    background: var(--surface);
    border: 1px solid var(--border-soft);
    box-shadow: var(--shadow-soft);
  }

  .onboarding__panel {
    display: grid;
    gap: 0.85rem;
  }

  .onboarding__title {
    margin: 0;
    font-size: 1.25rem;
  }

  .onboarding__hint {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  /* Organic tip: title bubble + wider body — firm ink contrast, no pastel wash */
  .onboarding__tip {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    padding: 0;
    border: none;
    background: transparent;
    box-shadow: none;
  }

  .onboarding__tip-head {
    position: relative;
    z-index: 1;
    align-self: flex-start;
    width: fit-content;
    max-width: min(100%, 13.5rem);
    margin-bottom: -0.55rem;
    padding: 0.72rem 1.05rem 0.7rem;
    border-radius: 1.35rem 1.35rem 0.45rem 1.15rem;
    background: var(--text-strong);
    color: #fff;
  }

  .onboarding__tip-body-wrap {
    width: 100%;
    padding: 1.05rem 1.1rem 1.05rem;
    border-radius: 0.35rem 1.55rem 1.45rem 1.35rem;
    background: var(--surface);
    border: 1px solid var(--border-soft);
    box-shadow: var(--shadow-soft);
  }

  @media (prefers-reduced-motion: no-preference) {
    .onboarding__tip {
      animation: tip-in 220ms var(--ease-out) both;
    }
  }

  @keyframes tip-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .onboarding__tip-kicker {
    margin: 0;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: color-mix(in srgb, #fff 72%, transparent);
  }

  .onboarding__tip-title {
    margin: 0.15rem 0 0;
    font-size: 0.92rem;
    font-weight: 700;
    color: #fff;
    line-height: 1.25;
  }

  .onboarding__tip-body {
    margin: 0;
    font-size: 0.84rem;
    line-height: 1.45;
    color: color-mix(in srgb, var(--text-strong) 72%, var(--text-muted));
  }

  .field {
    display: grid;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .field__label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .field :global(input),
  .field input {
    width: 100%;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    padding: 0.7rem 0.85rem;
    font: inherit;
    color: var(--text-strong);
    background: var(--surface);
  }

  .field-help {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    border: 1px solid var(--border-soft);
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--text-muted);
    cursor: help;
    flex-shrink: 0;
  }

  .field-help__tip {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 8px);
    transform: translateX(-50%) translateY(4px);
    width: max-content;
    max-width: 220px;
    padding: 0.45rem 0.6rem;
    border-radius: 8px;
    background: var(--text-strong);
    color: #fff;
    font-size: 0.72rem;
    font-weight: 500;
    line-height: 1.35;
    text-transform: none;
    letter-spacing: 0;
    opacity: 0;
    pointer-events: none;
    z-index: 5;
    transition:
      opacity 140ms var(--ease-out),
      transform 140ms var(--ease-out);
  }

  .field-help:hover .field-help__tip,
  .field-help:focus .field-help__tip,
  .field-help:focus-within .field-help__tip {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }

  .alloc {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .alloc--bad {
    color: var(--danger);
    font-weight: 600;
  }

  .goals-box {
    display: grid;
    gap: 0.75rem;
    padding: 0.9rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-soft);
    background: color-mix(in srgb, var(--text-strong) 2%, var(--surface));
  }

  .goals-box__title {
    margin: 0;
    font-size: 0.95rem;
  }

  .goals-box__note {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-strong);
  }

  .muted {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .onboarding__goals {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.45rem;
  }

  .onboarding__goals li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .btn-text {
    border: none;
    background: none;
    color: var(--danger);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0.25rem;
  }

  .onboarding__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 0.25rem;
  }

  .btn {
    border: none;
    border-radius: var(--radius-sm);
    padding: 0.65rem 1rem;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: transform 140ms var(--ease-out);
  }

  .btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .btn:not(:disabled):active {
    transform: scale(0.97);
  }

  .btn-primary {
    background: var(--text-strong);
    color: #fff;
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border-soft);
  }

  @media (prefers-reduced-motion: reduce) {
    .field-help__tip,
    .btn {
      transition: none;
    }

    .onboarding__tip {
      animation: none;
    }
  }
</style>
