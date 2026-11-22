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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
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

/** SVG en data-URI: viewBox cuadrado → centro geométrico fiable en el botón. */
const MIC_URI =
  'data:image/svg+xml,' +
  encodeURIComponent(
    // translate(0,0.5): el mic es más pesado arriba; un pelín abajo se ve centrado.
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(0 0.5)"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0"/><line x1="12" y1="17" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></g></svg>',
  );

function MicGlyph() {
  return (
    <Image
      source={{ uri: MIC_URI }}
      style={glyph.icon}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

function StopGlyph({ color = '#fff' }: { color?: string }) {
  return <View style={[glyph.stop, { backgroundColor: color }]} accessibilityElementsHidden />;
}

const glyph = StyleSheet.create({
  icon: { width: 20, height: 20 },
  stop: { width: 11, height: 11, borderRadius: 2 },
});

type Props = { onOpenSettings?: () => void };

export function MercadoScreen({ onOpenSettings }: Props) {
  const insets = useSafeAreaInsets();
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
      showToast('Sync: ve a Historial o Ajustes para enviar pendientes');
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
        showToast('Dictado no disponible. Escribe aquí');
        setTimeout(() => draftRef.current?.focus(), 80);
        return;
      }
      setDraft('');
      showToast('Escuchando…');
      await startListening('es-CO');
    } catch (e: unknown) {
      showToast(friendlyError(e, 'No se pudo usar el micrófono'));
      setListening(false);
    }
  }

  async function onStart() {
    await startTrip({ budget: getState().settings.budgetDefault });
    showToast('Mercado abierto');
  }

  function onFinish() {
    const t = getActiveTrip();
    if (!t?.items?.length) {
      showToast('Suma algo antes de cerrar');
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

      <View style={styles.brandRow}>
        <TourTarget id="tour-brand" style={styles.brandTour}>
          <Image
            source={require('../../../../assets/mercapp-logo.png')}
            style={styles.brandLogo}
            resizeMode="contain"
            accessibilityLabel="MercApp"
          />
        </TourTarget>
        <View style={{ flex: 1 }} />
        {onOpenSettings && (
          <Pressable
            onPress={onOpenSettings}
            style={({ pressed }) => [styles.settingsBtn, pressed && { transform: [{ scale: 0.97 }] }]}
            accessibilityLabel="Configuración"
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
          <Text style={styles.emptyTitle}>Sin mercado abierto</Text>
          <Text style={styles.emptyText}>Abre un mercado y empieza a sumar.</Text>
          <TourTarget id="tour-start" style={styles.primaryBtn}>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && { transform: [{ scale: 0.97 }] }]}
              onPress={onStart}
            >
              <Text style={styles.primaryBtnTxt}>🚀 Empezar</Text>
            </Pressable>
          </TourTarget>
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

          {liveCats.bars.length > 0 && (
            <View style={styles.statsBtnRow}>
              <Pressable
                onPress={() => setTripStatsOpen(true)}
                style={({ pressed }) => [styles.statsBtn, pressed && { opacity: 0.75 }]}
                accessibilityRole="button"
                accessibilityLabel="Ver estadísticas de este mercado"
              >
                <Text style={styles.statsBtnTxt}>Ver estadísticas</Text>
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
                    Deberías sumar · {shopProfileMeta(shopProfile).label}
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

          <FlatList
            data={items}
            keyExtractor={(it) => it.id}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: contentBottomPad(insets.bottom, FAB_SIZE + 28) },
            ]}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={[styles.card, styles.center, { padding: space.lg }]}>
                <Text style={styles.emptyIcon}>🧺</Text>
                <Text style={styles.emptyTitle}>Carrito vacío</Text>
                <Text style={styles.emptyText}>Toca + para escribir o dictar.</Text>
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
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemMeta}>
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
        </>
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
                  placeholder={listening ? 'Escuchando…' : 'papa 8 mil · Enter'}
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
              {listening && <Text style={styles.listenHint}>Escuchando. Toca para cortar</Text>}
            </View>
          ) : (
            <View style={styles.fabRow}>
              <Pressable
                onPress={onFinish}
                disabled={!trip?.items?.length}
                style={({ pressed }) => [
                  styles.closeFab,
                  !trip?.items?.length ? styles.closeFabDisabled : null,
                  pressed && trip?.items?.length ? { opacity: 0.92 } : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Cerrar mercado"
                accessibilityState={{ disabled: !trip?.items?.length }}
              >
                <Text style={styles.closeFabTxt}>Cerrar mercado</Text>
              </Pressable>
              <Pressable
                onPress={openComposer}
                style={({ pressed }) => [styles.addFab, pressed && { transform: [{ scale: 0.96 }] }]}
                accessibilityRole="button"
                accessibilityLabel="Agregar ítem"
              >
                <Text style={styles.addFabTxt}>+</Text>
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
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  profileHome: {
    paddingHorizontal: space.lg,
    marginBottom: space.md,
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
  statsBtnRow: {
    paddingHorizontal: space.lg,
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
  chipsBlock: { paddingHorizontal: space.lg, marginBottom: space.md },
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
  list: { paddingHorizontal: space.lg, gap: 10 },
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
