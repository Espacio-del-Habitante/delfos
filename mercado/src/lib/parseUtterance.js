/**
 * Parser local de frases de mercado (es-CO). Cero tokens LLM.
 * Ej: "compré 3 libras de papa 30 mil" → add
 *     "mejor 2 libras de papa" → update
 *     "listo voy a pagar" → checkout
 */

import { categorizeProduct } from './categories.js';

const MONEY_RE =
  /(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:\s*(mil|k))?(?:\s*(?:pesos|cop))?/gi;
const QTY_RE =
  /(\d+(?:[.,]\d+)?)\s*(libras?|lb|kilos?|kg|gramos?|g|unidades?|und|paquetes?|latas?|bolsas?)?/i;

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMoneyToken(raw, milSuffix) {
  let s = String(raw).replace(/\s/g, '').replace(/\./g, '');
  let n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (milSuffix) n *= 1000;
  return n;
}

function extractQty(text) {
  const m = text.match(QTY_RE);
  if (!m) return { qty: 1, unit: 'und', raw: null, span: null, hasUnit: false };
  const qty = Number(String(m[1]).replace(',', '.'));
  const hasUnit = Boolean(m[2]);
  let unit = (m[2] || 'und').toLowerCase();
  if (unit.startsWith('libra') || unit === 'lb') unit = 'lb';
  else if (unit.startsWith('kilo') || unit === 'kg') unit = 'kg';
  else if (unit.startsWith('gramo') || unit === 'g') unit = 'g';
  else if (unit.startsWith('paquete')) unit = 'paq';
  else if (unit.startsWith('lata')) unit = 'lata';
  else if (unit.startsWith('bolsa')) unit = 'bolsa';
  else unit = 'und';
  return {
    qty: Number.isFinite(qty) ? qty : 1,
    unit,
    raw: m[0],
    span: { start: m.index, end: m.index + m[0].length },
    hasUnit,
  };
}

function extractMoney(text, qtyInfo) {
  const matches = [...text.matchAll(MONEY_RE)];
  if (!matches.length) return { amount: null, span: null };
  const candidates = matches.filter((m) => {
    const start = m.index;
    const end = start + m[0].length;
    // "3 libras…" → el 3 es cantidad, no precio
    if (qtyInfo?.hasUnit && qtyInfo.span) {
      if (start < qtyInfo.span.end && end > qtyInfo.span.start) return false;
    }
    return true;
  });
  if (!candidates.length) return { amount: null, span: null };
  // Prefer the last money mention (price usually at the end).
  const m = candidates[candidates.length - 1];
  const amount = parseMoneyToken(m[1], Boolean(m[2]));
  return { amount, span: { start: m.index, end: m.index + m[0].length } };
}

function extractProduct(text, qtyRaw, moneySpan) {
  let t = text;
  if (moneySpan) {
    t = t.slice(0, moneySpan.start) + ' ' + t.slice(moneySpan.end);
  }
  if (qtyRaw) t = t.replace(qtyRaw, ' ');
  t = t
    .replace(
      /\b(compre|compra|compre|llevo|llevar|añade|anade|agrega|suma|sumale|sumale|quiero|voy a llevar|mejor|cambia|cambiar|reduce|reducir|quita|quitar|borra|borrar|de|del|la|el|un|una|unos|unas)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
  return t || 'producto';
}

function intentOf(text) {
  if (
    /\b(listo|ya pague|ya pagué|voy a pagar|a pagar|checkout|termin[eé]|finalizar|cerrar mercado)\b/.test(
      text,
    )
  ) {
    return 'checkout';
  }
  if (/\b(sincroniza|sincronizar|manda a delfos|enviar a delfos)\b/.test(text)) {
    return 'sync';
  }
  if (
    /\b(mejor|cambia|cambiar|en vez|en lugar|actualiza|actualizar|reduce|reducir|deja|deje)\b/.test(
      text,
    )
  ) {
    return 'update';
  }
  if (/\b(quita|quitar|borra|borrar|elimina|eliminar|no llev[eo])\b/.test(text)) {
    return 'remove';
  }
  return 'add';
}

/**
 * @returns {{
 *  intent: 'add'|'update'|'remove'|'checkout'|'sync'|'unknown',
 *  item?: { name: string, qty: number, unit: string, amount: number|null, category: string },
 *  confidence: number,
 *  raw: string
 * }}
 */
export function parseUtterance(input) {
  const raw = String(input || '').trim();
  const text = normalize(raw);
  if (!text) return { intent: 'unknown', confidence: 0, raw };

  const intent = intentOf(text);
  if (intent === 'checkout' || intent === 'sync') {
    return { intent, confidence: 0.95, raw };
  }

  let qtyInfo = extractQty(text);
  let { amount, span } = extractMoney(text, qtyInfo);
  let { qty, unit, raw: qtyRaw, hasUnit } = qtyInfo;
  // "papa 8000" → precio, no cantidad 8000 und (solo si no hubo unidad explícita).
  if (
    amount != null &&
    qtyRaw &&
    !hasUnit &&
    unit === 'und' &&
    Number(String(qtyRaw).replace(/[^\d.,]/g, '').replace(',', '.')) === amount
  ) {
    qty = 1;
    qtyRaw = null;
  }
  const name = extractProduct(text, qtyRaw, span);
  const category = categorizeProduct(name);

  if (intent === 'remove') {
    return {
      intent: 'remove',
      item: { name, qty, unit, amount: amount ?? null, category },
      confidence: name && name !== 'producto' ? 0.8 : 0.4,
      raw,
    };
  }

  if (intent === 'update') {
    return {
      intent: 'update',
      item: { name, qty, unit, amount: amount ?? null, category },
      confidence: name && name !== 'producto' ? 0.85 : 0.45,
      raw,
    };
  }

  // add — el precio puede llegar después; el nombre basta para sumar.
  let confidence = 0.35;
  if (name !== 'producto' && amount != null) confidence = 0.9;
  else if (name !== 'producto') confidence = 0.78;
  else if (amount != null) confidence = 0.55;
  return {
    intent: 'add',
    item: { name, qty, unit, amount: amount ?? null, category },
    confidence,
    raw,
  };
}

/** Fuzzy match product name against trip items (token overlap). */
export function findItemMatches(items, name, limit = 3) {
  const needle = normalize(name)
    .split(' ')
    .filter((w) => w.length > 2);
  if (!needle.length) return [];
  const scored = items.map((it) => {
    const hay = normalize(it.name);
    let score = 0;
    for (const w of needle) if (hay.includes(w)) score += 1;
    if (hay === normalize(name)) score += 3;
    return { item: it, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}
