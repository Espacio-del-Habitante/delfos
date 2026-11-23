import { View, Pressable, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import { TourTarget } from '@wrack/react-native-tour-guide';
import { colors } from './theme';

export type BottomNavId = 'mercado' | 'recetas' | 'historial' | 'stats' | 'ajustes';

/** Padding bajo la píldora respecto al home indicator (mínimo visual). */
export const NAV_EDGE_PAD = 16;
/** Altura de la píldora (padding 6 + ítem 40 + padding 6). */
export const NAV_PILL_HEIGHT = 52;
/** Gap entre píldora y FABs / composer. */
export const BOTTOM_NAV_GAP = 14;
export const FAB_SIZE = 56;

/** @deprecated usar navDockBottom / floatingDockBottom con safe-area */
export const BOTTOM_NAV_CLEARANCE = NAV_EDGE_PAD + NAV_PILL_HEIGHT;

/** bottom style de la píldora: encima del safe area. */
export function navDockBottom(safeBottom: number) {
  return NAV_EDGE_PAD + Math.max(safeBottom, 0);
}

/** Distancia desde el borde inferior hasta el tope de la píldora. */
export function navPillTop(safeBottom: number) {
  return navDockBottom(safeBottom) + NAV_PILL_HEIGHT;
}

/** bottom style para FABs / composer: gap por encima de la píldora. */
export function floatingDockBottom(safeBottom: number) {
  return navPillTop(safeBottom) + BOTTOM_NAV_GAP;
}

/** Padding de listas para no quedar bajo nav + fab. */
export function contentBottomPad(safeBottom: number, extra = FAB_SIZE + 16) {
  return floatingDockBottom(safeBottom) + extra;
}

type Tab = { id: BottomNavId; label: string };

const TABS: Tab[] = [
  { id: 'mercado', label: 'Mercado' },
  { id: 'recetas', label: 'Recetas' },
  { id: 'historial', label: 'Historial' },
  { id: 'stats', label: 'Stats' },
  { id: 'ajustes', label: 'Ajustes' },
];

function TabIcon({ id, active, size }: { id: BottomNavId; active: boolean; size: number }) {
  // Inactivo más oscuro que colors.muted: en pantallas chicas / píldora clara se perdían.
  const stroke = active ? colors.primary : '#374151';
  const sw = active ? 2.35 : 2.15;
  const common = {
    stroke,
    strokeWidth: sw,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      {id === 'mercado' && (
        <>
          <Circle cx="9" cy="21" r="1.15" fill={stroke} stroke="none" />
          <Circle cx="20" cy="21" r="1.15" fill={stroke} stroke="none" />
          <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" {...common} />
        </>
      )}
      {id === 'recetas' && (
        <>
          <Path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" {...common} />
          <Path d="M7 2v20" {...common} />
          <Path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" {...common} />
        </>
      )}
      {id === 'historial' && (
        <>
          <Circle cx="12" cy="12" r="10" {...common} />
          <Polyline points="12 6 12 12 16 14" {...common} />
        </>
      )}
      {id === 'stats' && (
        <>
          <Polyline points="23 6 13.5 15.5 8.5 10.5 1 18" {...common} />
          <Polyline points="17 6 23 6 23 12" {...common} />
        </>
      )}
      {id === 'ajustes' && (
        <>
          <Circle cx="12" cy="12" r="3" {...common} />
          <Path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            {...common}
          />
        </>
      )}
    </Svg>
  );
}

type Props = {
  active: BottomNavId;
  onChange: (id: BottomNavId) => void;
};

/**
 * Píldora flotante icon-only, como Delfos `.bottom-nav`.
 * Icons vía react-native-svg (Image+data-URI SVG no pinta en Android nativo).
 * Respeta safe-area inferior; en anchos chicos compacta el hit-target.
 */
export function BottomNav({ active, onChange }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // 5×40 + gaps ≈ 228; bajo ~340px compactamos para que no se corte la píldora.
  const compact = width < 360;
  const itemSize = compact ? 36 : 40;
  const iconSize = compact ? 18 : 20;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: navDockBottom(insets.bottom) }]}
    >
      <View style={[styles.pill, compact && styles.pillCompact]} accessibilityRole="tablist">
        {TABS.map((t) => {
          const on = active === t.id;
          return (
            <TourTarget key={t.id} id={`tour-nav-${t.id}`} style={{ width: itemSize, height: itemSize }}>
              <Pressable
                onPress={() => onChange(t.id)}
                style={({ pressed }) => [
                  styles.item,
                  { width: itemSize, height: itemSize, borderRadius: itemSize / 2 },
                  on && styles.itemOn,
                  pressed && styles.itemPressed,
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={t.label}
              >
                <TabIcon id={t.id} active={on} size={iconSize} />
              </Pressable>
            </TourTarget>
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
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)',
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
  pillCompact: {
    gap: 2,
    padding: 5,
  },
  item: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemOn: {
    backgroundColor: 'rgba(27, 122, 74, 0.12)',
  },
  itemPressed: {
    transform: [{ scale: 0.92 }],
  },
});
