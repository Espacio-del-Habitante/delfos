/**
 * Parser local de frases de mercado (es-CO). Cero tokens LLM.
 */

import { categorizeProduct } from './categories';

const MONEY_RE =
  /(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:\s*(mil|k))?(?:\s*(?:pesos|cop))?/gi;
const QTY_RE =
  /(\d+(?:[.,]\d+)?)\s*(libras?|lb|kilos?|kg|gramos?|g|unidades?|und|paquetes?|latas?|bolsas?)?/i;

function normalize(text: string) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMoneyToken(raw: string, milSuffix: boolean) {
  let s = String(raw).replace(/\s/g, '').replace(/\./g, '');
  let n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (milSuffix) n *= 1000;
  return n;
}

function extractQty(text: string) {
  const m = text.match(QTY_RE);
  if (!m || m.index == null) return { qty: 1, unit: 'und', raw: null as string | null, span: null as null | { start: number; end: number }, hasUnit: false };
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

function extractMoney(text: string, qtyInfo: ReturnType<typeof extractQty>) {
  const matches = [...text.matchAll(MONEY_RE)];
  if (!matches.length) return { amount: null as number | null, span: null as null | { start: number; end: number } };
  const candidates = matches.filter((m) => {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (qtyInfo?.hasUnit && qtyInfo.span) {
      if (start < qtyInfo.span.end && end > qtyInfo.span.start) return false;
    }
    return true;
  });
  if (!candidates.length) return { amount: null, span: null };
  const m = candidates[candidates.length - 1];
  const amount = parseMoneyToken(m[1], Boolean(m[2]));
  return { amount, span: { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length } };
}

function extractProduct(text: string, qtyRaw: string | null, moneySpan: { start: number; end: number } | null) {
  let t = text;
  if (moneySpan) t = t.slice(0, moneySpan.start) + ' ' + t.slice(moneySpan.end);
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

function intentOf(text: string) {
  if (/\b(listo|ya pague|ya pagué|voy a pagar|a pagar|checkout|termin[eé]|finalizar|cerrar mercado)\b/.test(text)) {
    return 'checkout' as const;
  }
  if (/\b(sincroniza|sincronizar|manda a delfos|enviar a delfos)\b/.test(text)) {
    return 'sync' as const;
  }
  if (/\b(mejor|cambia|cambiar|en vez|en lugar|actualiza|actualizar|reduce|reducir|deja|deje)\b/.test(text)) {
    return 'update' as const;
  }
  if (/\b(quita|quitar|borra|borrar|elimina|eliminar|no llev[eo])\b/.test(text)) {
    return 'remove' as const;
  }
  return 'add' as const;
}

export type ParsedItem = {
  name: string;
  qty: number;
  unit: string;
  amount: number | null;
  category: string;
  /** True si el usuario dijo cantidad/unidad o precio en la frase. */
  qtyExplicit?: boolean;
  amountExplicit?: boolean;
};

export function parseUtterance(input: string) {
  const raw = String(input || '').trim();
  const text = normalize(raw);
  if (!text) return { intent: 'unknown' as const, confidence: 0, raw };

  const intent = intentOf(text);
  if (intent === 'checkout' || intent === 'sync') {
    return { intent, confidence: 0.95, raw };
  }

  const qtyInfo = extractQty(text);
  let { amount, span } = extractMoney(text, qtyInfo);
  let { qty, unit, raw: qtyRaw, hasUnit } = qtyInfo;

  if (amount != null && qtyRaw && !hasUnit && unit === 'und') {
    const qtyNum = Number(String(qtyRaw).replace(/[^\d.,]/g, '').replace(',', '.'));
    if (qtyNum === amount || amount === qtyNum * 1000) {
      qty = 1;
      qtyRaw = null;
    }
  }

  const name = extractProduct(text, qtyRaw, span);
  const category = categorizeProduct(name);
  const item: ParsedItem = {
    name,
    qty,
    unit,
    amount: amount ?? null,
    category,
    qtyExplicit: Boolean(qtyRaw),
    amountExplicit: amount != null,
  };

  if (intent === 'remove') {
    return { intent, item, confidence: name !== 'producto' ? 0.8 : 0.4, raw };
  }
  if (intent === 'update') {
    return { intent, item, confidence: name !== 'producto' ? 0.85 : 0.45, raw };
  }

  let confidence = 0.35;
  if (name !== 'producto' && amount != null) confidence = 0.9;
  else if (name !== 'producto') confidence = 0.78;
  else if (amount != null) confidence = 0.55;
  return { intent: 'add' as const, item, confidence, raw };
}

export function findItemMatches<T extends { id: string; name: string }>(items: T[], name: string, limit = 3) {
  const needle = normalize(name)
    .split(' ')
    .filter((w) => w.length > 2);
  if (!needle.length) return [] as T[];
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
