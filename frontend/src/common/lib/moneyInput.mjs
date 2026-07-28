/** es-CO money display/parse: 1.880.000,50 ↔ 1880000.5 */

export function formatMoneyInput(value, maxFractionDigits = 2) {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const hasDecimals = Math.abs(n % 1) > 1e-9;
  return n.toLocaleString('es-CO', {
    minimumFractionDigits: hasDecimals ? Math.min(2, maxFractionDigits) : 0,
    maximumFractionDigits: maxFractionDigits,
  });
}

/** Live typing mask: digits + optional decimal comma; thousand dots while typing. */
export function formatMoneyTyping(raw, maxFractionDigits = 2) {
  const t = String(raw ?? '').replace(/[^\d,]/g, '');
  if (!t) return '';

  const comma = t.indexOf(',');
  let intDigits;
  let fracDigits = '';
  let keepComma = false;

  if (comma >= 0) {
    keepComma = true;
    intDigits = t.slice(0, comma).replace(/\D/g, '');
    fracDigits = t
      .slice(comma + 1)
      .replace(/\D/g, '')
      .slice(0, maxFractionDigits);
  } else {
    intDigits = t.replace(/\D/g, '');
  }

  intDigits = intDigits.replace(/^0+(?=\d)/, '');
  const intFormatted = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return keepComma ? `${intFormatted},${fracDigits}` : intFormatted;
}

/** Map caret so digit/comma rank left of caret is preserved after reformat. */
export function caretAfterMoneyFormat(before, caret, after) {
  const pos = Math.max(0, Math.min(Number(caret) || 0, before.length));
  let rank = 0;
  for (let i = 0; i < pos; i++) {
    const c = before[i];
    if (c === ',' || (c >= '0' && c <= '9')) rank++;
  }
  if (rank === 0) return 0;

  let seen = 0;
  for (let i = 0; i < after.length; i++) {
    const c = after[i];
    if (c === ',' || (c >= '0' && c <= '9')) {
      seen++;
      if (seen === rank) return i + 1;
    }
  }
  return after.length;
}

export function parseMoneyInput(raw) {
  const t = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/\$/g, '');
  if (!t || t === '-' || t === ',' || t === '.') return null;

  let s = t;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      // 1.880.000,50
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,880,000.50
      s = s.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    s = s.replace(',', '.');
  } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // 1.880.000 thousands
    s = s.replace(/\./g, '');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
