import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, radius, space, card, type } from '../../../shared/theme';
import { formatCop, formatQty } from '../../../shared/format';
import { categoryMeta } from '../../../domain/categories';
import { categoryBreakdown, tripLineTotal } from '../../../domain/stats';
import {
  initStore,
  subscribe,
  listTrips,
  startTrip,
  getState,
  type Trip,
} from '../../../services/store';
import { BOTTOM_NAV_CLEARANCE } from '../../../shared/BottomNav';

type Props = { onNewTrip?: () => void };

export function HistoryScreen({ onNewTrip }: Props) {
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    initStore().then(() => {
      if (alive) setReady(true);
    });
    return subscribe(() => setTick((n) => n + 1));
  }, []);

  const trips = useMemo(() => {
    void tick;
    return listTrips().filter((t) => t.status === 'closed' || (t.items?.length ?? 0) > 0);
  }, [tick, ready]);

  const openTrip = useMemo(
    () => (openId ? trips.find((t) => t.id === openId) || null : null),
    [openId, trips],
  );

  async function reopen() {
    await startTrip({ budget: getState().settings.budgetDefault });
    onNewTrip?.();
  }

  if (openTrip) {
    return (
      <TripDetail
        trip={openTrip}
        paddingTop={insets.top + 8}
        paddingBottom={insets.bottom + BOTTOM_NAV_CLEARANCE + 24}
        onBack={() => setOpenId(null)}
      />
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>Historial</Text>
        <Text style={styles.sub}>Cosechas en este teléfono. Nada se sube solo.</Text>
      </View>

      {!ready ? (
        <Text style={styles.muted}>Cargando…</Text>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + BOTTOM_NAV_CLEARANCE + 24, gap: 12 }}
          ListHeaderComponent={
            <Pressable
              onPress={reopen}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.ctaTxt}>Nuevo mercado</Text>
            </Pressable>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Sin historial aún</Text>
              <Text style={styles.muted}>Cuando cierres un mercado, aparece aquí.</Text>
            </View>
          }
          renderItem={({ item: t }) => (
            <TripCard trip={t} onPress={() => setOpenId(t.id)} />
          )}
        />
      )}
    </View>
  );
}

function tripTotalDisplay(t: Trip) {
  return Number(t.receipt?.ticketTotal) || tripLineTotal(t);
}

function tripDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function TripCard({ trip: t, onPress }: { trip: Trip; onPress: () => void }) {
  const total = tripTotalDisplay(t);
  const cats = Object.entries(categoryBreakdown(t));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
      accessibilityRole="button"
      accessibilityLabel={`Ver compras de ${t.storeName || 'Deméter'}`}
      accessibilityHint="Muestra los ítems de este mercado"
    >
      <View style={styles.row}>
        <Text style={styles.store}>{t.storeName || 'Deméter'}</Text>
        <Text style={styles.muted}>{tripDate(t.createdAt)}</Text>
      </View>
      <Text style={styles.amount}>{formatCop(total)}</Text>
      <Text style={styles.meta}>
        {t.items.length} ítems · {t.status}
        {t.sync?.ok ? ' · sync ✓' : t.sync && !t.sync.ok ? ' · sync falló' : ''}
      </Text>
      {cats.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pills}>
          {cats.map(([cat, amt]) => {
            const meta = categoryMeta(cat);
            return (
              <View key={cat} style={styles.pill}>
                <Text style={styles.pillTxt}>
                  {meta.emoji} {meta.label} {formatCop(amt)}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </Pressable>
  );
}

function TripDetail({
  trip: t,
  onBack,
  paddingTop,
  paddingBottom,
}: {
  trip: Trip;
  onBack: () => void;
  paddingTop: number;
  paddingBottom: number;
}) {
  const total = tripTotalDisplay(t);
  const cart = tripLineTotal(t);
  const ticket = Number(t.receipt?.ticketTotal);
  const hasTicket = Number.isFinite(ticket) && ticket > 0;

  return (
    <View style={[styles.root, { paddingTop }]}>
      <StatusBar style="dark" />
      <View style={styles.detailTop}>
        <Pressable
          onPress={onBack}
          hitSlop={10}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          accessibilityLabel="Volver al historial"
          accessibilityRole="button"
        >
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.detailStore}>{t.storeName || 'Deméter'}</Text>
          <Text style={styles.muted}>{tripDate(t.createdAt)}</Text>
        </View>
      </View>

      <View style={styles.detailHero}>
        <Text style={styles.detailHeroLabel}>Total</Text>
        <Text style={styles.detailHeroAmt}>{formatCop(total)}</Text>
        {hasTicket && ticket !== cart && (
          <Text style={styles.muted}>
            Factura {formatCop(ticket)} · carrito {formatCop(cart)}
          </Text>
        )}
        <Text style={styles.muted}>
          {t.items.length} ítems · {t.status}
          {t.sync?.ok ? ' · sync ✓' : t.sync && !t.sync.ok ? ' · sync falló' : ''}
        </Text>
      </View>

      <Text style={styles.section}>Qué compramos</Text>
      <FlatList
        data={t.items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ paddingBottom, gap: 10 }}
        ListEmptyComponent={
          <Text style={styles.muted}>Este mercado no tiene ítems.</Text>
        }
        renderItem={({ item }) => {
          const meta = categoryMeta(item.category);
          return (
            <View style={styles.itemRow}>
              <Text style={styles.itemEmoji}>{meta.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.muted}>
                  {formatQty(item.qty, item.unit)} · {meta.label}
                </Text>
              </View>
              <Text style={[styles.itemAmt, item.amount == null && styles.itemAmtMissing]}>
                {item.amount == null ? 'sin precio' : formatCop(item.amount)}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.md },
  header: { marginBottom: space.md },
  title: { ...type.title, fontSize: 24 },
  sub: { ...type.label, marginTop: 4 },
  muted: { ...type.label },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 4,
  },
  ctaTxt: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 },
  empty: { paddingVertical: 40, alignItems: 'center', gap: 6 },
  emptyTitle: { ...type.title, fontSize: 18 },
  card: { ...card(), padding: space.md, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  store: { fontFamily: 'Inter_700Bold', fontSize: 16, color: colors.text, flex: 1 },
  amount: { fontFamily: 'Inter_800ExtraBold', fontSize: 22, color: colors.primary, marginTop: 4 },
  meta: { ...type.label },
  pills: { marginTop: 8 },
  pill: {
    backgroundColor: 'rgba(27,122,74,0.1)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
  },
  pillTxt: { fontSize: 12, color: colors.text, fontFamily: 'Inter_600SemiBold' },
  detailTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: space.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.05)',
  },
  backTxt: { fontSize: 28, lineHeight: 32, color: colors.text, marginTop: -2 },
  detailStore: { ...type.title, fontSize: 20 },
  detailHero: {
    ...card(),
    padding: space.md,
    gap: 4,
    marginBottom: space.md,
  },
  detailHeroLabel: { ...type.label, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailHeroAmt: { fontFamily: 'Inter_800ExtraBold', fontSize: 28, color: colors.primary },
  section: { ...type.title, fontSize: 16, marginBottom: 10 },
  itemRow: {
    ...card(),
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemEmoji: { fontSize: 22 },
  itemName: { fontFamily: 'Inter_700Bold', fontSize: 15, color: colors.text },
  itemAmt: { fontFamily: 'Inter_700Bold', fontSize: 15, color: colors.primary },
  itemAmtMissing: { color: colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});
