import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Share, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, radius, space, card, type } from '../../../shared/theme';
import { formatCop } from '../../../shared/format';
import { categoryMeta } from '../../../domain/categories';
import {
  spentTotal,
  aggregateCategories,
  categoryBars,
  productsWithSparks,
  shareBlurb,
} from '../../../domain/stats';
import { initStore, subscribe, listTrips, getProducts } from '../../../services/store';
import { BOTTOM_NAV_CLEARANCE } from '../../../shared/BottomNav';

/** Mini sparkline sin dependencias: barras de altura relativa. */
function SparkBars({ history }: { history: Array<{ unitPrice: number }> }) {
  const vals = history.map((h) => h.unitPrice);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  return (
    <View style={spark.row}>
      {vals.map((v, i) => (
        <View
          key={i}
          style={[
            spark.bar,
            { height: 6 + ((v - min) / span) * 22 },
          ]}
        />
      ))}
    </View>
  );
}

const spark = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 28, marginTop: 6 },
  bar: { width: 6, borderRadius: 2, backgroundColor: colors.primary, opacity: 0.85 },
});

export function StatsScreen() {
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

  const data = useMemo(() => {
    void tick;
    const trips = listTrips().filter((t) => t.items?.length);
    const catTotals = aggregateCategories(trips);
    return {
      trips,
      yearTotal: spentTotal(trips),
      bars: categoryBars(trips),
      sparks: productsWithSparks(getProducts()),
      blurb: shareBlurb(catTotals),
    };
  }, [tick, ready]);

  async function shareCard() {
    const { blurb, yearTotal, trips } = data;
    const lean =
      blurb.lean === 'proteina'
        ? `Vas más en proteína (${formatCop(blurb.proteina)}) que en harinas (${formatCop(blurb.harinas)}).`
        : `Estás llevando más harinas (${formatCop(blurb.harinas)}) que proteína (${formatCop(blurb.proteina)}).`;
    await Share.share({
      message: `🌿 Mi Deméter en números\n${trips.length} cosechas · ${formatCop(yearTotal)}\n${lean}`,
    });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + BOTTOM_NAV_CLEARANCE + 24, gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Estadísticas</Text>
        <Text style={styles.sub}>Resumen local de tus mercados.</Text>

        {!ready ? (
          <Text style={styles.muted}>Cargando…</Text>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Resumen</Text>
              <View style={styles.statGrid}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Cosechas</Text>
                  <Text style={styles.statValue}>{data.trips.length}</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Gastado</Text>
                  <Text style={[styles.statValue, styles.amount]}>{formatCop(data.yearTotal)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.shareCard}>
              <Text style={styles.shareEyebrow}>Para redes</Text>
              <Text style={styles.shareTitle}>🌿 Mi Deméter en números</Text>
              <Text style={styles.shareBody}>
                {data.blurb.lean === 'proteina'
                  ? `Vas más en proteína (${formatCop(data.blurb.proteina)}) que en harinas (${formatCop(data.blurb.harinas)}).`
                  : `Estás llevando más harinas (${formatCop(data.blurb.harinas)}) que proteína (${formatCop(data.blurb.proteina)}).`}
              </Text>
              <Pressable
                onPress={shareCard}
                style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.shareBtnTxt}>Compartir</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Por categoría</Text>
              {data.bars.length === 0 ? (
                <Text style={styles.muted}>Cierra mercados con precios para ver el desglose.</Text>
              ) : (
                data.bars.map((b) => (
                  <View key={b.id} style={styles.barRow}>
                    <View style={styles.row}>
                      <Text style={styles.barLabel}>
                        {b.emoji} {b.label}
                      </Text>
                      <Text style={styles.amount}>{formatCop(b.amount)}</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${Math.max(b.pct, 2)}%` as `${number}%` }]} />
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Precios que cambian</Text>
              <Text style={[styles.muted, { marginBottom: 8 }]}>
                Unitario vs compra pasada (local).
              </Text>
              {data.sparks.length === 0 ? (
                <Text style={styles.muted}>Repite productos en varios mercados para ver la línea.</Text>
              ) : (
                data.sparks.map((p) => {
                  const meta = categoryMeta(p.category);
                  const deltaTxt =
                    p.delta == null
                      ? 'sin delta'
                      : p.delta > 0
                        ? `subió ${formatCop(p.delta)} / und`
                        : p.delta < 0
                          ? `bajó ${formatCop(-p.delta)} / und`
                          : 'igual';
                  return (
                    <View key={p.name} style={styles.sparkRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sparkName}>
                          {meta.emoji} {p.name}
                        </Text>
                        <Text style={styles.muted}>{deltaTxt}</Text>
                        <SparkBars history={p.history} />
                      </View>
                      <Text style={styles.amount}>{formatCop(p.unitPrice)}</Text>
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.md },
  title: { ...type.title, fontSize: 24 },
  sub: { ...type.label, marginTop: 4, marginBottom: 8 },
  muted: { ...type.label },
  card: { ...card(), padding: space.md, gap: 10 },
  cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: colors.text },
  statGrid: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, backgroundColor: 'rgba(27,122,74,0.08)', borderRadius: radius.md, padding: 12 },
  statLabel: { ...type.label },
  statValue: { fontFamily: 'Inter_800ExtraBold', fontSize: 22, color: colors.text, marginTop: 4 },
  amount: { color: colors.primary, fontFamily: 'Inter_700Bold' },
  shareCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: space.md,
    gap: 8,
  },
  shareEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontFamily: 'Inter_600SemiBold',
  },
  shareTitle: { color: '#fff', fontFamily: 'Inter_800ExtraBold', fontSize: 20 },
  shareBody: {
    color: 'rgba(255,255,255,0.92)',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  shareBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  shareBtnTxt: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 },
  barRow: { gap: 6, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  barLabel: { fontFamily: 'Inter_600SemiBold', color: colors.text, fontSize: 14 },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(27,122,74,0.12)',
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  sparkRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sparkName: { fontFamily: 'Inter_600SemiBold', color: colors.text, fontSize: 14 },
});
