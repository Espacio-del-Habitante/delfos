/**
 * Smoke: helpers de dock no se rompen en pantallas chicas (safeBottom=0 / 34).
 * Corre: node src/shared/BottomNav.check.mjs
 */
import assert from 'node:assert/strict';

// Mirror de las fórmulas exportadas (sin RN) — si cambian en BottomNav.tsx, actualiza aquí.
const NAV_EDGE_PAD = 16;
const NAV_PILL_HEIGHT = 52;
const BOTTOM_NAV_GAP = 14;
const FAB_SIZE = 56;

function navDockBottom(safeBottom) {
  return NAV_EDGE_PAD + Math.max(safeBottom, 0);
}
function navPillTop(safeBottom) {
  return navDockBottom(safeBottom) + NAV_PILL_HEIGHT;
}
function floatingDockBottom(safeBottom) {
  return navPillTop(safeBottom) + BOTTOM_NAV_GAP;
}
function contentBottomPad(safeBottom, extra = FAB_SIZE + 16) {
  return floatingDockBottom(safeBottom) + extra;
}

assert.equal(navDockBottom(0), 16);
assert.equal(navDockBottom(34), 50);
assert.equal(navPillTop(0), 68);
assert.ok(contentBottomPad(0) > navPillTop(0) + FAB_SIZE, 'list pad debe liberar FAB+nav');
// iPhone SE-ish: altura útil ~667; pad inferior no debe comerse > 40% del alto
const seH = 667;
assert.ok(contentBottomPad(34, FAB_SIZE + 28) < seH * 0.4, 'pad inferior demasiado grande para pantallas chicas');

console.log('BottomNav.check.mjs: ok');
