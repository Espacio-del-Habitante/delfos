import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { colors, radius, space, field, type, card } from '../../../shared/theme';
import { formatCop } from '../../../shared/format';
import {
  closeTrip,
  getState,
  markSynced,
  setCheckout,
  startTrip,
  tripTotal,
  type Trip,
} from '../../../services/store';
import { syncTripToDelfos } from '../../../services/syncDelfos';
import { BOTTOM_NAV_CLEARANCE } from '../../../shared/BottomNav';

type Props = {
  visible: boolean;
  trip: Trip;
  onClose: () => void;
  onDone: (msg: string) => void;
};

export function CheckoutSheet({ visible, trip, onClose, onDone }: Props) {
  const cart = tripTotal(trip);
  const [ticket, setTicket] = useState(
    trip.receipt?.ticketTotal != null ? String(trip.receipt.ticketTotal) : '',
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const settings = getState().settings;
  const canSync = Boolean(settings.delfosApiBase?.trim());

  const ticketN = Number(String(ticket).replace(/\D/g, '')) || null;
  const diff =
    ticketN != null && ticketN > 0 ? ticketN - cart : null;

  async function finish(opts: { sync: boolean }) {
    setBusy(true);
    setErr(null);
    try {
      await setCheckout({ ticketTotal: ticketN });
      let syncMsg = '';
      if (opts.sync) {
        try {
          const res = await syncTripToDelfos(
            { ...trip, receipt: { ...(trip.receipt || {}), ticketTotal: ticketN } },
            getState().settings,
          );
          const expenseId =
            (res.expense as { id?: string } | undefined)?.id || undefined;
          await markSynced(trip.id, {
            at: new Date().toISOString(),
            ok: true,
            expenseId,
          });
          syncMsg = ' · sync ✓';
        } catch (e: any) {
          await markSynced(trip.id, {
            at: new Date().toISOString(),
            ok: false,
            error: e?.message || 'sync falló',
          });
          syncMsg = ` · sync: ${e?.message || 'falló'}`;
        }
      }
      await closeTrip();
      await startTrip({ budget: getState().settings.budgetDefault });
      onDone(`Mercado cerrado${syncMsg}`);
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'No se pudo cerrar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.title}>Cerrar mercado</Text>
        <Text style={styles.muted}>Carrito {formatCop(cart)}</Text>

        <Text style={styles.label}>Total factura (opcional)</Text>
        <TextInput
          style={styles.input}
          value={ticket}
          onChangeText={(t) => setTicket(t.replace(/[^\d]/g, ''))}
          keyboardType="number-pad"
          placeholder="lo que dice la caja"
          placeholderTextColor={colors.muted}
        />
        {diff != null && (
          <Text style={styles.muted}>
            Diff {diff >= 0 ? '+' : ''}
            {formatCop(diff)} vs carrito
          </Text>
        )}

        {err && <Text style={styles.err}>{err}</Text>}

        <Pressable
          disabled={busy}
          onPress={() => void finish({ sync: false })}
          style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.9 }]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryTxt}>Cerrar y guardar</Text>
          )}
        </Pressable>

        {canSync && (
          <Pressable
            disabled={busy}
            onPress={() => void finish({ sync: true })}
            style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.btnSecondaryTxt}>Cerrar y sync a Delfos</Text>
          </Pressable>
        )}

        {!canSync && (
          <Text style={styles.hint}>Para sync, pon la URL de Delfos en Ajustes.</Text>
        )}

        <Pressable onPress={onClose} style={styles.cancel}>
          <Text style={styles.cancelTxt}>Cancelar</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,23,42,0.35)' },
  sheet: {
    ...card(),
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: 24 + BOTTOM_NAV_CLEARANCE,
    padding: space.lg,
    gap: 10,
  },
  title: { ...type.title, fontSize: 20 },
  muted: { ...type.label },
  label: { ...type.label, marginTop: 4 },
  input: { ...field(), paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text },
  err: { color: colors.danger, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  btnPrimary: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  btnPrimaryTxt: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 },
  btnSecondary: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnSecondaryTxt: { color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 14 },
  hint: { ...type.label, textAlign: 'center' },
  cancel: { alignItems: 'center', paddingVertical: 8 },
  cancelTxt: { color: colors.muted, fontFamily: 'Inter_600SemiBold' },
});
