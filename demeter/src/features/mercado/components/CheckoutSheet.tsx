import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space, field, type, card } from '../../../shared/theme';
import { formatCop } from '../../../shared/format';
import {
  closeTrip,
  getState,
  setCheckout,
  startTrip,
  tripTotal,
  type Trip,
} from '../../../services/store';
import { pickProductPhoto } from '../../../services/pickPhoto';
import { floatingDockBottom } from '../../../shared/BottomNav';

type Props = {
  visible: boolean;
  trip: Trip;
  onClose: () => void;
  onDone: (msg: string) => void;
};

/** Solo cierra y guarda en el teléfono. Sync va aparte (lote de pendientes). */
export function CheckoutSheet({ visible, trip, onClose, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const cart = tripTotal(trip);
  const [ticket, setTicket] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTicket(trip.receipt?.ticketTotal != null ? String(trip.receipt.ticketTotal) : '');
    setPhotoDataUrl(trip.receipt?.photoDataUrl || null);
    setErr(null);
  }, [visible, trip.id]);

  const ticketN = Number(String(ticket).replace(/\D/g, '')) || null;
  const diff = ticketN != null && ticketN > 0 ? ticketN - cart : null;

  async function onPickPhoto() {
    const data = await pickProductPhoto();
    if (data) setPhotoDataUrl(data);
  }

  async function finish() {
    setBusy(true);
    setErr(null);
    try {
      await setCheckout({ ticketTotal: ticketN, photoDataUrl });
      await closeTrip();
      await startTrip({ budget: getState().settings.budgetDefault });
      onDone('Mercado cerrado · sync cuando quieras en Historial o Ajustes');
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
      <View
        style={[
          styles.sheet,
          {
            bottom: floatingDockBottom(insets.bottom),
            maxHeight: '78%',
            paddingBottom: space.md,
          },
        ]}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
        >
          <Text style={styles.title}>Cerrar mercado</Text>
          <Text style={styles.muted}>Carrito {formatCop(cart)}</Text>

          <Text style={styles.label}>Foto de factura</Text>
          <View style={styles.photoRow}>
            <Pressable
              onPress={() => void onPickPhoto()}
              style={({ pressed }) => [styles.photoBtn, pressed && { opacity: 0.9 }]}
              accessibilityRole="button"
              accessibilityLabel="Tomar o elegir foto de la factura"
            >
              <Text style={styles.photoBtnTxt}>
                {photoDataUrl ? 'Cambiar foto' : 'Tomar / elegir foto'}
              </Text>
            </Pressable>
            {photoDataUrl ? (
              <Image source={{ uri: photoDataUrl }} style={styles.photoThumb} />
            ) : null}
          </View>

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
            onPress={() => void finish()}
            style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.9 }]}
            accessibilityRole="button"
            accessibilityLabel="Cerrar y guardar mercado"
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnPrimaryTxt}>Cerrar y guardar</Text>
            )}
          </Pressable>

          <Text style={styles.hint}>
            La sync a Delfos es aparte: puedes acumular meses y enviar todos los pendientes
            desde Historial o Ajustes.
          </Text>

          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelTxt}>Cancelar</Text>
          </Pressable>
        </ScrollView>
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
    padding: space.lg,
  },
  title: { ...type.title, fontSize: 20 },
  muted: { ...type.label },
  label: { ...type.label, marginTop: 4 },
  input: { ...field(), paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  photoBtn: {
    flex: 1,
    ...field(),
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  photoBtnTxt: { fontFamily: 'Inter_600SemiBold', color: colors.primary, fontSize: 14 },
  photoThumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.bg },
  err: { color: colors.danger, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  btnPrimary: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  btnPrimaryTxt: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 },
  hint: { ...type.label, textAlign: 'center' },
  cancel: { alignItems: 'center', paddingVertical: 8 },
  cancelTxt: { color: colors.muted, fontFamily: 'Inter_600SemiBold' },
});
