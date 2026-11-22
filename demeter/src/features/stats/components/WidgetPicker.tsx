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
      <Text style={styles.sub}>Elige qué gráficos y tarjetas ver en Estadísticas.</Text>
      <View style={styles.grid}>
        {STATS_WIDGETS.map((w) => {
          const on = selected.includes(w.id);
          return (
            <Pressable
              key={w.id}
              onPress={() => toggle(w.id)}
              style={({ pressed }) => [
                styles.chip,
                on && styles.chipOn,
                pressed && { transform: [{ scale: 0.97 }] },
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${w.label}. ${w.blurb}`}
            >
              <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{w.label}</Text>
              <Text style={[styles.chipBlurb, on && styles.chipBlurbOn]} numberOfLines={2}>
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
  wrap: { gap: 8 },
  title: { ...type.title, fontSize: 16 },
  sub: { ...type.label, marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    width: '48%',
    flexGrow: 1,
    minWidth: 140,
    padding: space.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  chipOn: {
    backgroundColor: 'rgba(27,122,74,0.1)',
    borderColor: 'rgba(27,122,74,0.35)',
  },
  chipLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: colors.text,
  },
  chipLabelOn: { color: colors.primaryDark },
  chipBlurb: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.muted,
    lineHeight: 14,
  },
  chipBlurbOn: { color: '#3f6b52' },
});
