import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Animated,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Rect, Path, Line } from 'react-native-svg';
import { TourTarget } from '@wrack/react-native-tour-guide';
import { colors, radius, space, card, field, type } from '../../../shared/theme';
import { formatCop, formatQty } from '../../../shared/format';
import { categoryMeta, mergeCategories } from '../../../domain/categories';
import { parseUtterance, findItemMatches } from '../../../domain/parseUtterance';
import { categoryBars, categoryBreakdown, shareBlurb } from '../../../domain/stats';
import {
  initStore,
  subscribe,
  getActiveTrip,
  getState,
  getCustomCategories,
  startTrip,
  addItem,
  updateItem,
  removeItem,
  tripTotal,
  findCartItemByName,
  lastPriceFor,
  suggestFromHistory,
  recentHabitSuggestions,
  getShopProfile,
  setShopProfile,
  getProducts,
  type CartItem,
  type Trip,
  type HistorySuggestion,
} from '../../../services/store';
import { profileBuySuggestions } from '../../../domain/profileSuggest';
import { shopProfileMeta } from '../../../domain/shopProfiles';
import { ProfilePicker } from '../components/ProfilePicker';
import { friendlyError } from '../../../shared/appError';
import {
  startListening,
  stopListening,
  speechAvailable,
  useSpeechRecognitionEvent,
} from '../../../services/speech';
import { ItemEditSheet } from '../components/ItemEditSheet';
import { CheckoutSheet } from '../components/CheckoutSheet';
import { TripStatsSheet } from '../components/TripStatsSheet';
import { SwipeableRow } from '../components/SwipeableRow';
import {
  FAB_SIZE,
  contentBottomPad,
  floatingDockBottom,
} from '../../../shared/BottomNav';

function MicGlyph() {
  // react-native-svg: Image+data-URI SVG no pinta en Android nativo.
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Rect x="9" y="3.5" width="6" height="11" rx="3" fill="none" stroke="#fff" strokeWidth="2.2" />
      <Path d="M6 11.5a6 6 0 0 0 12 0" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <Line x1="12" y1="17.5" x2="12" y2="20.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <Line x1="8" y1="20.5" x2="16" y2="20.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </Svg>
  );
}

function StopGlyph({ color = '#fff' }: { color?: string }) {
  return <View style={[glyph.stop, { backgroundColor: color }]} accessibilityElementsHidden />;
}

const glyph = StyleSheet.create({
  stop: { width: 11, height: 11, borderRadius: 2 },
});

type Props = { onOpenSettings?: () => void };

