<script>
  import { getState, updateSettings } from '../lib/store.js';

  let { onToast = () => {}, onChange = () => {} } = $props();

  let budgetDefault = $state(getState().settings.budgetDefault);
  let delfosApiBase = $state(getState().settings.delfosApiBase);
  let delfosAccountId = $state(getState().settings.delfosAccountId);

  function save() {
    updateSettings({
      budgetDefault: Number(budgetDefault) || 0,
      delfosApiBase: String(delfosApiBase || '').trim(),
      delfosAccountId: String(delfosAccountId || '').trim(),
    });
    onChange();
    onToast('Ajustes guardados');
  }
</script>

<section class="card stack">
  <h2>Ajustes</h2>
  <label class="muted" for="budget">Presupuesto por defecto (COP)</label>
  <input id="budget" class="input" type="number" bind:value={budgetDefault} />

  <label class="muted" for="api">URL de Delfos (para sync)</label>
  <input
    id="api"
    class="input"
    placeholder="https://tu-tunnel.o http://IP:5000"
    bind:value={delfosApiBase}
  />
  <p class="muted">
    En el iPhone, Delfos debe ser alcanzable (tunnel o misma red) y con CORS abierto
    (`FLASK_DEBUG=true` o `DELFOS_CORS_ORIGINS`).
  </p>

  <label class="muted" for="acc">Account id de Delfos (opcional)</label>
  <input id="acc" class="input" placeholder="account_001" bind:value={delfosAccountId} />

  <button class="btn btn--block" onclick={save}>Guardar</button>
</section>

<section class="card">
  <h2>Instalar en iPhone</h2>
  <ol class="muted" style="padding-left:18px;margin:8px 0;line-height:1.5">
    <li>Abre esta URL en Safari.</li>
    <li>Comparte → <strong>Añadir a pantalla de inicio</strong>.</li>
    <li>Dictado pide permiso de micrófono la primera vez.</li>
  </ol>
</section>

<section class="card">
  <h2>Tokens / IA</h2>
  <p class="muted">
    El registro por voz usa Web Speech del teléfono + parser local (sin LLM). La factura se
    contrasta con el total que escribes. OCR con IA queda para después, opcional.
  </p>
</section>
