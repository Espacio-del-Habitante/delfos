import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, radius, space, softRaised, softInset, softPressed, type } from '../theme';
import { formatCop, formatQty } from '../lib/format';
import { categoryMeta } from '../lib/categories';
import { parseUtterance, findItemMatches } from '../lib/parseUtterance';
import {
  initStore,
  subscribe,
  getActiveTrip,
  getState,
  startTrip,
  addItem,
  updateItem,
  removeItem,
  tripTotal,
  closeTrip,
  findCartItemByName,
  lastPriceFor,
  getProducts,
  type CartItem,
  type Trip,
} from '../lib/store';
import {
  startListening,
  stopListening,
  speechAvailable,
  useSpeechRecognitionEvent,
} from '../lib/speech';
import { ItemEditSheet } from '../components/ItemEditSheet';

export function MercadoScreen() {
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const [draft, setDraft] = useState('');
  const [listening, setListening] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<CartItem | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const applyTextRef = useRef<(text: string) => Promise<void>>(async () => {});

  useEffect(() => {
    void initStore().then(() => setReady(true));
    return subscribe(() => setTick((n) => n + 1));
  }, []);

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('result', (ev) => {
    const text = ev.results?.[0]?.transcript?.trim();
    if (!text) return;
    setDraft(text);
    if (ev.isFinal) {
      void applyTextRef.current(text).then(() => setDraft(''));
    }
  });
  useSpeechRecognitionEvent('error', (ev) => {
    setListening(false);
    const code = ev.error || '';
    if (code === 'aborted') return;
    showToast(
      code === 'not-allowed'
        ? 'Micrófono bloqueado'
        : code === 'no-speech'
          ? 'No detecté voz'
          : 'Dictado no disponible — escribe',
    );
  });

  const trip = useMemo(() => {
    tick;
    return getActiveTrip();
  }, [tick]);

  const total = tripTotal(trip);
  const budget = Number(trip?.budget) || 0;
  const pct = budget > 0 ? Math.min(100, Math.round((total / budget) * 100)) : 0;
  const over = budget > 0 && total > budget;

  const recent = useMemo(() => {
    tick;
    return Object.values(getProducts())
      .filter((p) => (p.priceHistory || []).length)
      .sort((a, b) =>
        String(b.priceHistory.at(-1)?.date || '').localeCompare(
          String(a.priceHistory.at(-1)?.date || ''),
        ),
      )
      .slice(0, 6);
  }, [tick]);

  async function ensureTrip(): Promise<Trip> {
    const t = getActiveTrip();
    if (t && t.status !== 'closed') return t;
    return startTrip({ budget: getState().settings.budgetDefault });
  }

  async function commitAdd(parsedItem: {
    name: string;
    qty: number;
    unit: string;
    amount: number | null;
    category: string;
  }) {
    await ensureTrip();
    const item = { ...parsedItem };
    const prev = lastPriceFor(item.name);
    if (item.amount == null && prev) {
      item.amount = prev.amountFor(Number(item.qty) || 1);
      if (!item.unit || item.unit === 'und') item.unit = prev.unit;
    }
    const qty = Number(item.qty) || 1;
    const unit = item.unit || 'und';
    const existing = findCartItemByName(item.name);
    if (existing) {
      const sameUnit = (existing.unit || 'und') === unit;
      const nextQty = sameUnit ? Number(existing.qty) + qty : qty;
      await updateItem(existing.id, {
        qty: nextQty,
        unit: sameUnit ? existing.unit : unit,
        amount: item.amount ?? existing.amount,
        category: existing.category || item.category,
      });
      showToast(`+ ${existing.name}`);
    } else {
      await addItem({
        name: item.name,
        qty,
        unit,
        amount: item.amount ?? null,
        category: item.category || 'otros',
      });
      showToast(`Sumé ${item.name}`);
    }
  }

  async function applyText(text: string) {
    const parsed = parseUtterance(text);
    if (parsed.intent === 'unknown' || parsed.confidence < 0.35) {
      showToast('No entendí. Ej: “papa 8 mil”');
      return;
    }
    if (parsed.intent === 'checkout') {
      showToast('Cierra el mercado cuando termines');
      return;
    }
    if (parsed.intent === 'sync') {
      showToast('Sync con Delfos llega en una próxima versión');
      return;
    }

    const t = await ensureTrip();

    if (parsed.intent === 'add' && parsed.item) {
      await commitAdd(parsed.item);
      return;
    }

    if (!parsed.item) return;
    const matches = findItemMatches(t.items, parsed.item.name);
    if (!matches.length) {
      if (parsed.intent === 'update') {
        await commitAdd(parsed.item);
        return;
      }
      showToast('No está en el carrito');
      return;
    }
    const m = matches[0];
    if (parsed.intent === 'remove') {
      await removeItem(m.id);
      showToast('Quitado');
      return;
    }
    await updateItem(m.id, {
      qty: parsed.item.qty ?? m.qty,
      unit: parsed.item.unit || m.unit,
      amount: parsed.item.amount ?? m.amount,
    });
    showToast(`Actualicé ${m.name}`);
  }

  applyTextRef.current = applyText;

  async function submitDraft() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await applyText(text);
  }

  async function onMic() {
    if (listening) {
      stopListening();
      return;
    }
    try {
      if (!speechAvailable()) {
        showToast('Dictado no disponible — escribe');
        return;
      }
      setDraft('');
      showToast('Escuchando…');
      await startListening('es-CO');
    } catch (e: any) {
      showToast(e?.message || 'Error de micrófono');
      setListening(false);
    }
  }

  async function onStart() {
    await startTrip({ budget: getState().settings.budgetDefault });
    showToast('Mercado abierto');
  }

  async function onFinish() {
    Alert.alert('Cerrar mercado', '¿Cerrar y empezar otro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await closeTrip();
            await startTrip({ budget: getState().settings.budgetDefault });
            showToast('Mercado cerrado');
          })();
        },
      },
    ]);
  }

  async function quickAdd(product: { name: string; category: string; priceHistory: any[] }) {
    const last = product.priceHistory.at(-1);
    const qty = Number(last?.qty) || 1;
    const unit = last?.unit || 'und';
    const amount =
      last?.unitPrice != null ? Math.round(Number(last.unitPrice) * qty) : last?.amount ?? null;
    await commitAdd({
      name: product.name,
      qty,
      unit,
      amount,
      category: product.category || 'otros',
    });
  }

  if (!ready) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const items = [...(trip?.items || [])].reverse();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <StatusBar style="dark" />

      <View style={styles.brandRow}>
        <View style={styles.logoMark}>
          <Text style={styles.logoGlyph}>🌿</Text>
        </View>
        <Text style={styles.brand}>Deméter</Text>
      </View>

      {!trip ? (
        <View style={[styles.card, styles.center, { margin: space.lg, padding: space.xl }]}>
          <Text style={styles.emptyIcon}>🛒</Text>
          <Text style={styles.emptyTitle}>Sin mercado abierto</Text>
          <Text style={styles.emptyText}>Un toque y empiezas a sumar.</Text>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
            onPress={onStart}
          >
            <Text style={styles.primaryBtnTxt}>Empezar</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Total</Text>
            <Text style={[styles.heroAmount, over && styles.heroAmountOver]}>{formatCop(total)}</Text>
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>Presupuesto</Text>
                <Text style={styles.heroStatValue}>{formatCop(budget)}</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>Ítems</Text>
                <Text style={styles.heroStatValue}>{trip.items.length}</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>Usado</Text>
                <Text style={styles.heroStatValue}>{pct}%</Text>
              </View>
            </View>
          </View>

          {!!recent.length && !trip.items.length && (
            <View style={styles.chipsBlock}>
              <Text style={styles.chipsLabel}>Recientes</Text>
              <View style={styles.chipsRow}>
                {recent.map((p) => {
                  const meta = categoryMeta(p.category);
                  return (
                    <Pressable
                      key={p.name}
                      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                      onPress={() => void quickAdd(p)}
                    >
                      <Text style={styles.chipTxt}>
                        {meta.emoji}  {p.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <FlatList
            data={items}
            keyExtractor={(it) => it.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={[styles.card, styles.center, { padding: space.xl }]}>
                <Text style={styles.emptyIcon}>🧺</Text>
                <Text style={styles.emptyTitle}>Carrito vacío</Text>
                <Text style={styles.emptyText}>Escribe o dicta abajo — se suma al toque.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const meta = categoryMeta(item.category);
              return (
                <Pressable
                  style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                  onPress={() => setEditItem(item)}
                >
                  <View style={styles.itemIcon}>
                    <Text style={styles.itemEmoji}>{meta.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemMeta}>
                      {formatQty(item.qty, item.unit)} · {meta.label}
                    </Text>
                  </View>
                  <Text style={[styles.itemAmt, item.amount == null && styles.itemAmtMissing]}>
                    {item.amount == null ? '—' : formatCop(item.amount)}
                  </Text>
                </Pressable>
              );
            }}
            ListFooterComponent={
              <Pressable
                style={({ pressed }) => [styles.payRow, pressed && styles.itemPressed]}
                onPress={onFinish}
              >
                <Text style={styles.payTitle}>Cerrar mercado</Text>
              </Pressable>
            }
          />
        </>
      )}

      {trip && (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.composerRow}>
            <TextInput
              style={styles.composerInput}
              value={draft}
              onChangeText={setDraft}
              placeholder={listening ? 'Escuchando…' : 'papa 8 mil'}
              placeholderTextColor={colors.muted}
              returnKeyType="done"
              onSubmitEditing={() => void submitDraft()}
              editable={!listening}
            />
            <Pressable
              style={({ pressed }) => [
                styles.mic,
                listening && styles.micOn,
                pressed && styles.micPressed,
              ]}
              onPress={() => void onMic()}
              accessibilityLabel={listening ? 'Detener dictado' : 'Dictar'}
            >
              <Text style={[styles.micIcon, listening && styles.micIconOn]}>
                {listening ? '■' : 'Mic'}
              </Text>
            </Pressable>
          </View>
          {listening && <Text style={styles.listenHint}>Escuchando — toca para cortar</Text>}
        </View>
      )}

      {toast && (
        <View style={[styles.toast, { top: insets.top + 56 }]}>
          <Text style={styles.toastTxt}>{toast}</Text>
        </View>
      )}

      <ItemEditSheet
        item={editItem}
        visible={!!editItem}
        onClose={() => setEditItem(null)}
        onSave={(patch) => {
          if (!editItem) return;
          void updateItem(editItem.id, patch).then(() => {
            setEditItem(null);
            showToast('Guardado');
          });
        }}
        onRemove={(id) => {
          void removeItem(id).then(() => {
            setEditItem(null);
            showToast('Quitado');
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: space.xl,
    marginBottom: space.lg,
  },
  logoMark: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...softRaised('sm'),
  },
  logoGlyph: { fontSize: 20 },
  brand: { ...type.brand, fontSize: 28 },
  hero: {
    marginHorizontal: space.xl,
    marginBottom: space.lg,
    padding: space.xl,
    borderRadius: radius.lg,
    ...softRaised('md'),
  },
  heroLabel: { ...type.label },
  heroAmount: {
    ...type.brand,
    fontSize: 36,
    marginTop: 6,
    letterSpacing: -1.2,
  },
  heroAmountOver: { color: colors.danger },
  heroStats: { flexDirection: 'row', gap: 12, marginTop: space.lg },
  heroStat: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    ...softInset('sm'),
  },
  heroStatLabel: { ...type.label, fontSize: 10 },
  heroStatValue: {
    color: colors.text,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    marginTop: 4,
    fontSize: 14,
  },
  chipsBlock: { paddingHorizontal: space.xl, marginBottom: space.md },
  chipsLabel: { ...type.label, marginBottom: 12 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...softRaised('sm'),
  },
  chipPressed: { ...softPressed(), transform: [{ scale: 0.97 }] },
  chipTxt: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontWeight: '600' },
  list: { paddingHorizontal: space.xl, paddingBottom: 140, gap: 14 },
  card: {
    borderRadius: radius.lg,
    ...softRaised('md'),
  },
  emptyIcon: { fontSize: 36, marginBottom: 10 },
  emptyTitle: { ...type.title, fontSize: 18 },
  emptyText: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
    fontFamily: 'Inter_400Regular',
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: radius.sm,
    shadowColor: '#2a2f3a',
    shadowOffset: { width: 4, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryBtnPressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
  primaryBtnTxt: { color: '#f7f8fa', fontWeight: '700', fontFamily: 'Inter_700Bold' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: radius.md,
    padding: space.md,
    ...softRaised('sm'),
  },
  itemPressed: { ...softPressed(), transform: [{ scale: 0.985 }] },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...softInset('sm'),
  },
  itemEmoji: { fontSize: 20 },
  itemName: {
    fontWeight: '700',
    color: colors.text,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  itemMeta: { color: colors.muted, fontSize: 13, marginTop: 3, fontFamily: 'Inter_400Regular' },
  itemAmt: {
    fontWeight: '700',
    color: colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  itemAmtMissing: { color: colors.muted, fontWeight: '600' },
  payRow: {
    marginTop: 6,
    borderRadius: radius.md,
    padding: space.lg,
    alignItems: 'center',
    ...softRaised('sm'),
  },
  payTitle: {
    fontWeight: '600',
    color: colors.muted,
    fontFamily: 'Inter_600SemiBold',
  },
  composer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 8,
    borderRadius: radius.lg,
    padding: 12,
    ...softRaised('md'),
  },
  composerRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  composerInput: {
    flex: 1,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
    ...softInset('md'),
  },
  mic: {
    width: 54,
    height: 54,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    ...softRaised('sm'),
  },
  micOn: {
    backgroundColor: colors.micListen,
    shadowColor: colors.micListen,
  },
  micPressed: { transform: [{ scale: 0.97 }] },
  micIcon: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  micIconOn: { color: '#fff' },
  listenHint: {
    marginTop: 10,
    color: colors.danger,
    fontWeight: '600',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.pill,
    ...softRaised('sm'),
  },
  toastTxt: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
});
