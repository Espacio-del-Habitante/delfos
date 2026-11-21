<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { getState, updateSettings } from '../../../../lib/store.js';

  const dispatch = createEventDispatcher<{
    change: void;
    toast: { message: string; type?: 'success' | 'error' | 'info' };
  }>();

  let budgetDefault = getState().settings.budgetDefault;
  let delfosApiBase = getState().settings.delfosApiBase;
  let delfosAccountId = getState().settings.delfosAccountId;

  function save() {
    updateSettings({
      budgetDefault: Number(budgetDefault) || 0,
      delfosApiBase: String(delfosApiBase || '').trim(),
      delfosAccountId: String(delfosAccountId || '').trim(),
    });
    dispatch('change');
    dispatch('toast', { message: 'Ajustes guardados', type: 'success' });
  }
</script>

<div class="mercado-stack">
  <section class="manual-card">
    <h2 class="card-title" style="margin-top:0">Ajustes</h2>
    <form
      class="manual-form"
      on:submit|preventDefault={save}
    >
      <label class="muted" for="budget">Presupuesto por defecto (COP)</label>
      <input id="budget" type="number" bind:value={budgetDefault} />

      <label class="muted" for="api" style="margin-top:8px;display:block">URL de Delfos (sync)</label>
      <input id="api" type="url" placeholder="https://tu-tunnel o http://IP:5000" bind:value={delfosApiBase} />
      <p class="muted" style="margin:8px 0 0">
        Delfos debe ser alcanzable desde el iPhone y con CORS (`FLASK_DEBUG` o `DELFOS_CORS_ORIGINS`).
      </p>

      <label class="muted" for="acc" style="margin-top:8px;display:block">Account id (opcional)</label>
      <input id="acc" type="text" placeholder="account_001" bind:value={delfosAccountId} />

      <div class="quick-entry-card__actions">
        <button type="submit" class="primary-button">Guardar</button>
      </div>
    </form>
  </section>

  <section class="manual-card">
    <h2 class="card-title" style="margin-top:0">Instalar en iPhone</h2>
    <ol class="muted" style="margin:0;padding-left:18px;line-height:1.55">
      <li>Abre esta URL en Safari.</li>
      <li>Compartir → <strong>Añadir a pantalla de inicio</strong>.</li>
      <li>El micrófono pide permiso la primera vez que dictas.</li>
    </ol>
  </section>

  <section class="manual-card">
    <h2 class="card-title" style="margin-top:0">Tokens / IA</h2>
    <p class="muted" style="margin:0">
      Dictado = Web Speech del teléfono + parser local. La factura se contrasta con el total que escribes.
      OCR con visión queda opcional y aparte.
    </p>
  </section>
</div>
