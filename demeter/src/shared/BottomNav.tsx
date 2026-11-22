import { View, Pressable, Image, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './theme';

export type BottomNavId = 'mercado' | 'historial' | 'stats' | 'ajustes';

/** Altura aproximada de la píldora + gap inferior (sin safe-area). */
export const BOTTOM_NAV_CLEARANCE = 68;

type Tab = { id: BottomNavId; label: string; uri: string };

function svgUri(paths: string) {
  return (
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`,
    )
  );
}

function svgUriActive(paths: string) {
  return (
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1b7a4a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`,
    )
  );
}

const PATHS = {
  mercado:
    '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  historial:
    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  stats: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  ajustes:
    '<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
};

const TABS: Tab[] = [
  { id: 'mercado', label: 'Mercado', uri: PATHS.mercado },
  { id: 'historial', label: 'Historial', uri: PATHS.historial },
  { id: 'stats', label: 'Stats', uri: PATHS.stats },
  { id: 'ajustes', label: 'Ajustes', uri: PATHS.ajustes },
];

type Props = {
  active: BottomNavId;
  onChange: (id: BottomNavId) => void;
};

/**
 * Píldora flotante icon-only, como Delfos `.bottom-nav`.
 * Overlay absoluto — no empuja el layout.
 */
export function BottomNav({ active, onChange }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: 12 + Math.max(insets.bottom, 0) }]}
    >
      <View style={styles.pill} accessibilityRole="tablist">
        {TABS.map((t) => {
          const on = active === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => onChange(t.id)}
              style={({ pressed }) => [
                styles.item,
                on && styles.itemOn,
                pressed && styles.itemPressed,
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.label}
            >
              <Image
                source={{ uri: on ? svgUriActive(t.uri) : svgUri(t.uri) }}
                style={styles.icon}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  pill: {
    flexDirection: 'row',
    gap: 4,
    padding: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    // Web glass; nativo cae a blanco translúcido (sin expo-blur)
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        } as object)
      : null),
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 12,
  },
  item: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemOn: {
    backgroundColor: 'rgba(27, 122, 74, 0.12)',
  },
  itemPressed: {
    transform: [{ scale: 0.92 }],
  },
  icon: { width: 20, height: 20 },
});
