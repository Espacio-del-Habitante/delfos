import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius, space, type } from '../../../shared/theme';
import { STATS_WIDGETS, type StatsWidgetId } from '../../../domain/stats';

type Props = {
  selected: StatsWidgetId[];
  onChange: (next: StatsWidgetId[]) => void;
};

export function WidgetPicker({ selected, onChange }: Props) {
  function toggle(id: StatsWidgetId) {
    if (selected.includes(id)) {
      if (selected.length <= 1) return;
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Tus gadgets</Text>
      <Text style={styles.sub}>Enciende solo lo que te importa ver.</Text>
      <View style={styles.grid}>
        {STATS_WIDGETS.map((w) => {
          const on = selected.includes(w.id);
          return (
            <Pressable
              key={w.id}
              onPress={() => toggle(w.id)}
              style={({ pressed }) => [
                styles.card,
                on && styles.cardOn,
                pressed && (on ? styles.cardOnPressed : styles.cardPressed),
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${w.label}. ${w.blurb}`}
            >
              <View style={styles.cardHead}>
                <View style={[styles.radio, on && styles.radioOn]}>
                  {on ? <View style={styles.radioDot} /> : null}
                </View>
                <Text style={[styles.cardLabel, on && styles.cardLabelOn]} numberOfLines={2}>
                  {w.label}
                </Text>
              </View>
              <Text style={[styles.cardBlurb, on && styles.cardBlurbOn]} numberOfLines={2}>
                {w.blurb}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  title: { ...type.title, fontSize: 16 },
  sub: { ...type.label, marginBottom: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: '48%',
    flexGrow: 1,
    minWidth: 148,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    gap: 6,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  cardOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: '#eef2f0',
    borderColor: '#c5d0ca',
  },
  cardOnPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#9ca3af',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  radioOn: {
    borderColor: '#fff',
    backgroundColor: colors.primaryDark,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  cardLabel: {
    flex: 1,
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: colors.text,
  },
  cardLabelOn: { color: '#fff' },
  cardBlurb: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.muted,
    lineHeight: 15,
    paddingLeft: 28,
  },
  cardBlurbOn: { color: '#dcfce7' },
});
