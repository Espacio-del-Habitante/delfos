import type { ReactNode } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';
import { colors, radius, space, type } from '../../../shared/theme';
import { formatCop } from '../../../shared/format';
import { CHART_PALETTE } from '../../../domain/stats';

type Bar = {
  id: string;
  label: string;
  emoji: string;
  amount: number;
  pct: number;
};
type MonthPoint = { key: string; label: string; value: number };

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function DonutCategories({ bars }: { bars: Bar[] }) {
  if (!bars.length) {
    return (
      <ChartCard title="Donut · categorías">
        <Text style={styles.muted}>Cierra mercados con precios para ver el reparto.</Text>
      </ChartCard>
    );
  }
  const data = bars.map((b, i) => ({
    value: b.amount,
    color: CHART_PALETTE[i % CHART_PALETTE.length],
    text: `${b.pct}%`,
  }));
  const total = bars.reduce((s, b) => s + b.amount, 0);
  return (
    <ChartCard title="Donut · categorías">
      <View style={styles.donutRow}>
        <PieChart
          data={data}
          donut
          radius={78}
          innerRadius={48}
          innerCircleColor={colors.surface}
          centerLabelComponent={() => (
            <View style={styles.centerLabel}>
              <Text style={styles.centerSmall}>Total</Text>
              <Text style={styles.centerAmt} numberOfLines={1}>
                {formatCop(total).replace(' COP', '')}
              </Text>
            </View>
          )}
        />
        <View style={styles.legend}>
          {bars.map((b, i) => (
            <View key={b.id} style={styles.legendRow}>
              <View
                style={[styles.swatch, { backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }]}
              />
              <Text style={styles.legendTxt} numberOfLines={1}>
                {b.label}
              </Text>
              <Text style={styles.legendAmt}>{b.pct}%</Text>
            </View>
          ))}
        </View>
      </View>
    </ChartCard>
  );
}

export function BarsCategories({ bars }: { bars: Bar[] }) {
  const { width } = useWindowDimensions();
  if (!bars.length) {
    return (
      <ChartCard title="Barras · categorías">
        <Text style={styles.muted}>Sin datos de categoría aún.</Text>
      </ChartCard>
    );
  }
  const chartW = Math.min(width - 72, 340);
  const data = bars.map((b, i) => ({
    value: b.amount,
    label: b.label.slice(0, 3),
    frontColor: CHART_PALETTE[i % CHART_PALETTE.length],
    topLabelComponent: () => (
      <Text style={styles.barTop}>{Math.round(b.amount / 1000)}k</Text>
    ),
  }));
  return (
    <ChartCard title="Barras · categorías">
      <BarChart
        data={data}
        width={chartW}
        height={160}
        barWidth={28}
        spacing={16}
        roundedTop
        roundedBottom
        hideRules
        xAxisThickness={0}
        yAxisThickness={0}
        yAxisTextStyle={styles.axis}
        noOfSections={3}
        isAnimated
        animationDuration={600}
      />
      <View style={styles.barLegend}>
        {bars.map((b) => (
          <Text key={b.id} style={styles.barLegendTxt}>
            {b.label} · {formatCop(b.amount)}
          </Text>
        ))}
      </View>
    </ChartCard>
  );
}

export function TrendMonthly({ series }: { series: MonthPoint[] }) {
  const { width } = useWindowDimensions();
  if (series.length < 2) {
    return (
      <ChartCard title="Gasto mensual">
        <Text style={styles.muted}>
          Necesitas mercados en al menos 2 meses para ver la tendencia.
        </Text>
      </ChartCard>
    );
  }
  const chartW = Math.min(width - 72, 340);
  const data = series.map((p) => ({
    value: p.value,
    label: p.label,
    dataPointText: `${Math.round(p.value / 1000)}k`,
  }));
  return (
    <ChartCard title="Gasto mensual">
      <LineChart
        data={data}
        width={chartW}
        height={170}
        color={colors.primary}
        thickness={3}
        startFillColor="rgba(27,122,74,0.28)"
        endFillColor="rgba(27,122,74,0.02)"
        startOpacity={0.9}
        endOpacity={0.05}
        areaChart
        hideRules
        xAxisThickness={0}
        yAxisThickness={0}
        yAxisTextStyle={styles.axis}
        xAxisLabelTextStyle={styles.axis}
        dataPointsColor={colors.primaryDark}
        dataPointsRadius={4}
        noOfSections={3}
        isAnimated
        animationDuration={700}
        curved
      />
    </ChartCard>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    padding: space.md,
    gap: 10,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: colors.text },
  muted: { ...type.label },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  centerLabel: { alignItems: 'center', paddingHorizontal: 4 },
  centerSmall: { ...type.label, fontSize: 10 },
  centerAmt: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 12,
    color: colors.primary,
    maxWidth: 88,
  },
  legend: { flex: 1, minWidth: 140, gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendTxt: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12, color: colors.text },
  legendAmt: { fontFamily: 'Inter_700Bold', fontSize: 12, color: colors.primary },
  axis: { color: colors.muted, fontSize: 10, fontFamily: 'Inter_400Regular' },
  barTop: { fontSize: 9, color: colors.muted, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  barLegend: { gap: 4, marginTop: 4 },
  barLegendTxt: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.muted },
});
