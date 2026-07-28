<script lang="ts">
  import type { AssistantKpis, FinancialProfile, Goal } from '@common/lib/types';

  export let profile: FinancialProfile | null | undefined = null;
  export let goals: Goal[] = [];
  export let kpis: AssistantKpis | null | undefined = null;

  $: activeGoals = goals.filter((g) => g.status === 'active' || !g.status);
  $: completed = !!profile?.onboarding_completed;
  $: savingsTone =
    kpis?.savings_vs_target_delta == null
      ? 'neutral'
      : kpis.savings_vs_target_delta >= 0
        ? 'good'
        : 'warn';
  $: emergencyTone =
    kpis?.emergency_vs_target_delta == null
      ? 'neutral'
      : kpis.emergency_vs_target_delta >= 0
        ? 'good'
        : 'warn';
</script>

<section class="peek section" aria-label="Perfil y metas">
  <header class="peek__head">
    <div>
      <p class="peek__eyebrow">Tu copiloto</p>
      <h2 class="peek__title">Perfil y metas</h2>
    </div>
    <div class="peek__actions">
      {#if completed}
        <a class="peek__link peek__link--ghost" href="/perfil">Perfil</a>
        <a class="peek__link" href="/asistente">Hablar</a>
      {:else}
        <a class="peek__link" href="/perfil">Completar</a>
      {/if}
    </div>
  </header>

  {#if !completed}
    <a class="peek-empty" href="/perfil">
      <span class="peek-empty__icon" aria-hidden="true">+</span>
      <span>
        <strong>Arma tu perfil</strong>
        <span class="peek-empty__hint">Ingresos, colchón y metas en unos minutos</span>
      </span>
    </a>
  {:else}
    <div class="peek-grid">
      <article class="peek-card" data-tone={savingsTone}>
        <div class="peek-card__icon peek-card__icon--savings" aria-hidden="true">↗</div>
        <p class="peek-card__label">Ahorro del mes</p>
        <p class="peek-card__value">
          {kpis?.savings_actual_percent != null ? `${kpis.savings_actual_percent}%` : '—'}
        </p>
        <p class="peek-card__meta">
          {#if kpis?.savings_actual_percent == null}
            Registra el ingreso del mes
          {:else if kpis?.savings_vs_target_delta != null}
            % del mes (ingreso − gasto) · meta {kpis?.savings_target_percent ?? profile?.savings_target_percent ?? '—'}%
            · {kpis.savings_vs_target_delta >= 0 ? '+' : ''}{kpis.savings_vs_target_delta} pts
          {:else}
            % del mes (ingreso − gasto) · meta {kpis?.savings_target_percent ?? profile?.savings_target_percent ?? '—'}%
          {/if}
        </p>
      </article>

      <article class="peek-card">
        <div class="peek-card__icon peek-card__icon--cushion" aria-hidden="true">◇</div>
        <p class="peek-card__label">Colchón</p>
        <p class="peek-card__value">{profile?.cushion_percent ?? '—'}%</p>
        <p class="peek-card__meta">holgura del ingreso</p>
      </article>

      <article class="peek-card" data-tone={emergencyTone}>
        <div class="peek-card__icon peek-card__icon--emergency" aria-hidden="true">⌂</div>
        <p class="peek-card__label">Emergencia</p>
        <p class="peek-card__value">
          {kpis?.emergency_months_approx != null ? `${kpis.emergency_months_approx}` : '—'}
          <span class="peek-card__unit">meses</span>
        </p>
        <p class="peek-card__meta">
          saldo en cuentas de emergencia · meta {profile?.emergency_fund_target_months ?? '—'} meses
        </p>
      </article>

      <article class="peek-card">
        <div class="peek-card__icon peek-card__icon--goals" aria-hidden="true">◎</div>
        <p class="peek-card__label">Metas activas</p>
        <p class="peek-card__value">{activeGoals.length}</p>
        <p class="peek-card__meta">
          {#if activeGoals[0]}
            {activeGoals[0].title}{#if activeGoals.length > 1}
              +{activeGoals.length - 1}{/if}
          {:else}
            sin metas todavía
          {/if}
        </p>
      </article>
    </div>

    {#if activeGoals.length}
      <ul class="peek-goals">
        {#each activeGoals.slice(0, 3) as g (g.id)}
          <li>{g.title}</li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>

<style>
  .peek {
    display: grid;
    gap: 14px;
    padding: 18px;
    border-radius: var(--radius-md);
    background: var(--surface);
    border: 1px solid var(--border-soft);
    box-shadow: var(--shadow-soft);
  }

  .peek__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .peek__eyebrow {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .peek__title {
    margin: 0.15rem 0 0;
    font-size: 1.05rem;
    letter-spacing: -0.02em;
  }

  .peek__actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .peek__link {
    padding: 0.45rem 0.85rem;
    border-radius: 999px;
    background: var(--text-strong);
    color: #fff;
    font-size: 0.8rem;
    font-weight: 700;
    text-decoration: none;
    transition: transform 140ms var(--ease-out);
  }

  .peek__link--ghost {
    background: var(--surface);
    color: var(--text-strong);
    border: 1px solid var(--border-soft);
  }

  .peek__link:active {
    transform: scale(0.97);
  }

  .peek-empty {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem 0.95rem;
    border-radius: var(--radius-sm);
    border: 1px dashed var(--border-soft);
    background: var(--surface-soft);
    text-decoration: none;
    color: inherit;
    transition: transform 140ms var(--ease-out);
  }

  .peek-empty:active {
    transform: scale(0.98);
  }

  .peek-empty__icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 12px;
    background: rgba(79, 70, 229, 0.12);
    color: var(--primary);
    font-weight: 700;
    flex-shrink: 0;
  }

  .peek-empty strong {
    display: block;
  }

  .peek-empty__hint {
    display: block;
    margin-top: 0.15rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .peek-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .peek-card {
    display: grid;
    gap: 2px;
    padding: 14px;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid var(--border-soft);
    min-width: 0;
    transition:
      transform 140ms var(--ease-out),
      border-color 140ms var(--ease-out);
  }

  .peek-card[data-tone='warn'] {
    border-color: rgba(239, 68, 68, 0.35);
  }

  .peek-card[data-tone='good'] {
    border-color: rgba(16, 185, 129, 0.35);
  }

  .peek-card__icon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    margin-bottom: 6px;
    border-radius: 10px;
    font-size: 0.85rem;
    font-weight: 700;
  }

  .peek-card__icon--savings {
    background: rgba(16, 185, 129, 0.12);
    color: var(--success);
  }
  .peek-card__icon--cushion {
    background: rgba(116, 185, 255, 0.16);
    color: #3b82f6;
  }
  .peek-card__icon--emergency {
    background: rgba(245, 158, 11, 0.14);
    color: var(--warning);
  }
  .peek-card__icon--goals {
    background: rgba(79, 70, 229, 0.12);
    color: var(--primary);
  }

  .peek-card__label {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .peek-card__value {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.15;
    font-variant-numeric: tabular-nums;
  }

  .peek-card__unit {
    margin-left: 0.2rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .peek-card__meta {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .peek-goals {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .peek-goals li {
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid var(--border-soft);
    background: var(--surface);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-strong);
  }
</style>
