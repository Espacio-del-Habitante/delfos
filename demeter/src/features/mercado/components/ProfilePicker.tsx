import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius, type } from '../../../shared/theme';
import { SHOP_PROFILES, type ShopProfileId } from '../../../domain/shopProfiles';

type Props = {
  value: ShopProfileId;
  onChange: (id: ShopProfileId) => void;
  compact?: boolean;
};

/** Selector de perfil de compra (home + ajustes). */
export function ProfilePicker({ value, onChange, compact }: Props) {
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup">
      {!compact ? <Text style={styles.label}>Tu perfil de mercado</Text> : null}
      <View style={styles.row}>
        {SHOP_PROFILES.map((p) => {
          const on = value === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => onChange(p.id)}
              style={({ pressed }) => [
                styles.chip,
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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
