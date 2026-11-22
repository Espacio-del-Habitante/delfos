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
const IS_WEB = Platform.OS === 'web';

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

type ScrollHandle = {
  scrollTo: (opts: { y: number; animated?: boolean }) => void;
};

function isEditableTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || el.isContentEditable;
}

function clampIndex(i: number, len: number) {
  return Math.max(0, Math.min(Math.max(0, len - 1), i));
}

export function VerticalWheel<T>({
  items,
  index,
  onChangeIndex,
  labelOf,
  style,
  hideCenterLabel = false,
  centerSlot,
}: Props<T>) {
  const ref = useRef<ScrollHandle | null>(null);
  const wrapRef = useRef<View | null>(null);
  const onChangeRef = useRef(onChangeIndex);
  onChangeRef.current = onChangeIndex;
  const indexRef = useRef(index);
  indexRef.current = index;
  const lenRef = useRef(items.length);
  lenRef.current = items.length;
  const [scrollY, setScrollY] = useState(index * ITEM_H);
  const ignoreScroll = useRef(false);

  useEffect(() => {
    const y = index * ITEM_H;
    ignoreScroll.current = true;
    setScrollY(y);
    if (!IS_WEB) {
      requestAnimationFrame(() => {
        ref.current?.scrollTo({ y, animated: false });
        ignoreScroll.current = false;
      });
    } else {
      ignoreScroll.current = false;
    }
  }, [index, items.length]);

  // Web: drag + wheel con translateY (no ScrollView anidado).
  useEffect(() => {
    if (!IS_WEB) return;
    const wrap = wrapRef.current as unknown as HTMLElement | null;
    if (!wrap || typeof wrap.addEventListener !== 'function') return;

    const maxY = () => Math.max(0, lenRef.current - 1) * ITEM_H;

    const commit = (y: number) => {
      const clamped = Math.max(0, Math.min(maxY(), y));
      const i = clampIndex(Math.round(clamped / ITEM_H), lenRef.current);
      const snapped = i * ITEM_H;
      setScrollY(snapped);
      if (i !== indexRef.current) onChangeRef.current(i);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setScrollY((prev) => {
        const next = Math.max(0, Math.min(maxY(), prev + e.deltaY));
        if (wheelSnap.current) clearTimeout(wheelSnap.current);
        wheelSnap.current = setTimeout(() => commit(next), 80);
        return next;
      });
    };
    const wheelSnap = { current: null as ReturnType<typeof setTimeout> | null };

    let dragging = false;
    let startY = 0;
    let startScroll = 0;
    let moved = false;
    let suppressClick = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button != null && e.button !== 0) return;
      // Tap en TextInput = tipar; drag (umbral) = scroll. Capture solo al mover.
      dragging = true;
      moved = false;
      suppressClick = false;
      startY = e.clientY;
      startScroll = Number(wrap.dataset.scrollY ?? indexRef.current * ITEM_H);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dy = startY - e.clientY;
      if (!moved && Math.abs(dy) > 4) {
        moved = true;
        try {
          wrap.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        const active = document.activeElement as HTMLElement | null;
        if (active && isEditableTarget(active)) {
          try {
            active.blur();
          } catch {
            /* ignore */
          }
        }
      }
      if (!moved) return;
      e.preventDefault();
      e.stopPropagation();
      const next = Math.max(0, Math.min(maxY(), startScroll + dy));
      wrap.dataset.scrollY = String(next);
      setScrollY(next);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        try {
          wrap.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        suppressClick = true;
        const y = Number(wrap.dataset.scrollY || 0);
        commit(y);
      }
    };

    const onClickCapture = (e: Event) => {
      if (!suppressClick) return;
      e.preventDefault();
      e.stopPropagation();
      suppressClick = false;
    };

    wrap.addEventListener('wheel', onWheel, { passive: false });
    // capture: antes que Pressable se coma el gesto
    wrap.addEventListener('pointerdown', onPointerDown, true);
    wrap.addEventListener('pointermove', onPointerMove, true);
    wrap.addEventListener('pointerup', onPointerUp, true);
    wrap.addEventListener('pointercancel', onPointerUp, true);
    wrap.addEventListener('click', onClickCapture, true);
    return () => {
      wrap.removeEventListener('wheel', onWheel);
      wrap.removeEventListener('pointerdown', onPointerDown, true);
      wrap.removeEventListener('pointermove', onPointerMove, true);
      wrap.removeEventListener('pointerup', onPointerUp, true);
      wrap.removeEventListener('pointercancel', onPointerUp, true);
      wrap.removeEventListener('click', onClickCapture, true);
      if (wheelSnap.current) clearTimeout(wheelSnap.current);
    };
  }, []);

  // Mantener dataset en sync para el drag
  useEffect(() => {
    if (!IS_WEB) return;
    const wrap = wrapRef.current as unknown as HTMLElement | null;
    if (wrap) wrap.dataset.scrollY = String(scrollY);
  }, [scrollY]);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (ignoreScroll.current) return;
    setScrollY(e.nativeEvent.contentOffset.y);
  }

  function onEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = e.nativeEvent.contentOffset.y;
    const i = clampIndex(Math.round(y / ITEM_H), items.length);
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

  function renderRows() {
    return items.map((item, i) => {
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
    });
  }

  return (
    <View
      ref={wrapRef as never}
      style={[styles.wrap, style, IS_WEB ? webWrap : null]}
    >
      <View style={styles.band} pointerEvents="none" />
      {IS_WEB ? (
        <View style={[styles.webTrack, { transform: [{ translateY: ITEM_H - scrollY }] }]}>
          {renderRows()}
        </View>
      ) : (
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
          keyboardShouldPersistTaps="handled"
        >
          {renderRows()}
        </ScrollView>
      )}
      {centerSlot ? (
        <View style={styles.centerOverlay} pointerEvents="box-none">
          {centerSlot}
        </View>
      ) : null}
    </View>
  );
}

const webBlur = IS_WEB ? ({ filter: 'blur(1.4px)' } as TextStyle) : null;

const webWrap = IS_WEB
  ? ({
      touchAction: 'none',
      overscrollBehavior: 'contain',
      userSelect: 'none',
      cursor: 'ns-resize',
    } as unknown as ViewStyle)
  : null;

const styles = StyleSheet.create({
  wrap: {
    height: ITEM_H * VISIBLE,
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  webTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
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
