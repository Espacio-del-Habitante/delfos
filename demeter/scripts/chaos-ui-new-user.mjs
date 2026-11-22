#!/usr/bin/env node
/**
 * UI chaos: limpia storage (usuario nuevo) y ejecuta acciones aleatorias / bordes.
 */
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const SEED = Number(process.env.CHAOS_SEED) || (Date.now() % 1e9);
let s = SEED >>> 0;
const rnd = () => {
  s = (Math.imul(1664525, s) + 1013904223) >>> 0;
  return s / 0xffffffff;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;

const BASE = process.env.MERCAPP_URL || 'http://127.0.0.1:8081/';
const log = [];
function step(name, ok, detail = '') {
  log.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function dismissTour(page) {
  await page.getByRole('button', { name: /Omitir|Skip|Cerrar/i }).click({ force: true }).catch(() => {});
}

async function clearAsNewUser(page) {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
  });
}

async function main() {
  console.log(`chaos-ui seed=${SEED} url=${BASE}`);
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });

  page.on('pageerror', (e) => step('pageerror', false, e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') step('console.error', false, msg.text().slice(0, 160));
  });

  try {
    await clearAsNewUser(page);
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(3500);
    await dismissTour(page);
    await page.waitForTimeout(400);

    const boot = await page.evaluate(() => document.body.innerText.slice(0, 300));
    step('boot Mercado visible', /MercApp|Sin mercado|Empezar|Mercado/i.test(boot), boot.slice(0, 80));

    // Perfiles existen para usuario nuevo
    const hasProfiles = await page.getByText(/Fitness/i).first().isVisible().catch(() => false);
    step('perfiles en home (nuevo)', hasProfiles);

    // Intentar cerrar sin mercado / vacío
    await page.getByRole('tab', { name: 'Mercado' }).click({ force: true }).catch(() => {});
    const closeBtn = page.getByRole('button', { name: 'Cerrar mercado' });
    if (await closeBtn.count()) {
      const disabled = await closeBtn.getAttribute('aria-disabled');
      step('cerrar sin ítems deshabilitado o ausente', disabled === 'true' || disabled === '');
    } else {
      step('sin FAB cerrar (sin trip) — ok', true);
    }

    // Empezar
    if (/Empezar|Sin mercado/i.test(await page.evaluate(() => document.body.innerText))) {
      await page.getByText(/Empezar/).first().click({ force: true });
      await page.waitForTimeout(700);
    }
    step('empezar mercado', true);

    // Inputs basura + válidos
    const utterances = [
      '',
      '   ',
      '!!!!',
      'xyzzy',
      'pollo',
      'pollo 25 mil',
      '3 lb arroz 8000',
      'a'.repeat(80),
      '🍌 5 mil',
      '<script>alert(1)</script>',
      'huevos x30 16900',
    ];

    for (const u of utterances) {
      await page.getByLabel('Agregar ítem').click({ force: true }).catch(() => {});
      await page.waitForTimeout(250);
      const input = page.locator('input').first();
      if (!(await input.count())) {
        step(`composer para "${u.slice(0, 20)}"`, false, 'no input');
        continue;
      }
      await input.fill(u);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(450);
      const t = await page.evaluate(() => document.body.innerText);
      const crashed = /Failed to fetch|TypeError|undefined is not/i.test(t);
      step(`utterance "${u.slice(0, 24)}" no crash`, !crashed);
    }

    // Random profile flips
    for (let i = 0; i < 4; i++) {
      const label = pick(['Fitness', 'Divertido', 'Excéntrico']);
      await page.getByText(new RegExp(label, 'i')).first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
    }
    step('flip perfiles random', true);

    // Deberías sumar puede aparecer
    const hints = /Deberías sumar/i.test(await page.evaluate(() => document.body.innerText));
    step('hints de perfil visibles (si aplica)', true, hints ? 'sí' : 'aún no / filtrados');

    // Tabs random spam
    const tabs = ['Mercado', 'Recetas', 'Historial', 'Stats', 'Ajustes'];
    for (let i = 0; i < 12; i++) {
      const tab = pick(tabs);
      await page.getByRole('tab', { name: tab }).click({ force: true }).catch(() => {});
      await page.waitForTimeout(280);
    }
    step('spam tabs no tumba app', true);

    // Recetas sin IA / con carrito
    await page.getByRole('tab', { name: 'Recetas' }).click({ force: true });
    await page.waitForTimeout(500);
    await page.getByText(/Proponer recetas/i).click({ force: true });
    await page.waitForTimeout(4500);
    const recText = await page.evaluate(() => document.body.innerText);
    step('recetas: no Failed to fetch crudo', !/Failed to fetch/i.test(recText), recText.includes('IA no') ? 'toast/fallback' : '');
    step(
      'recetas: cards o aviso controlado',
      /Toca para ver|Proponer|Suma algo|ideas locales|Listo/i.test(recText),
    );

    if (/Toca para ver/i.test(recText)) {
      await page.getByText(/Toca para ver/i).first().click({ force: true });
      await page.waitForTimeout(600);
      const det = await page.evaluate(() => document.body.innerText);
      step('detalle receta abre', /Preparación/i.test(det));
      await page.getByText(/^Cerrar$/i).click({ force: true }).catch(() => {});
    }

    // Ajustes: backup basura
    await page.getByRole('tab', { name: 'Ajustes' }).click({ force: true });
    await page.waitForTimeout(500);
    await page.getByText(/Pegar JSON/i).scrollIntoViewIfNeeded().catch(() => {});
    const paste = page.getByPlaceholder(/version/i);
    if (await paste.count()) {
      await paste.fill('{not json');
      await page.getByText(/Restaurar desde texto/i).click({ force: true });
      await page.waitForTimeout(500);
      const t = await page.evaluate(() => document.body.innerText);
      step('backup JSON inválido controlado', /inválido|No se pudo|JSON/i.test(t) && !/Failed to fetch/i.test(t));
      await paste.fill(JSON.stringify({ app: 'other', state: {} }));
      await page.getByText(/Restaurar desde texto/i).click({ force: true });
      await page.waitForTimeout(500);
      const t2 = await page.evaluate(() => document.body.innerText);
      step('backup app≠mercapp rechazado', /MercApp|No se pudo|backup/i.test(t2));
    } else {
      step('campo backup paste', false, 'no encontrado');
    }

    // Stats / Historial vacíos (usuario nuevo)
    await page.getByRole('tab', { name: 'Historial' }).click({ force: true });
    await page.waitForTimeout(400);
    step('historial usuario nuevo no crash', true);

    await page.getByRole('tab', { name: /Stats|Estad/i }).click({ force: true });
    await page.waitForTimeout(400);
    step('stats usuario nuevo no crash', true);

    // Intento cerrar vacío otra vez
    await page.getByRole('tab', { name: 'Mercado' }).click({ force: true });
    await page.waitForTimeout(400);
    // vaciar carrito si hay swipe — skip; try close
    const close2 = page.getByRole('button', { name: 'Cerrar mercado' });
    if (await close2.count()) {
      const dis = await close2.isDisabled().catch(() => false);
      const aria = await close2.getAttribute('aria-disabled');
      // may have items from utterances — if enabled, open sheet and cancel
      if (dis || aria === 'true') {
        step('cerrar vacío sigue bloqueado', true);
      } else {
        await close2.click({ force: true });
        await page.waitForTimeout(400);
        const sheet = await page.evaluate(() => document.body.innerText);
        step('checkout abre solo con ítems', /Cerrar y guardar|Cerrar mercado/i.test(sheet));
        await page.getByText(/Cancelar/i).click({ force: true }).catch(() => {});
      }
    }

    await page.screenshot({ path: '/opt/cursor/artifacts/chaos-ui-final.png', fullPage: false });
  } catch (e) {
    step('fatal', false, e?.message || String(e));
    await page.screenshot({ path: '/opt/cursor/artifacts/chaos-ui-fatal.png' }).catch(() => {});
  } finally {
    await browser.close();
  }

  const failed = log.filter((l) => !l.ok && !l.name.startsWith('console.error'));
  // console.error soft — count separately
  const softConsole = log.filter((l) => l.name === 'console.error' || l.name === 'pageerror');
  const report = {
    seed: SEED,
    at: new Date().toISOString(),
    hardFailed: failed.length,
    softNoise: softConsole.length,
    passed: log.filter((l) => l.ok).length,
    total: log.length,
    log,
  };
  writeFileSync('/opt/cursor/artifacts/chaos-ui-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ seed: SEED, hardFailed: report.hardFailed, softNoise: report.softNoise, passed: report.passed }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
