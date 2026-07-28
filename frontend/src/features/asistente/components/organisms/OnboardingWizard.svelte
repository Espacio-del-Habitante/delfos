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

  let step = 1;
  let loading = true;
  let saving = false;

  let fiscalCountry = 'CO';
  let incomeFixed: number | null = null;
  let incomeVariable: number | null = null;
  let fixedExpensesTotal: number | null = null;
  let paydayDay = '';
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
    paydayDay = profile.income_payday_day != null ? String(profile.income_payday_day) : '';
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
        income_payday_day: numOrNull(paydayDay),
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

{#if loading}
  <p class="onboarding__loading">Cargando perfil…</p>
{:else}
  <div class="onboarding" aria-label="Onboarding financiero">
    <ol class="onboarding__steps" aria-label="Pasos">
      <li class:is-active={step === 1} class:is-done={step > 1}>Contexto</li>
      <li class:is-active={step === 2} class:is-done={step > 2}>Metas</li>
      <li class:is-active={step === 3}>Perfil</li>
    </ol>

    {#if step === 1}
      <div class="onboarding__panel">
        <h2 class="onboarding__title">Tu contexto básico</h2>
        <p class="onboarding__hint">Ingresos y país fiscal. La moneda base ya está en Ajustes.</p>
        <label class="field">
          <span>País fiscal</span>
          <input type="text" bind:value={fiscalCountry} maxlength="4" autocomplete="country" />
        </label>
        <label class="field">
          <span>Ingreso mensual fijo</span>
          <MoneyInput bind:value={incomeFixed} />
        </label>
        <label class="field">
          <span>Ingreso variable (promedio)</span>
          <MoneyInput bind:value={incomeVariable} />
        </label>
        <label class="field">
          <span>Gastos fijos mensuales (total)</span>
          <MoneyInput bind:value={fixedExpensesTotal} placeholder="Arriendo + servicios + …" />
        </label>
        <label class="field">
          <span>Día de pago (1–28)</span>
          <input
            type="number"
            inputmode="numeric"
            min="1"
            max="28"
            step="1"
            bind:value={paydayDay}
            placeholder="Ej. 30 → usa 28"
          />
        </label>
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
          Puedes agregar varias metas. Deja un colchón del ingreso sin comprometer.
        </p>

        <div class="glossary">
          <h3 class="glossary__title">Cómo se relacionan</h3>
          <ul class="glossary__list">
            <li><strong>Cuenta operativa</strong> — día a día; ahí cae el salario y queda el líquido.</li>
            <li><strong>Cuenta de meta / bolsillo</strong> — ahorro etiquetado enlazado a una meta.</li>
            <li><strong>Meta</strong> — el objetivo; su progreso suma los saldos de cuentas enlazadas.</li>
            <li><strong>Colchón</strong> — % que no se mueve; se queda en la operativa.</li>
            <li><strong>% inversión</strong> — parte del ingreso pensada para broker u otra reserva.</li>
          </ul>
          <p class="glossary__cta">
            Después crea cuentas en el dashboard y enlázalas a metas. El colchón de emergencia solo
            cuenta si hay una cuenta enlazada a esa meta.
          </p>
          {#if existingGoals.some((g) => g.type === 'emergency_fund')}
            <p class="glossary__hint">
              Tienes una meta de emergencia: enlázale una cuenta (rol “De meta”) para que el KPI sea
              honesto.
            </p>
          {/if}
        </div>

        <label class="field">
          <span>% ahorro objetivo</span>
          <input type="number" inputmode="decimal" min="0" max="100" step="1" bind:value={savingsPercent} />
        </label>
        <label class="field">
          <span>% inversión objetivo</span>
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
          <span>% colchón (holgura)</span>
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
          <span>Meses de fondo de emergencia</span>
          <input type="number" inputmode="decimal" min="0" step="1" bind:value={emergencyMonths} />
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
                      <span class="muted"> · {g.target_amount}</span>
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

          <label class="field">
            <span>Tipo</span>
            <CustomSelect options={goalTypeOptions} bind:value={goalType} />
          </label>
          <label class="field">
            <span>Título</span>
            <input type="text" bind:value={goalTitle} placeholder="Ej. Viaje, aparte casa…" />
          </label>
          <label class="field">
            <span>Monto objetivo (opcional)</span>
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
        <p class="onboarding__hint">Cierra el onboarding. Podrás editarlo después en Perfil.</p>
        <label class="field">
          <span>Tolerancia al riesgo</span>
          <CustomSelect options={riskOptions} bind:value={riskProfile} />
        </label>
        <label class="field">
          <span>Horizonte de inversión</span>
          <CustomSelect options={horizonOptions} bind:value={investmentHorizon} />
        </label>
        <label class="field">
          <span>Prioridades (separadas por coma)</span>
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
{/if}

<style>
  .onboarding__loading {
    color: var(--text-muted);
    margin: 0;
  }

  .onboarding {
    display: grid;
    gap: 1rem;
  }

  .onboarding__steps {
    display: flex;
    gap: 0.5rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .onboarding__steps li {
    flex: 1;
    text-align: center;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--text-muted);
    padding: 0.5rem 0.25rem;
    border-bottom: 2px solid var(--border-soft);
  }

  .onboarding__steps li.is-active {
    color: var(--text-strong);
    border-bottom-color: var(--text-strong);
  }

  .onboarding__steps li.is-done {
    color: var(--success);
    border-bottom-color: var(--success);
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

  .field {
    display: grid;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: var(--text-muted);
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
    background: rgba(15, 23, 42, 0.02);
  }

  .goals-box__title {
    margin: 0;
    font-size: 0.95rem;
  }

  .glossary {
    display: grid;
    gap: 0.55rem;
    padding: 0.9rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-soft);
    background: rgba(15, 23, 42, 0.02);
  }

  .glossary__title {
    margin: 0;
    font-size: 0.95rem;
  }

  .glossary__list {
    margin: 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .glossary__list strong {
    color: var(--text-strong);
  }

  .glossary__cta,
  .glossary__hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .glossary__hint {
    color: var(--text-strong);
    font-weight: 600;
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
</style>
