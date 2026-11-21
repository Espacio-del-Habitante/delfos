export function formatCop(amount) {
  const n = Number(amount) || 0;
  return `$${n.toLocaleString('es-CO')} COP`;
}

export function formatQty(qty, unit) {
  const q = Number(qty);
  const u = unit || 'und';
  if (!Number.isFinite(q)) return `— ${u}`;
  return `${q} ${u}`;
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function todayIso() {
  return new Date().toISOString();
}
