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
import { colors, radius, space, card, field, type } from '../theme';
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
  suggestFromHistory,
  recentHabitSuggestions,
  type CartItem,
  type Trip,
  type HistorySuggestion,
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

  const habits = useMemo(() => {
    tick;
    return recentHabitSuggestions(8).filter((h) => !findCartItemByName(h.name));
  }, [tick]);

  async function ensureTrip(): Promise<Trip> {
    const t = getActiveTrip();
    if (t && t.status !== 'closed') return t;
    return startTrip({ budget: getState().settings.budgetDefault });
  }

  async function commitAdd(
    parsedItem: {
      name: string;
      qty: number;
      unit: string;
      amount: number | null;
      category: string;
      qtyExplicit?: boolean;
      amountExplicit?: boolean;
    },
    opts?: { fromHabit?: boolean },
  ) {
    await ensureTrip();
    const item = { ...parsedItem };
    const habit = suggestFromHistory(item.name);
    const bare = !item.qtyExplicit && !item.amountExplicit;

    // Solo nombre → llena qty/unidad/precio como el mes pasado / última vez.
    if (habit && (bare || opts?.fromHabit)) {
      if (!item.qtyExplicit || opts?.fromHabit) {
        item.qty = habit.qty;
        item.unit = habit.unit;
      }
      if (!item.amountExplicit || opts?.fromHabit) {
        item.amount = habit.amount;
      }
      if (!item.category || item.category === 'otros') item.category = habit.category;
    } else {
      const prev = lastPriceFor(item.name);
      if (item.amount == null && prev) {
        const amt = prev.amountFor(Number(item.qty) || 1);
        if (amt != null) item.amount = amt;
        if (!item.unit || item.unit === 'und') item.unit = prev.unit;
      }
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
      if (habit && (bare || opts?.fromHabit)) showToast(`${habit.label}`);
      else showToast(`Sumé ${item.name}`);
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

  async function quickHabit(h: HistorySuggestion) {
    await commitAdd(
      {
        name: h.name,
        qty: h.qty,
        unit: h.unit,
        amount: h.amount,
        category: h.category,
        qtyExplicit: true,
        amountExplicit: h.amount != null,
      },
      { fromHabit: true },
    );
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
            style={({ pressed }) => [styles.primaryBtn, pressed && { transform: [{ scale: 0.97 }] }]}
            onPress={onStart}
          >
            <Text style={styles.primaryBtnTxt}>Empezar</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Total del carrito</Text>
            <Text style={styles.heroAmount}>{formatCop(total)}</Text>
            <View style={styles.heroStats}>
              <View>
                <Text style={styles.heroStatLabel}>Presupuesto</Text>
                <Text style={styles.heroStatValue}>{formatCop(budget)}</Text>
              </View>
              <View>
                <Text style={styles.heroStatLabel}>Ítems</Text>
                <Text style={styles.heroStatValue}>{trip.items.length}</Text>
              </View>
            </View>
            <View style={styles.heroFooter}>
              <Text style={styles.heroStatus}>
                {over ? 'Sobre presupuesto' : 'Dentro del presupuesto'}
              </Text>
              <View style={styles.pill}>
                <Text style={styles.pillTxt}>{pct}% usado</Text>
              </View>
            </View>
            {budget > 0 && (
              <View style={styles.budgetBar}>
                <View style={[styles.budgetFill, { width: `${pct}%` }, over && styles.budgetOver]} />
              </View>
            )}
          </View>

          {!!habits.length && (
            <View style={styles.chipsBlock}>
              <Text style={styles.chipsLabel}>
                {habits.some((h) => h.source === 'last-month')
                  ? 'Como el mes pasado — un toque'
                  : 'Repetir — un toque'}
              </Text>
              <View style={styles.chipsRow}>
                {habits.map((h) => {
                  const meta = categoryMeta(h.category);
                  return (
                    <Pressable
                      key={h.name}
                      style={({ pressed }) => [styles.chip, pressed && { transform: [{ scale: 0.97 }] }]}
                      onPress={() => void quickHabit(h)}
                    >
                      <Text style={styles.chipTxt}>
                        {meta.emoji}  {h.name}
                      </Text>
                      <Text style={styles.chipMeta}>
                        {h.qty} {h.unit}
                        {h.amount != null ? ` · ${formatCop(h.amount)}` : ''}
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
              <View style={[styles.card, styles.center, { padding: space.lg }]}>
                <Text style={styles.emptyIcon}>🧺</Text>
                <Text style={styles.emptyTitle}>Carrito vacío</Text>
                <Text style={styles.emptyText}>Escribe o dicta abajo — se suma al toque.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const meta = categoryMeta(item.category);
              return (
                <Pressable
                  style={({ pressed }) => [styles.item, pressed && { transform: [{ scale: 0.985 }] }]}
                  onPress={() => setEditItem(item)}
                >
                  <Text style={styles.itemEmoji}>{meta.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemMeta}>
                      {formatQty(item.qty, item.unit)} · {meta.label}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.itemAmt, item.amount == null && styles.itemAmtMissing]}>
                      {item.amount == null ? 'sin precio' : formatCop(item.amount)}
                    </Text>
                    <Text style={styles.itemHint}>tocar</Text>
                  </View>
                </Pressable>
              );
            }}
            ListFooterComponent={
              <Pressable
                style={({ pressed }) => [styles.payRow, pressed && { opacity: 0.85 }]}
                onPress={onFinish}
              >
                <Text style={styles.payTitle}>Cerrar mercado</Text>
                <Text style={styles.payHint}>terminar viaje</Text>
              </Pressable>
            }
          />
        </>
      )}

      {trip && (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.composerRow}>
            <TextInput
              style={styles.composerInput}
              value={draft}
              onChangeText={setDraft}
              placeholder={listening ? 'Escuchando…' : 'papa 8 mil · Enter'}
              placeholderTextColor={colors.muted}
              returnKeyType="done"
              onSubmitEditing={() => void submitDraft()}
              editable={!listening}
            />
            <Pressable
              style={({ pressed }) => [
                styles.mic,
                listening && styles.micOn,
                pressed && { transform: [{ scale: 0.97 }] },
              ]}
              onPress={() => void onMic()}
              accessibilityLabel={listening ? 'Detener dictado' : 'Dictar'}
            >
              <Text style={styles.micIcon}>{listening ? '■' : 'Mic'}</Text>
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
    gap: 10,
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.heroTo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlyph: { fontSize: 18 },
  brand: { ...type.brand, fontSize: 26 },
  hero: {
    marginHorizontal: space.lg,
    marginBottom: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.heroFrom,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 8,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    fontFamily: 'Inter_600SemiBold',
  },
  heroAmount: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 4,
    fontFamily: 'Inter_800ExtraBold',
  },
  heroStats: { flexDirection: 'row', gap: 28, marginTop: 14 },
  heroStatLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '600' },
  heroStatValue: { color: '#fff', fontWeight: '700', marginTop: 2, fontFamily: 'Inter_700Bold' },
  heroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  heroStatus: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  pillTxt: { color: '#fff', fontSize: 12, fontWeight: '600' },
  budgetBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginTop: 14,
    overflow: 'hidden',
  },
  budgetFill: { height: '100%', backgroundColor: colors.soft },
  budgetOver: { backgroundColor: '#fecaca' },
  chipsBlock: { paddingHorizontal: space.lg, marginBottom: space.sm },
  chipsLabel: {
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
    fontFamily: 'Inter_600SemiBold',
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: 'rgba(240, 253, 244, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(27, 122, 74, 0.18)',
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: 200,
  },
  chipTxt: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontWeight: '600' },
  chipMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
  },
  list: { paddingHorizontal: space.lg, paddingBottom: 120, gap: 10 },
  card: {
    ...card(),
  },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyTitle: { ...type.title, fontSize: 18 },
  emptyText: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
    fontFamily: 'Inter_400Regular',
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: radius.pill,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 4,
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '700', fontFamily: 'Inter_700Bold' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...card(),
    padding: space.md,
  },
  itemEmoji: { fontSize: 22 },
  itemName: {
    fontWeight: '700',
    color: colors.text,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  itemMeta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  itemAmt: { fontWeight: '700', color: colors.text, fontFamily: 'Inter_700Bold' },
  itemAmtMissing: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  itemHint: { color: colors.muted, fontSize: 11, marginTop: 2 },
  payRow: {
    marginTop: 8,
    ...card(),
    padding: space.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  payTitle: { fontWeight: '700', color: colors.text, fontFamily: 'Inter_700Bold' },
  payHint: { color: colors.muted },
  composer: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
    ...card(),
    backgroundColor: colors.surfaceSoft,
    padding: 10,
  },
  composerRow: { flexDirection: 'row', gap: 8 },
  composerInput: {
    flex: 1,
    ...field(),
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
  },
  mic: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 4,
  },
  micOn: { backgroundColor: colors.micListen },
  micIcon: { fontSize: 13, color: '#fff', fontWeight: '700', fontFamily: 'Inter_700Bold' },
  listenHint: {
    marginTop: 8,
    color: colors.danger,
    fontWeight: '600',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(18, 36, 26, 0.92)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  toastTxt: { color: '#fff', fontWeight: '600', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
