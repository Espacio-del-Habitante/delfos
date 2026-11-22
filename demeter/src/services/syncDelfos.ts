import {
  listTrips,
  markSynced,
  tripTotal,
  type AppSettings,
  type Trip,
} from './store';

/**
 * Sync a closed trip as one Delfos expense.
 * Requires Delfos API reachable + CORS.
 */
export async function syncTripToDelfos(trip: Trip, settings: AppSettings) {
  const base = String(settings.delfosApiBase || '').replace(/\/$/, '');
  if (!base) throw new Error('Configura la URL de Delfos en Ajustes');
  if (trip.status !== 'closed') throw new Error('Solo se sincronizan mercados cerrados');
  if (!(trip.items?.length > 0)) throw new Error('El mercado no tiene ítems');

  const ticket = trip.receipt?.ticketTotal;
  const total =
    ticket != null && Number.isFinite(Number(ticket)) && Number(ticket) > 0
      ? Number(ticket)
      : tripTotal(trip);
  if (!total || total <= 0) throw new Error('El total del mercado es 0');

  const body = {
    amount: total,
    currency: settings.currency || 'COP',
    description: `MercApp · ${trip.storeName || 'Mercado'} · ${trip.items.length} ítems`,
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

/** Cerrados sin sync ok (null o fallido) — pueden acumularse meses. */
export function pendingSyncTrips(): Trip[] {
  return listTrips().filter(
    (t) =>
      t.status === 'closed' &&
      !t.sync?.ok &&
      (t.items?.length ?? 0) > 0 &&
      // total 0 no tiene sentido en Delfos
      (Number(t.receipt?.ticketTotal) > 0 || tripTotal(t) > 0),
  );
}

export type SyncBatchResult = {
  ok: number;
  fail: number;
  total: number;
  errors: string[];
};

/**
 * Sincroniza todos los mercados pendientes, uno a uno.
 * Si falló uno, sigue con el resto (no pierde el lote).
 */
export async function syncAllPendingToDelfos(
  settings: AppSettings,
): Promise<SyncBatchResult> {
  const pending = pendingSyncTrips();
  const errors: string[] = [];
  let ok = 0;
  let fail = 0;

  for (const trip of pending) {
    const label = trip.storeName || trip.id;
    try {
      const res = await syncTripToDelfos(trip, settings);
      const expenseId = (res.expense as { id?: string } | undefined)?.id;
      await markSynced(trip.id, {
        at: new Date().toISOString(),
        ok: true,
        expenseId,
      });
      ok += 1;
    } catch (e: any) {
      const msg = e?.message || 'sync falló';
      errors.push(`${label}: ${msg}`);
      await markSynced(trip.id, {
        at: new Date().toISOString(),
        ok: false,
        error: msg,
      });
      fail += 1;
    }
  }

  return { ok, fail, total: pending.length, errors };
}
