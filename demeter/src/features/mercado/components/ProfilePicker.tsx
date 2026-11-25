import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { colors, radius, type } from '../../../shared/theme';
import { SHOP_PROFILES, type ShopProfileId } from '../../../domain/shopProfiles';

type Props = {
  value: ShopProfileId;
  onChange: (id: ShopProfileId) => void;
  compact?: boolean;
};

/** Selector de perfil de compra (home + ajustes). */
export function ProfilePicker({ value, onChange, compact }: Props) {
  const chips = (
    <View style={[styles.row, compact && styles.rowCompact]}>
      {SHOP_PROFILES.map((p) => {
        const on = value === p.id;
        return (
          <Pressable
            key={p.id}
            onPress={() => onChange(p.id)}
            style={({ pressed }) => [
              styles.chip,
              compact && styles.chipCompact,
              on && styles.chipOn,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={p.label}
          >
            <Text style={[styles.chipTxt, on && styles.chipTxtOn]} numberOfLines={1}>
              {p.chip}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={styles.wrap} accessibilityRole="radiogroup">
      {!compact ? <Text style={styles.label}>¿Con qué mood mercas hoy?</Text> : null}
      {compact ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollRow}
        >
          {chips}
        </ScrollView>
      ) : (
        chips
      )}
      {!compact ? (
        <Text style={styles.blurb}>
          {SHOP_PROFILES.find((p) => p.id === value)?.blurb}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { ...type.label, color: colors.muted },
  scrollRow: { paddingRight: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowCompact: { flexWrap: 'nowrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipCompact: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexShrink: 0,
  },
  chipOn: {
    backgroundColor: 'rgba(27, 122, 74, 0.12)',
    borderColor: colors.primary,
  },
  chipTxt: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.text,
  },
  chipTxtOn: { color: colors.primaryDark },
  blurb: { ...type.label, fontSize: 12 },
});
