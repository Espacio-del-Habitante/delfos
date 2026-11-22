import { tripTotal, type Trip, type AppSettings } from './store';

/**
 * Sync a closed/checkout trip as one Delfos expense.
 * Requires Delfos API reachable + CORS.
 */
export async function syncTripToDelfos(trip: Trip, settings: AppSettings) {
  const base = String(settings.delfosApiBase || '').replace(/\/$/, '');
  if (!base) throw new Error('Configura la URL de Delfos en Ajustes');

  const ticket = trip.receipt?.ticketTotal;
  const total =
    ticket != null && Number.isFinite(Number(ticket)) && Number(ticket) > 0
      ? Number(ticket)
      : tripTotal(trip);
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
    throw new Error((data as { error?: string }).error || `Delfos HTTP ${res.status}`);
  }
  return { expense: (data as { expense?: unknown }).expense || data, payload: data };
}
