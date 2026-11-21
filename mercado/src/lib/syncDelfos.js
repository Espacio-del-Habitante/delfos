import { tripTotal } from './store.js';

/**
 * Sync a closed/checkout trip as one Delfos expense.
 * Requires Delfos API reachable + CORS (debug or DELFOS_CORS_ORIGINS).
 */
export async function syncTripToDelfos(trip, settings) {
  const base = String(settings.delfosApiBase || '').replace(/\/$/, '');
  if (!base) {
    throw new Error('Configura la URL de Delfos en Ajustes');
  }
  const total = trip.receipt?.ticketTotal != null ? Number(trip.receipt.ticketTotal) : tripTotal(trip);
  if (!total || total <= 0) throw new Error('El total del mercado es 0');

  const body = {
    amount: total,
    currency: settings.currency || 'COP',
    description: `Deméter · ${trip.storeName || 'Mercado'} · ${trip.items.length} ítems`,
    category: 'Mercado',
    payment_method: 'other',
    account_id: settings.delfosAccountId || null,
    date: (trip.closedAt || trip.createdAt || new Date().toISOString()).slice(0, 10),
  };

  const res = await fetch(`${base}/api/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Delfos HTTP ${res.status}`);
  }
  return { expense: data.expense || data, payload: data };
}
