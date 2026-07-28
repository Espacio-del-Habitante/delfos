<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Modal from '@common/atoms/Modal.svelte';
  import AssetSelect from '@common/molecules/AssetSelect.svelte';
  import MoneyInput from '@common/molecules/MoneyInput.svelte';
  import { INVESTMENT_OPERATION_TYPES } from '@common/lib/investmentTypes';
  import { createInvestment } from '@common/lib/api';
  import { applyFinancePayload, finance } from '@common/stores/finance';
  import { showToast } from '@common/lib/toast';
  import { parseMoneyInput } from '@common/lib/moneyInput.mjs';

  export let open = false;

  const dispatch = createEventDispatcher<{ refreshed: void; close: void }>();

  let saving = false;
  let prevOpen = false;
  let assetSelect: AssetSelect;

  function defaultRow() {
    return {
      operation_type: 'buy',
      date: new Date().toISOString().slice(0, 10),
      asset: '',
      quantity: '',
      amount_usd: null as number | null,
      amount_cop: null as number | null,
      unit_price: null as number | null,
      closing_cost: null as number | null,
      pnl_usd: null as number | null,
      total: null as number | null,
    };
  }

  let newRow = defaultRow();

  $: {
    if (open && !prevOpen) newRow = defaultRow();
    prevOpen = open;
  }

  function close() {
    open = false;
    dispatch('close');
  }

  function parseNum(raw: string | number | null | undefined): number | null {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    return parseMoneyInput(String(raw));
  }

  $: investmentAssets = $finance?.investment_assets ?? [];

  async function submitNew(e: Event) {
    e.preventDefault();
    const asset = (await assetSelect?.commit()) ?? newRow.asset.trim();
    newRow.asset = asset;
    if (newRow.operation_type !== 'deposit' && newRow.operation_type !== 'withdrawal' && !asset) {
      showToast('El activo es obligatorio', { type: 'error' });
      return;
    }
    saving = true;
    try {
      const amountUsd = parseNum(newRow.amount_usd);
      const total = parseNum(newRow.total);
      const data = await createInvestment({
        operation_type: newRow.operation_type,
        action: newRow.operation_type,
        date: newRow.date,
        asset: asset,
        quantity: parseNum(newRow.quantity),
        amount_usd: amountUsd,
        amount_cop: parseNum(newRow.amount_cop),
        unit_price: parseNum(newRow.unit_price),
        closing_cost: parseNum(newRow.closing_cost),
        pnl_usd: parseNum(newRow.pnl_usd),
        total,
        amount: total ?? amountUsd ?? 0,
        currency: amountUsd != null ? 'USD' : 'COP',
      });
      applyFinancePayload(data);
      dispatch('refreshed');
      showToast('Fila agregada', { type: 'success' });
      close();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al guardar', { type: 'error' });
    } finally {
      saving = false;
    }
  }
</script>

<Modal bind:open title="Nueva fila" onClose={close}>
  <div class="investment-new-row-modal">
    <p class="muted investment-actions__export-hint">
      Registra una operación manual en el libro de inversiones.
    </p>

    <form class="edit-form" id="investment-new-row-form" on:submit={submitNew}>
      <div class="edit-form__row">
        <label class="edit-form__field">
          Tipo
          <select class="edit-form__input" bind:value={newRow.operation_type}>
            {#each INVESTMENT_OPERATION_TYPES as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </label>
        <label class="edit-form__field">
          Fecha
          <input class="edit-form__input" type="date" bind:value={newRow.date} required />
        </label>
      </div>

      <label class="edit-form__field edit-form__field--full">
        Activo
        <AssetSelect
          bind:this={assetSelect}
          assets={investmentAssets}
          bind:value={newRow.asset}
          required={newRow.operation_type !== 'deposit' && newRow.operation_type !== 'withdrawal'}
        />
      </label>

      <div class="edit-form__row">
        <label class="edit-form__field">
          Cantidad
          <input class="edit-form__input" type="number" bind:value={newRow.quantity} step="any" min="0" />
        </label>
        <label class="edit-form__field">
          Precio unitario
          <MoneyInput class="edit-form__input" bind:value={newRow.unit_price} maxFractionDigits={4} />
        </label>
      </div>

      <div class="edit-form__row">
        <label class="edit-form__field">
          Monto USD
          <MoneyInput class="edit-form__input" bind:value={newRow.amount_usd} />
        </label>
        <label class="edit-form__field">
          Monto COP
          <MoneyInput class="edit-form__input" bind:value={newRow.amount_cop} />
        </label>
      </div>

      <div class="edit-form__row">
        <label class="edit-form__field">
          Costo cierre
          <MoneyInput class="edit-form__input" bind:value={newRow.closing_cost} />
        </label>
        <label class="edit-form__field">
          P/G USD
          <MoneyInput class="edit-form__input" bind:value={newRow.pnl_usd} />
        </label>
      </div>

      <label class="edit-form__field edit-form__field--full">
        Total
        <MoneyInput class="edit-form__input" bind:value={newRow.total} />
      </label>
    </form>
  </div>

  <div slot="footer" class="modal__actions modal__actions-right">
    <button type="button" class="secondary-button" on:click={close}>Cancelar</button>
    <button type="submit" form="investment-new-row-form" class="primary-button" disabled={saving}>
      {saving ? 'Guardando…' : 'Agregar fila'}
    </button>
  </div>
</Modal>