export function MercadoScreen({ onOpenSettings }: Props) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const compactUi = winH < 700;
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const [draft, setDraft] = useState('');
  const [listening, setListening] = useState(false);
  const micPulse = useRef(new Animated.Value(0)).current;
  const [toast, setToast] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<CartItem | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [tripStatsOpen, setTripStatsOpen] = useState(false);
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null);
  // RN tipado de TextInput cambia por SDK; solo necesitamos .focus()
  const draftRef = useRef<any>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const applyTextRef = useRef<(text: string) => Promise<void>>(async () => {});

  useEffect(() => {
    void initStore().then(() => setReady(true));
    return subscribe(() => setTick((n) => n + 1));
  }, []);

  useSpeechRecognitionEvent('start', () => {
    setListening(true);
    setComposerOpen(true);
  });
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
        ? 'El micrófono está bloqueado · dale permiso'
        : code === 'no-speech'
          ? 'No te oí · prueba otra vez o escribe'
          : 'Dictado no disponible · escribe aquí',
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

  const shopProfile = useMemo(() => {
    void tick;
    return getShopProfile();
  }, [tick]);

  const habits = useMemo(() => {
    tick;
    return recentHabitSuggestions(8).filter((h) => !findCartItemByName(h.name));
  }, [tick]);

  const profileHints = useMemo(() => {
    void tick;
    return profileBuySuggestions(
      shopProfile,
      trip?.items || [],
      getProducts(),
      4,
    ).filter((h) => !findCartItemByName(h.name));
  }, [tick, shopProfile, trip]);

  const liveCats = useMemo(() => {
    void tick;
    const catalog = mergeCategories(getCustomCategories());
    if (!trip?.items?.length) {
      return {
        bars: [] as ReturnType<typeof categoryBars>,
        blurb: null as ReturnType<typeof shareBlurb> | null,
        catalog,
      };
    }
    return {
      bars: categoryBars([trip], catalog),
      blurb: shareBlurb(categoryBreakdown(trip)),
      catalog,
    };
  }, [tick, trip]);

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
      showToast(`Otra vez · ${existing.name}`);
    } else {
      await addItem({
        name: item.name,
        qty,
        unit,
        amount: item.amount ?? null,
        category: item.category || 'otros',
      });
      if (habit && (bare || opts?.fromHabit)) showToast(`${habit.label}`);
      else showToast(`Listo · sumé ${item.name}`);
    }
  }

  async function applyText(text: string) {
    const parsed = parseUtterance(text);
    if (parsed.intent === 'unknown' || parsed.confidence < 0.35) {
      showToast('No te pillé. Prueba: “papa 8 mil”');
      return;
    }
    if (parsed.intent === 'checkout') {
      showToast('Cuando termines, dale a Cerrar compra');
      return;
    }
    if (parsed.intent === 'sync') {
      showToast('Para mandar a Delfos: Historial o Ajustes');
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
      showToast('Eso no está en el carrito todavía');
      return;
    }
    const m = matches[0];
    if (parsed.intent === 'remove') {
      await removeItem(m.id);
      showToast('Fuera del carrito');
      return;
    }
    await updateItem(m.id, {
      qty: parsed.item.qty ?? m.qty,
      unit: parsed.item.unit || m.unit,
      amount: parsed.item.amount ?? m.amount,
    });
    showToast(`Actualizado · ${m.name}`);
  }

  applyTextRef.current = applyText;

  async function submitDraft() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await applyText(text);
  }

  useEffect(() => {
    if (!listening) {
      micPulse.stopAnimation();
      micPulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(micPulse, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(micPulse, { toValue: 0, duration: 850, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, micPulse]);

  function openComposer() {
    setComposerOpen(true);
    setTimeout(() => draftRef.current?.focus(), 80);
  }

  function closeComposer() {
    if (listening) stopListening();
    setComposerOpen(false);
  }

  async function onMic() {
    if (listening) {
      stopListening();
      return;
    }
    try {
      setComposerOpen(true);
      if (!speechAvailable()) {
        showToast('El mic no está disponible · escribe aquí');
        setTimeout(() => draftRef.current?.focus(), 80);
        return;
      }
      setDraft('');
      showToast('Te escucho…');
      await startListening('es-CO');
    } catch (e: unknown) {
      showToast(friendlyError(e, 'El mic se puso tímido. Escribe o reintenta.'));
      setListening(false);
    }
  }

  async function onStart() {
    await startTrip({ budget: getState().settings.budgetDefault });
    showToast('¡Mercado abierto! A sumar');
  }

  function onFinish() {
    const t = getActiveTrip();
    if (!t?.items?.length) {
      showToast('Suma algo antes de cerrar · el carrito está vacío');
      return;
    }
    setCheckoutOpen(true);
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

  async function quickProfileHint(h: {
    name: string;
    qty: number;
    unit: string;
    amount: number | null;
    category: string;
  }) {
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
    showToast(`Sumé · ${shopProfileMeta(shopProfile).label}`);
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

      <View style={[styles.brandRow, compactUi && { marginBottom: 4 }]}>
        <TourTarget id="tour-brand" style={styles.brandTour}>
          <Image
            source={require('../../../../assets/mercapp-logo.png')}
            style={[styles.brandLogo, compactUi && styles.brandLogoCompact]}
            resizeMode="contain"
            accessibilityLabel="MercApp"
          />
        </TourTarget>
        <View style={{ flex: 1 }} />
        {onOpenSettings && (
          <Pressable
            onPress={onOpenSettings}
            style={({ pressed }) => [styles.settingsBtn, pressed && { transform: [{ scale: 0.97 }] }]}
            accessibilityLabel="Ajustes"
            accessibilityRole="button"
          >
            <Text style={styles.settingsTxt}>⚙</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.profileHome}>
        <ProfilePicker
          compact
          value={shopProfile}
          onChange={(id) => {
            void setShopProfile(id).then(() =>
              showToast(shopProfileMeta(id).chip),
            );
          }}
        />
      </View>

      {!trip ? (
        <View style={[styles.card, styles.center, { margin: space.lg, padding: space.xl }]}>
          <Text style={styles.emptyIcon}>🛒</Text>
          <Text style={styles.emptyTitle}>¿Listos para el mercado?</Text>
          <Text style={styles.emptyText}>Abre uno y vamos sumando en el carrito.</Text>
          <TourTarget id="tour-start" style={styles.primaryBtn}>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && { transform: [{ scale: 0.97 }] }]}
              onPress={onStart}
            >
              <Text style={styles.primaryBtnTxt}>¡Empezar!</Text>
            </Pressable>
          </TourTarget>
        </View>
      ) : (
        <FlatList
          style={styles.listFlex}
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={[
            styles.list,
            // Extra aire en pantallas chicas: FAB + píldora tapan el final del listado.
            {
              paddingBottom: contentBottomPad(
                insets.bottom,
                FAB_SIZE + (compactUi ? 48 : 28),
              ),
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <View style={[styles.hero, compactUi && styles.heroCompact]}>
                <Text style={styles.heroLabel}>Vas llevando</Text>
                <Text style={[styles.heroAmount, compactUi && styles.heroAmountCompact]}>
                  {formatCop(total)}
                </Text>
                <View style={[styles.heroStats, compactUi && { marginTop: 8, gap: 18 }]}>
                  <View>
                    <Text style={styles.heroStatLabel}>Presupuesto</Text>
                    <Text style={styles.heroStatValue}>{formatCop(budget)}</Text>
                  </View>
                  <View>
                    <Text style={styles.heroStatLabel}>Ítems</Text>
                    <Text style={styles.heroStatValue}>{trip.items.length}</Text>
                  </View>
                </View>
                <View style={[styles.heroFooter, compactUi && { marginTop: 8 }]}>
                  <Text style={styles.heroStatus}>
                    {over ? 'Uy, te pasaste' : 'Vas bien con el presupuesto'}
                  </Text>
                  <View style={styles.pill}>
                    <Text style={styles.pillTxt}>{pct}% usado</Text>
                  </View>
                </View>
                {budget > 0 && (
                  <View style={[styles.budgetBar, compactUi && { marginTop: 8 }]}>
                    <View
                      style={[styles.budgetFill, { width: `${pct}%` }, over && styles.budgetOver]}
                    />
                  </View>
                )}
              </View>

              {liveCats.bars.length > 0 && (
                <View style={styles.statsBtnRow}>
                  <Pressable
                    onPress={() => setTripStatsOpen(true)}
                    style={({ pressed }) => [styles.statsBtn, pressed && { opacity: 0.75 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Ver estadísticas de este mercado"
                  >
                    <Text style={styles.statsBtnTxt}>Cómo va este mercado</Text>
                  </Pressable>
                </View>
              )}

              {(!!habits.length || !!profileHints.length) && (
                <View style={styles.chipsBlock}>
                  {!!habits.length && (
                    <>
                      <Text style={styles.chipsLabel}>
                        {habits.some((h) => h.source === 'last-month')
                          ? 'Como el mes pasado'
                          : 'Repetir'}
                      </Text>
                      <View style={styles.chipsRow}>
                        {habits.map((h) => {
                          const meta = categoryMeta(h.category, liveCats.catalog);
                          return (
                            <Pressable
                              key={h.name}
                              style={({ pressed }) => [
                                styles.habitCard,
                                compactUi && styles.habitCardCompact,
                                pressed && { transform: [{ scale: 0.985 }] },
                              ]}
                              onPress={() => void quickHabit(h)}
                            >
                              <Text style={styles.habitEmoji}>{meta.emoji}</Text>
                              <View style={styles.habitBody}>
                                <Text style={styles.habitName} numberOfLines={1}>
                                  {h.name}
                                </Text>
                                <Text style={styles.habitMeta} numberOfLines={1}>
                                  {h.qty} {h.unit}
                                </Text>
                                {h.amount != null && (
                                  <Text style={styles.habitAmt} numberOfLines={1}>
                                    {formatCop(h.amount)}
                                  </Text>
                                )}
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}

                  {!!profileHints.length && (
                    <>
                      <Text style={[styles.chipsLabel, habits.length ? { marginTop: 10 } : null]}>
                        Tip · {shopProfileMeta(shopProfile).label}
                      </Text>
                      <View style={styles.chipsRow}>
                        {profileHints.map((h) => {
                          const meta = categoryMeta(h.category, liveCats.catalog);
                          return (
                            <Pressable
                              key={`hint-${h.name}`}
                              style={({ pressed }) => [
                                styles.habitCard,
                                styles.hintCard,
                                compactUi && styles.habitCardCompact,
                                pressed && { transform: [{ scale: 0.985 }] },
                              ]}
                              onPress={() => void quickProfileHint(h)}
                            >
                              <Text style={styles.habitEmoji}>{meta.emoji}</Text>
                              <View style={styles.habitBody}>
                                <Text style={styles.habitName} numberOfLines={1}>
                                  {h.name}
                                </Text>
                                <Text style={styles.habitMeta} numberOfLines={1}>
                                  {h.why}
                                </Text>
                                <Text style={styles.habitAmt} numberOfLines={1}>
                                  {h.qty} {h.unit}
                                  {h.amount != null ? ` · ${formatCop(h.amount)}` : ''}
                                </Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}
                </View>
              )}

              {items.length > 0 ? (
                <Text style={styles.listTitle}>En el carrito</Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={[styles.card, styles.center, { padding: space.lg }]}>
              <Text style={styles.emptyIcon}>🧺</Text>
              <Text style={styles.emptyTitle}>Carrito en cero</Text>
              <Text style={styles.emptyText}>Toca + para escribir o dictar lo que llevas.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = categoryMeta(item.category, liveCats.catalog);
            return (
              <SwipeableRow
                open={swipeOpenId === item.id}
                onOpenChange={(open) => setSwipeOpenId(open ? item.id : null)}
                onPress={() => setEditItem(item)}
                onDelete={() => {
                  void removeItem(item.id).then(() => {
                    setSwipeOpenId(null);
                    showToast(`Quité ${item.name}`);
                  });
                }}
              >
                <View style={styles.item}>
                  <Text style={styles.itemEmoji}>{meta.emoji}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.itemMeta} numberOfLines={1}>
                      {formatQty(item.qty, item.unit)} · {meta.label}
                    </Text>
                  </View>
                  <Text style={[styles.itemAmt, item.amount == null && styles.itemAmtMissing]}>
                    {item.amount == null ? 'sin precio' : formatCop(item.amount)}
                  </Text>
                </View>
              </SwipeableRow>
            );
          }}
        />
      )}

      {trip && (
        <View
          pointerEvents="box-none"
          style={[
            styles.dock,
            {
              bottom: floatingDockBottom(insets.bottom),
              left: Math.max(12, insets.left),
              right: Math.max(12, insets.right),
            },
          ]}
        >
          {composerOpen ? (
            <View style={styles.composer}>
              <View style={styles.composerRow}>
                <Pressable
                  onPress={closeComposer}
                  style={({ pressed }) => [styles.composerClose, pressed && { opacity: 0.75 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar barra de escritura"
                >
                  <Text style={styles.composerCloseTxt}>✕</Text>
                </Pressable>
                <TextInput
                  ref={draftRef}
                  style={styles.composerInput}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={listening ? 'Te escucho…' : 'Ej: papa 8 mil · Enter'}
                  placeholderTextColor={colors.muted}
                  returnKeyType="done"
                  onSubmitEditing={() => void submitDraft()}
                  editable={!listening}
                />
                <View style={styles.micWrap}>
                  {listening && (
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.micPulse,
                        {
                          opacity: micPulse.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.45, 0],
                          }),
                          transform: [
                            {
                              scale: micPulse.interpolate({
                                inputRange: [0, 1],
                                outputRange: [1, 1.35],
                              }),
                            },
                          ],
                        },
                      ]}
                    />
                  )}
                  <Pressable
                    style={({ pressed }) => [
                      styles.mic,
                      listening && styles.micOn,
                      pressed && { transform: [{ scale: 0.96 }] },
                    ]}
                    onPress={() => void onMic()}
                    accessibilityRole="button"
                    accessibilityLabel={listening ? 'Detener dictado' : 'Dictar con la voz'}
                    accessibilityState={{ selected: listening }}
                  >
                    {listening ? <StopGlyph /> : <MicGlyph />}
                  </Pressable>
                </View>
              </View>
              {listening && <Text style={styles.listenHint}>Te escucho · toca para cortar</Text>}
            </View>
          ) : (
            <View style={styles.fabRow}>
              <Pressable
                onPress={onFinish}
                disabled={!trip?.items?.length}
                style={({ pressed }) => [
                  styles.closeFab,
                  compactUi && styles.closeFabCompact,
                  !trip?.items?.length ? styles.closeFabDisabled : null,
                  pressed && trip?.items?.length ? { opacity: 0.92 } : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Cerrar compra"
                accessibilityState={{ disabled: !trip?.items?.length }}
              >
                <Text style={[styles.closeFabTxt, compactUi && { fontSize: 13 }]}>
                  {compactUi ? 'Cerrar' : 'Cerrar compra'}
                </Text>
              </Pressable>
              <Pressable
                onPress={openComposer}
                style={({ pressed }) => [
                  styles.addFab,
                  compactUi && styles.addFabCompact,
                  pressed && { transform: [{ scale: 0.96 }] },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Agregar ítem"
              >
                <Text style={[styles.addFabTxt, compactUi && { fontSize: 26, lineHeight: 28 }]}>+</Text>
              </Pressable>
            </View>
          )}
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
            showToast('Quedó guardado');
          });
        }}
        onRemove={(id) => {
          void removeItem(id).then(() => {
            setEditItem(null);
            showToast('Fuera del carrito');
          });
        }}
      />

      {trip && (
        <CheckoutSheet
          visible={checkoutOpen}
          trip={trip}
          onClose={() => setCheckoutOpen(false)}
          onDone={(msg) => showToast(msg)}
        />
      )}

      <TripStatsSheet
        visible={tripStatsOpen}
        onClose={() => setTripStatsOpen(false)}
        bars={liveCats.bars}
        blurb={liveCats.blurb}
        catalog={liveCats.catalog}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  brandTour: { borderRadius: 16, alignSelf: 'flex-start' },
  brandLogo: { width: 72, height: 68 },
  brandLogoCompact: { width: 56, height: 52 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  profileHome: {
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  hintCard: {
    borderColor: 'rgba(27, 122, 74, 0.35)',
    borderWidth: 1,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  settingsTxt: { fontSize: 18, color: colors.text },
  hero: {
    marginHorizontal: 0,
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
  heroCompact: {
    padding: space.md,
    marginBottom: space.sm,
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
  heroAmountCompact: { fontSize: 28 },
  heroStats: { flexDirection: 'row', gap: 28, marginTop: 14 },
  heroStatLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '600' },
  heroStatValue: { color: '#fff', fontWeight: '700', marginTop: 2, fontFamily: 'Inter_700Bold' },
  heroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    gap: 8,
  },
  heroStatus: { color: 'rgba(255,255,255,0.85)', fontSize: 13, flexShrink: 1 },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    flexShrink: 0,
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
  statsBtnRow: {
    marginTop: 2,
    marginBottom: space.sm,
  },
  statsBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  statsBtnTxt: {
    color: colors.primary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  chipsBlock: { marginBottom: space.md },
  chipsLabel: {
    fontSize: 12,
    color: colors.muted,
    letterSpacing: 0.2,
    marginBottom: 10,
    fontFamily: 'Inter_600SemiBold',
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  habitCard: {
    ...card(),
    borderColor: 'rgba(15, 23, 42, 0.1)',
    borderWidth: 1,
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    minWidth: '47%',
    flexGrow: 1,
    maxWidth: '100%',
  },
  habitCardCompact: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  habitEmoji: { fontSize: 22 },
  habitBody: { flex: 1, minWidth: 0 },
  habitName: {
    color: colors.text,
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
  },
  habitMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
  },
  habitAmt: {
    color: colors.text,
    fontSize: 13,
    marginTop: 3,
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
  },
  listTitle: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  listFlex: { flex: 1 },
  list: { paddingHorizontal: space.lg, gap: 10, flexGrow: 1 },
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
  dock: {
    position: 'absolute',
    zIndex: 40,
    width: undefined,
  },
  fabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    maxWidth: '100%',
  },
  closeFab: {
    height: FAB_SIZE,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 5,
  },
  closeFabTxt: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 },
  closeFabCompact: {
    height: 48,
    paddingHorizontal: 14,
  },
  closeFabDisabled: { opacity: 0.4 },
  addFab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
  },
  addFabCompact: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  addFabTxt: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 30,
    fontFamily: 'Inter_700Bold',
    marginTop: -2,
  },
  composer: {
    ...card(),
    backgroundColor: colors.surfaceSoft,
    padding: 8,
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
  },
  composerRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    width: '100%',
    maxWidth: '100%',
  },
  composerClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.06)',
    flexShrink: 0,
  },
  composerCloseTxt: { fontSize: 14, color: colors.muted, fontFamily: 'Inter_600SemiBold' },
  composerInput: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    ...field(),
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
  },
  micWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  micPulse: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.micListen,
  },
  mic: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4,
  },
  micOn: {
    backgroundColor: colors.micListen,
    shadowColor: colors.micListen,
    shadowOpacity: 0.4,
  },
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
