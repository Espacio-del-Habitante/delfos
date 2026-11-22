import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { colors, radius, space, type } from '../../../shared/theme';
import { formatCop } from '../../../shared/format';
import { categoryMeta } from '../../../domain/categories';
import type { ShareBlurb } from '../../../domain/stats';

type Bar = {
  id: string;
  label: string;
  emoji: string;
  amount: number;
  pct: number;
};

type Catalog = Array<{ id: string; label: string; emoji: string }>;

type Props = {
  visible: boolean;
  onClose: () => void;
  bars: Bar[];
  blurb: ShareBlurb | null;
  catalog: Catalog;
};

function blurbLine(blurb: ShareBlurb, catalog: Catalog) {
  const top = categoryMeta(blurb.topId, catalog);
  if (!blurb.secondId) {
    return `Llevas sobre todo ${top.label.toLowerCase()} (${formatCop(blurb.topAmount)}).`;
  }
  const second = categoryMeta(blurb.secondId, catalog);
  return `Vas más en ${top.label.toLowerCase()} (${formatCop(blurb.topAmount)}) que en ${second.label.toLowerCase()} (${formatCop(blurb.secondAmount)}).`;
}

/** Stats del carrito abierto — modal, no ocupa la lista. */
export function TripStatsSheet({ visible, onClose, bars, blurb, catalog }: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.top}>
            <Text style={styles.title}>En este mercado</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
              <Text style={styles.close}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {blurb ? <Text style={styles.blurb}>{blurbLine(blurb, catalog)}</Text> : null}
            {bars.map((b) => (
              <View key={b.id} style={styles.row}>
                <View style={styles.head}>
                  <Text style={styles.label}>{b.label}</Text>
                  <Text style={styles.amt}>
                    {formatCop(b.amount)} · {b.pct}%
                  </Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.max(b.pct, 3)}%` as `${number}%` }]} />
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '70%',
    paddingBottom: space.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(15, 23, 42, 0.16)',
    marginTop: 10,
    marginBottom: 4,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: 8,
  },
  title: { ...type.title, fontSize: 18 },
  close: { color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  body: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: 12 },
  blurb: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 4,
  },
  row: { gap: 6 },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
  },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: colors.text, flexShrink: 1 },
  amt: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.primary },
  track: {
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(27,122,74,0.12)',
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
});
