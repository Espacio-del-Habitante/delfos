import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { colors } from '../../../shared/theme';

const ITEM_H = 48;
const VISIBLE = 3;

type Props<T> = {
  items: T[];
  index: number;
  onChangeIndex: (index: number) => void;
  labelOf: (item: T, index: number) => string;
  style?: StyleProp<ViewStyle>;
  /** Hide center label when an editable overlay sits on the band. */
  hideCenterLabel?: boolean;
  centerSlot?: ReactNode;
};

export function VerticalWheel<T>({
  items,
  index,
  onChangeIndex,
  labelOf,
  style,
  hideCenterLabel = false,
  centerSlot,
}: Props<T>) {
  const ref = useRef<{ scrollTo: (opts: { y: number; animated?: boolean }) => void } | null>(null);
  const [scrollY, setScrollY] = useState(index * ITEM_H);
  const ignoreScroll = useRef(false);

  useEffect(() => {
    ignoreScroll.current = true;
    const y = index * ITEM_H;
    setScrollY(y);
    requestAnimationFrame(() => {
      ref.current?.scrollTo({ y, animated: false });
      ignoreScroll.current = false;
    });
  }, [index, items.length]);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (ignoreScroll.current) return;
    setScrollY(e.nativeEvent.contentOffset.y);
  }

  function onEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = e.nativeEvent.contentOffset.y;
    const i = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM_H)));
    const snapped = i * ITEM_H;
    if (Math.abs(y - snapped) > 1) {
      ref.current?.scrollTo({ y: snapped, animated: true });
    }
    setScrollY(snapped);
    if (i !== index) onChangeIndex(i);
  }

  const center = scrollY / ITEM_H;

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.band} pointerEvents="none" />
      <ScrollView
        ref={ref as never}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        disableIntervalMomentum
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onEnd}
        onScrollEndDrag={onEnd}
        contentContainerStyle={{ paddingVertical: ITEM_H }}
      >
        {items.map((item, i) => {
          const dist = Math.abs(i - center);
          const isCenter = dist < 0.35;
          const opacity = hideCenterLabel && isCenter ? 0 : isCenter ? 1 : dist < 1.15 ? 0.38 : 0.16;
          const scale = isCenter ? 1 : 0.88;
          const blurry = !isCenter;
          return (
            <View key={i} style={styles.row}>
              <Text
                style={[
                  styles.label,
                  blurry && styles.labelDim,
                  blurry && webBlur,
                  { opacity, transform: [{ scale }] },
                ]}
                numberOfLines={1}
              >
                {labelOf(item, i)}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      {centerSlot ? <View style={styles.centerOverlay}>{centerSlot}</View> : null}
    </View>
  );
}

const webBlur =
  Platform.OS === 'web'
    ? ({ filter: 'blur(1.4px)' } as TextStyle)
    : null;

const styles = StyleSheet.create({
  wrap: {
    height: ITEM_H * VISIBLE,
    overflow: 'hidden',
    borderRadius: 16,
    // Mimetiza el modal (blanco), sin caja grisácea.
    backgroundColor: 'transparent',
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ITEM_H,
    height: ITEM_H,
    backgroundColor: 'transparent',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.1)',
    zIndex: 1,
  },
  row: {
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  label: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    textAlign: 'center',
  },
  labelDim: {
    fontWeight: '500',
    fontFamily: 'Inter_400Regular',
    color: colors.muted,
  },
  centerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ITEM_H,
    height: ITEM_H,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const WHEEL_ITEM_H = ITEM_H;
