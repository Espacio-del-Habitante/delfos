import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Share, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, radius, space, card, type } from '../../../shared/theme';
import { formatCop, formatQty } from '../../../shared/format';
import { categoryMeta } from '../../../domain/categories';
import {
  spentTotal,
  aggregateCategories,
  categoryBars,
  productsWithSparks,
  shareBlurb,
  idealMonthlyMarket,
  monthlySpendSeries,
  type StatsWidgetId,
} from '../../../domain/stats';
import {
  initStore,
  subscribe,
  listClosedTrips,
  getProducts,
  getStatsWidgets,
  setStatsWidgets,
  getCustomCategories,
} from '../../../services/store';
import { mergeCategories } from '../../../domain/categories';
import { TourTarget } from '@wrack/react-native-tour-guide';
import { contentBottomPad } from '../../../shared/BottomNav';
import { WidgetPicker } from '../components/WidgetPicker';
import { BarsCategories, DonutCategories, TrendMonthly } from '../components/ChartGadgets';

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
          style={[spark.bar, { height: 6 + ((v - min) / span) * 22 }]}
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
  const [editGadgets, setEditGadgets] = useState(false);

  useEffect(() => {
    let alive = true;
    initStore().then(() => {
      if (alive) setReady(true);
    });
    return subscribe(() => setTick((n) => n + 1));
  }, []);

  const widgets = useMemo(() => {
    void tick;
    return getStatsWidgets();
  }, [tick, ready]);

  const data = useMemo(() => {
    void tick;
    const trips = listClosedTrips();
    const products = getProducts();
    const catalog = mergeCategories(getCustomCategories());
    const catTotals = aggregateCategories(trips);
    const ideal = idealMonthlyMarket(products);
    return {
      trips,
      yearTotal: spentTotal(trips),
      bars: categoryBars(trips, catalog),
      sparks: productsWithSparks(products),
      blurb: shareBlurb(catTotals),
      ideal,
      months: monthlySpendSeries(trips),
      catalog,
    };
  }, [tick, ready]);

  function blurbText() {
    const { blurb, catalog } = data;
    if (!blurb) return 'Cierra unos mercados y aquí te contamos la película.';
    const top = categoryMeta(blurb.topId, catalog);
    if (!blurb.secondId) {
      return `En tus compras cerradas manda ${top.label.toLowerCase()} (${formatCop(blurb.topAmount)}).`;
    }
    const second = categoryMeta(blurb.secondId, catalog);
    return `Vas más en ${top.label.toLowerCase()} (${formatCop(blurb.topAmount)}) que en ${second.label.toLowerCase()} (${formatCop(blurb.secondAmount)}).`;
  }

  async function shareCard() {
    const { yearTotal, trips, ideal } = data;
    const idealLine =
      ideal.items.length > 0 ? `\nMercado ideal mensual ≈ ${formatCop(ideal.total)}` : '';
    await Share.share({
      message: `Mi MercApp en números\n${trips.length} mercados · ${formatCop(yearTotal)}\n${blurbText()}${idealLine}`,
    });
  }

  async function onWidgetsChange(next: StatsWidgetId[]) {
    await setStatsWidgets(next);
  }

  function renderWidget(id: StatsWidgetId) {
    switch (id) {
      case 'donut':
        return <DonutCategories key={id} bars={data.bars} />;
      case 'bars':
        return <BarsCategories key={id} bars={data.bars} />;
      case 'trend':
        return <TrendMonthly key={id} series={data.months} />;
      case 'share':
        return (
          <View key={id} style={styles.shareCard}>
            <Text style={styles.shareEyebrow}>Para presumir</Text>
            <Text style={styles.shareTitle}>Mi MercApp en números</Text>
            <Text style={styles.shareBody}>{blurbText()}</Text>
            <Pressable
              onPress={shareCard}
              style={({ pressed }) => [
                styles.shareBtn,
                pressed && styles.shareBtnPressed,
              ]}
            >
              <Text style={styles.shareBtnTxt}>Compartir</Text>
            </Pressable>
          </View>
        );
      case 'ideal':
        return (
          <View key={id} style={styles.idealCard}>
            <Text style={styles.idealEyebrow}>Tu ritmo</Text>
            <Text style={styles.cardTitle}>Mercado ideal mensual</Text>
            <Text style={styles.muted}>
              Estimado con lo que sueles comprar (frecuencia × cantidad típica × último precio).
              Es una brújula, no un presupuesto fijo.
            </Text>
            {data.ideal.items.length === 0 ? (
              <Text style={[styles.muted, { marginTop: 8 }]}>
                Repite compras unos meses y armamos tu canasta ideal.
              </Text>
            ) : (
              <>
                <Text style={styles.idealTotal}>{formatCop(data.ideal.total)}</Text>
                <Text style={styles.muted}>
                  {data.ideal.items.length} productos · {data.ideal.monthsSampled} mes
                  {data.ideal.monthsSampled === 1 ? '' : 'es'} de muestra
                </Text>
                {data.ideal.items.map((it) => {
                  return (
                    <View key={it.name} style={styles.idealRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.sparkName} numberOfLines={1}>
                          {it.name}
                        </Text>
                        <Text style={styles.muted}>
                          {formatQty(it.qty, it.unit)}
                          {it.buysPerMonth !== 1 ? ` · ~${it.buysPerMonth}×/mes` : ''}
                        </Text>
                      </View>
                      <Text style={styles.amount}>{formatCop(it.amount)}</Text>
                    </View>
                  );
                })}
              </>
            )}
          </View>
        );
      case 'prices':
        return (
          <View key={id} style={styles.card}>
            <Text style={styles.cardTitle}>Precios que se mueven</Text>
            <Text style={[styles.muted, { marginBottom: 8 }]}>
              Unitario vs la compra pasada (en este teléfono).
            </Text>
            {data.sparks.length === 0 ? (
              <Text style={styles.muted}>Repite productos en varios mercados y aparece la película.</Text>
            ) : (
              data.sparks.map((p) => {
                const deltaTxt =
                  p.delta == null
                    ? 'sin comparación aún'
                    : p.delta > 0
                      ? `subió ${formatCop(p.delta)} / und`
                      : p.delta < 0
                        ? `bajó ${formatCop(-p.delta)} / und`
                        : 'igualito';
                return (
                  <View key={p.name} style={styles.sparkRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sparkName}>{p.name}</Text>
                      <Text style={styles.muted}>{deltaTxt}</Text>
                      <SparkBars history={p.history} />
                    </View>
                    <Text style={styles.amount}>{formatCop(p.unitPrice)}</Text>
                  </View>
                );
              })
            )}
          </View>
        );
      default:
        return null;
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: contentBottomPad(insets.bottom, 24), gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Tus números</Text>
            <Text style={styles.sub}>Solo compras cerradas · tu historia en plata.</Text>
          </View>
          <TourTarget id="tour-gadgets" style={styles.editHit}>
            <Pressable
              onPress={() => setEditGadgets((v) => !v)}
              style={({ pressed }) => [styles.editHit, pressed && { opacity: 0.55 }]}
              hitSlop={8}
              accessibilityLabel={editGadgets ? 'Listo con gadgets' : 'Elegir gadgets'}
            >
              <Text style={[styles.editLink, editGadgets && styles.editLinkOn]}>
                {editGadgets ? 'Listo' : 'Gadgets'}
              </Text>
            </Pressable>
          </TourTarget>
        </View>

        {!ready ? (
          <Text style={styles.muted}>Cargando…</Text>
        ) : (
          <>
            {editGadgets && (
              <WidgetPicker selected={widgets} onChange={onWidgetsChange} />
            )}
            {widgets.map((id) => renderWidget(id))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.md },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 },
  title: { ...type.title, fontSize: 24 },
  sub: { ...type.label, marginTop: 4 },
  editHit: { marginTop: 6, paddingVertical: 2, paddingHorizontal: 2 },
  editLink: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.primary,
  },
  editLinkOn: { color: colors.primaryDark },
  muted: { ...type.label },
  card: { ...card(), padding: space.md, gap: 10 },
  cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: colors.text },
  amount: { color: colors.primary, fontFamily: 'Inter_700Bold' },
  shareCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: space.md,
    gap: 8,
  },
  shareEyebrow: {
    color: '#bbf7d0',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontFamily: 'Inter_600SemiBold',
  },
  shareTitle: { color: '#fff', fontFamily: 'Inter_800ExtraBold', fontSize: 20 },
  shareBody: {
    color: '#ecfdf5',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  shareBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  shareBtnPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: '#dcfce7',
  },
  shareBtnTxt: { color: colors.primaryDark, fontFamily: 'Inter_700Bold', fontSize: 13 },
  sparkRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sparkName: { fontFamily: 'Inter_600SemiBold', color: colors.text, fontSize: 14 },
  idealCard: {
    ...card(),
    padding: space.md,
    gap: 8,
    borderColor: 'rgba(27,122,74,0.2)',
  },
  idealEyebrow: {
    ...type.label,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 11,
  },
  idealTotal: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 26,
    color: colors.primary,
    marginTop: 4,
  },
  idealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
