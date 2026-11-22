import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, radius, space, card, type } from '../../../shared/theme';
import { formatCop } from '../../../shared/format';
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

  async function reopen() {
    await startTrip({ budget: getState().settings.budgetDefault });
    onNewTrip?.();
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
          renderItem={({ item: t }) => <TripCard trip={t} />}
        />
      )}
    </View>
  );
}

function TripCard({ trip: t }: { trip: Trip }) {
  const total = Number(t.receipt?.ticketTotal) || tripLineTotal(t);
  const cats = Object.entries(categoryBreakdown(t));
  const date = new Date(t.createdAt).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.store}>{t.storeName || 'Deméter'}</Text>
        <Text style={styles.muted}>{date}</Text>
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
});
