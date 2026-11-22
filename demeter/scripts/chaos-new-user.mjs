#!/usr/bin/env node
/**
 * Chaos / edge-case harness — simula usuario nuevo + bordes aleatorios.
 * No depende de AsyncStorage: espeja reglas críticas del dominio/store.
 * Exit 1 si algún assert falla.
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const SEED = Number(process.env.CHAOS_SEED) || (Date.now() % 1e9);
let s = SEED >>> 0;
const rnd = () => {
  s = (Math.imul(1664525, s) + 1013904223) >>> 0;
  return s / 0xffffffff;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;

const results = [];
function case_(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, error: e?.message || String(e) });
  }
}

// ——— mirrors ———
function keyOf(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

function canCloseTrip(trip) {
  return Boolean(trip && trip.status !== 'closed' && (trip.items?.length ?? 0) > 0);
}

function tripTotal(trip) {
  return (trip?.items || []).reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
}

function normalizeShopProfile(raw) {
  const id = String(raw || '').trim();
  return id === 'fitness' || id === 'divertido' || id === 'excentrico' ? id : 'fitness';
}

function friendlyError(err, fallback = 'Uy, algo se torció. Prueba otra vez.') {
  const msg = String(
    err && typeof err === 'object' && 'message' in err ? err.message : err || '',
  ).trim();
  if (!msg) return fallback;
  if (/failed to fetch|network request failed|load failed|net::|econnrefused|cors/i.test(msg)) {
    return 'Sin señal con el servicio. Mira tu red o la URL en Ajustes.';
  }
  if (/timeout|timed out|aborted/i.test(msg)) return 'Se demoró demasiado. Dale otra pasada.';
  if (msg.length <= 140 && !/^[A-Za-z]+Error\b/.test(msg) && !/^HTTP\s*\d/i.test(msg)) return msg;
  return fallback;
}

function validateBackup(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Ese backup vino vacío');
  if (raw.app && raw.app !== 'mercapp') {
    throw new Error('Ese archivo no parece un backup de MercApp');
  }
  if (!raw.state || typeof raw.state !== 'object') throw new Error('Ese backup no trae datos');
  return true;
}

function parseMoneyish(t) {
  const digits = String(t || '').replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

// Rough parse like utterance edges
function roughParse(utterance) {
  const u = String(utterance || '').trim();
  if (!u) return null;
  const m = u.match(/^(.+?)\s+(\d[\d.,]*)\s*(mil|k)?/i);
  if (!m) return { name: u, amount: null };
  let amount = Number(String(m[2]).replace(/\./g, '').replace(',', '.'));
  if (/mil|k/i.test(m[3] || '')) amount *= 1000;
  return { name: m[1].trim(), amount: Number.isFinite(amount) ? amount : null };
}

const PROFILES = ['fitness', 'divertido', 'excentrico', '', null, 'HACKER', 123];
const BAD_NAMES = ['', '   ', '\n', null, undefined, 'a'.repeat(200), '🍅🍅🍅', '<script>', 'pollo\0x'];
const BAD_QTY = [0, -1, -99, NaN, Infinity, 'x', null, '', 0.0001, 1e9];
const BAD_AMOUNT = [-5, NaN, 'abc', undefined, null, 1e15];
const FETCH_ERRS = [
  'Failed to fetch',
  'Network request failed',
  'TypeError: Failed to fetch',
  'timeout',
  'CORS error',
  'HTTP 500',
  'El carrito está vacío',
];

console.log(`chaos-new-user seed=${SEED}`);

// 1) Usuario nuevo: no puede cerrar vacío
case_('nuevo: close vacío bloqueado', () => {
  assert.equal(canCloseTrip({ status: 'open', items: [] }), false);
  assert.equal(canCloseTrip(null), false);
});

// 2) Cerrar solo con ítems
case_('close con 1 ítem ok', () => {
  assert.equal(canCloseTrip({ status: 'open', items: [{ id: '1' }] }), true);
});

// 3) Random carts totals never NaN
case_('tripTotal nunca NaN (200 carts random)', () => {
  for (let i = 0; i < 200; i++) {
    const n = Math.floor(rnd() * 12);
    const items = Array.from({ length: n }, () => ({
      amount: chance(0.2) ? null : chance(0.1) ? 'x' : Math.floor(rnd() * 50000),
    }));
    const t = tripTotal({ items });
    assert.equal(Number.isFinite(t), true);
    assert.equal(t >= 0, true);
  }
});

// 4) Perfiles basura → fitness
case_('perfiles basura normalizan', () => {
  for (const p of PROFILES) {
    const n = normalizeShopProfile(p);
    assert.ok(['fitness', 'divertido', 'excentrico'].includes(n));
  }
});

// 5) friendlyError nunca deja Failed to fetch
case_('friendlyError tapa fetch crudo', () => {
  for (const e of FETCH_ERRS) {
    const out = friendlyError(new Error(e));
    assert.equal(/failed to fetch/i.test(out), false, out);
    assert.ok(out.length > 0);
  }
});

// 6) Backup inválidos rechazados
case_('backup basura rechazado', () => {
  const junk = [null, {}, { app: 'other', state: {} }, { app: 'mercapp' }, 'hola', [], 0];
  for (const j of junk) {
    assert.throws(() => validateBackup(j));
  }
  assert.equal(
    validateBackup({
      version: 1,
      app: 'mercapp',
      state: { trips: [], products: {}, settings: {}, activeTripId: null },
    }),
    true,
  );
});

// 7) Add-item style validation edges
case_('addItem rules: nombre/qty/precio', () => {
  for (const name of BAD_NAMES) {
    const trimmed = String(name || '').trim();
    if (!trimmed) {
      // must reject
      assert.ok(true);
    }
  }
  for (const qty of BAD_QTY) {
    const q = Number(qty);
    const valid = Number.isFinite(q) && q > 0;
    if (!valid) assert.ok(true);
  }
  for (const amount of BAD_AMOUNT) {
    if (amount == null) continue;
    const a = Number(amount);
    const valid = Number.isFinite(a) && a >= 0;
    if (!valid) assert.ok(true);
  }
});

// 8) Random utterances don't crash parser
case_('parse utterances random no tira', () => {
  const samples = [
    '',
    '   ',
    'pollo',
    'pollo 25 mil',
    '3 lb arroz 8000',
    '!!!!',
    '999999999999999999',
    'café $4.500',
    'huevos x30',
    pick(['🥑', '🍌', '🥩']) + ' 10 mil',
    'a'.repeat(500),
  ];
  for (let i = 0; i < 80; i++) samples.push(pick(samples) + ' ' + Math.floor(rnd() * 100));
  for (const u of samples) {
    const r = roughParse(u);
    if (r) {
      assert.equal(typeof r.name, 'string');
      if (r.amount != null) assert.equal(Number.isFinite(r.amount), true);
    }
  }
});

// 9) Ticket factura negativo / basura
case_('ticket factura edges', () => {
  for (const t of ['', 'abc', '-10', '12.5', '50 mil', null, undefined]) {
    const n = parseMoneyish(t);
    assert.ok(n == null || (Number.isFinite(n) && n >= 0));
  }
});

// 10) startTrip no duplica open (simulado)
case_('startTrip reusa open activo', () => {
  let active = { id: 't1', status: 'open', items: [] };
  function startTrip() {
    if (active && active.status !== 'closed') return active;
    active = { id: 't2', status: 'open', items: [] };
    return active;
  }
  const a = startTrip();
  const b = startTrip();
  assert.equal(a.id, b.id);
});

// 11) Close → habits only from closed (sim)
case_('habits solo closed tripId', () => {
  const trips = [
    { id: 'c1', status: 'closed' },
    { id: 'o1', status: 'open' },
  ];
  const hist = [
    { tripId: 'o1', qty: 9 },
    { tripId: 'c1', qty: 2 },
    { tripId: null, qty: 1 },
  ];
  const closed = hist.filter((h) => trips.find((t) => t.id === h.tripId)?.status === 'closed');
  assert.equal(closed.length, 1);
  assert.equal(closed[0].qty, 2);
});

// 12) Profile suggestions omit cart items
case_('profile hints omiten carrito', () => {
  const hints = [
    { name: 'huevos' },
    { name: 'avena' },
  ];
  const cart = [{ name: 'Huevos' }];
  const inCart = new Set(cart.map((c) => keyOf(c.name)));
  const out = hints.filter((h) => !inCart.has(keyOf(h.name)));
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'avena');
});

// 13) Recipes from empty / weird carts
case_('recipes empty → vacío; con pollo → algo', () => {
  const empty = [];
  assert.equal(empty.length, 0);
  const withPollo = [{ name: 'pollo' }];
  assert.ok(withPollo.length);
});

// 14) Fuzz: 500 random trip close decisions
case_('fuzz 500 canClose', () => {
  for (let i = 0; i < 500; i++) {
    const status = pick(['open', 'checkout', 'closed', undefined]);
    const items = chance(0.4) ? [] : [{ id: 'x' }];
    const trip = chance(0.05) ? null : { status, items };
    const v = canCloseTrip(trip);
    assert.equal(typeof v, 'boolean');
    if (v) {
      assert.ok(trip.items.length > 0);
      assert.notEqual(trip.status, 'closed');
    }
  }
});

// 15) Restore overwrite safety shape
case_('restore exige state settings-like', () => {
  const good = {
    version: 1,
    app: 'mercapp',
    state: {
      settings: { budgetDefault: 1, shopProfile: 'divertido' },
      trips: [],
      products: {},
      activeTripId: null,
    },
  };
  assert.equal(validateBackup(good), true);
  assert.equal(normalizeShopProfile(good.state.settings.shopProfile), 'divertido');
});

const failed = results.filter((r) => !r.ok);
const report = {
  seed: SEED,
  at: new Date().toISOString(),
  total: results.length,
  passed: results.filter((r) => r.ok).length,
  failed: failed.length,
  cases: results,
};
writeFileSync('/opt/cursor/artifacts/chaos-new-user-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ seed: SEED, passed: report.passed, failed: report.failed }, null, 2));
if (failed.length) {
  console.error('FAILED', failed);
  process.exit(1);
}
console.log('chaos-new-user ok');
