import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  Pressable,
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
  const wrapRef = useRef<View | null>(null);
  const onChangeRef = useRef(onChangeIndex);
  onChangeRef.current = onChangeIndex;
  const indexRef = useRef(index);
  indexRef.current = index;
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

  // Web: el ScrollView padre se come la rueda; paramos bubble + wheel nativo.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = wrapRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const dir = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
      if (!dir) return;
      const cur = indexRef.current;
      const next = Math.max(0, Math.min(items.length - 1, cur + dir));
      if (next !== cur) onChangeRef.current(next);
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [items.length]);

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

  function pick(i: number) {
    if (i === index) return;
    onChangeIndex(i);
  }

  const center = scrollY / ITEM_H;

  return (
    <View
      ref={wrapRef as never}
      style={[styles.wrap, style, Platform.OS === 'web' ? webTouch : null]}
    >
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
        scrollEnabled={Platform.OS !== 'web'}
      >
        {items.map((item, i) => {
          const dist = Math.abs(i - center);
          const isCenter = dist < 0.35;
          const opacity = hideCenterLabel && isCenter ? 0 : isCenter ? 1 : dist < 1.15 ? 0.38 : 0.16;
          const scale = isCenter ? 1 : 0.88;
          const blurry = !isCenter;
          return (
            <Pressable
              key={i}
              onPress={() => pick(i)}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={labelOf(item, i)}
            >
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
            </Pressable>
          );
        })}
      </ScrollView>
      {centerSlot ? (
        <View style={styles.centerOverlay} pointerEvents="box-none">
          {centerSlot}
        </View>
      ) : null}
    </View>
  );
}

const webBlur =
  Platform.OS === 'web'
    ? ({ filter: 'blur(1.4px)' } as TextStyle)
    : null;

const webTouch =
  Platform.OS === 'web'
    ? ({ overscrollBehavior: 'contain' } as ViewStyle)
    : null;

const styles = StyleSheet.create({
  wrap: {
    height: ITEM_H * VISIBLE,
    overflow: 'hidden',
    borderRadius: 16,
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
