/** Day-key helpers for date-range filters (YYYY-MM-DD, inclusive). */

export function toDay(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

/** Inclusive calendar-day range. Empty from/to = open bound. */
export function inDateRange(date, from, to) {
  const d = toDay(date);
  const fromDay = toDay(from);
  const toDayVal = toDay(to);
  if (fromDay && (!d || d < fromDay)) return false;
  if (toDayVal && (!d || d > toDayVal)) return false;
  return true;
}
