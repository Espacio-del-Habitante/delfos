<script lang="ts">
  import { formatMultiCurrency } from '@common/lib/formatters';
  import type { Summary } from '@common/lib/types';

  export let summary: Summary | null = null;
</script>

<section
  class="hero-card"
  class:hero-card--empty={!summary?.has_data}
  aria-label="Resumen financiero"
  id="resumen"
>
  {#if summary?.balances_by_currency && Object.keys(summary.balances_by_currency).length}
    <p class="hero-card__label">Balance por moneda</p>
    <div class="balances-row">
      {#each Object.entries(summary.balances_by_currency) as [currency, amount]}
        <div class="balance-pill">
          <span class="balance-pill__label">{currency}</span>
          <span class="balance-pill__value amount">{amount}</span>
        </div>
      {/each}
    </div>
  {:else}
    <p class="hero-card__label">Resumen financiero</p>
    <p class="hero-card__empty-text">
      Delfos está listo para empezar a observar tus finanzas. Crea una cuenta y registra tu primer movimiento.
    </p>
  {/if}
  <div class="hero-card__stats">
    <div>
      <p class="hero-card__stat-label">Gastos del mes</p>
      <p class="hero-card__stat-value amount">{formatMultiCurrency(summary?.monthly_expenses)}</p>
    </div>
    <div>
      <p class="hero-card__stat-label">Inversiones</p>
      <p class="hero-card__stat-value amount">{formatMultiCurrency(summary?.investments_total)}</p>
    </div>
  </div>
  <div class="hero-card__footer">
    <span class="hero-card__status">
      <span class="hero-card__status-dot" aria-hidden="true"></span>
      <span>{summary?.status ?? '—'}</span>
    </span>
    <span class="pill">
      {summary?.total_accounts ?? 0} cuenta{(summary?.total_accounts ?? 0) !== 1 ? 's' : ''}
    </span>
  </div>
</section>

<section class="summary-grid" aria-label="Resumen rápido">
  <article class="summary-card">
    <div class="summary-card__icon summary-card__icon--expense" aria-hidden="true">↓</div>
    <p class="summary-card__label">Gastos</p>
    <p class="summary-card__value amount">{formatMultiCurrency(summary?.monthly_expenses)}</p>
  </article>
  <article class="summary-card">
    <div class="summary-card__icon summary-card__icon--investment" aria-hidden="true">↗</div>
    <p class="summary-card__label">Inversiones</p>
    <p class="summary-card__value amount">{formatMultiCurrency(summary?.investments_total)}</p>
  </article>
  <article class="summary-card">
    <div class="summary-card__icon summary-card__icon--movements" aria-hidden="true">≡</div>
    <p class="summary-card__label">Movimientos</p>
    <p class="summary-card__value">{summary?.total_movements ?? 0}</p>
  </article>
  <article class="summary-card">
    <div class="summary-card__icon summary-card__icon--note" aria-hidden="true">✎</div>
    <p class="summary-card__label">Última nota</p>
    <p class="summary-card__value summary-card__value--small">{summary?.last_note ?? '—'}</p>
  </article>
</section>
