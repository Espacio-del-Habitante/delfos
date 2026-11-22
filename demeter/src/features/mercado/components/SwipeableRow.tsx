import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius } from '../../../shared/theme';

const ACTION = 88;
const OPEN_AT = ACTION * 0.45;

type Props = {
  children: ReactNode;
  onDelete: () => void;
  onPress?: () => void;
  /** Solo una fila abierta a la vez. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Deslizar a la izquierda → revela Quitar. Sin deps nuevas (PanResponder). */
export function SwipeableRow({ children, onDelete, onPress, open, onOpenChange }: Props) {
  const x = useRef(new Animated.Value(0)).current;
  const openRef = useRef(open);
  openRef.current = open;
  const startX = useRef(0);

  useEffect(() => {
    Animated.spring(x, {
      toValue: open ? -ACTION : 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 18,
    }).start();
  }, [open, x]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderGrant: () => {
        x.stopAnimation((v) => {
          startX.current = typeof v === 'number' ? v : openRef.current ? -ACTION : 0;
        });
      },
      onPanResponderMove: (_, g) => {
        const next = Math.min(0, Math.max(-ACTION, startX.current + g.dx));
        x.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const projected = startX.current + g.dx + g.vx * 40;
        const shouldOpen = projected < -OPEN_AT || g.vx < -0.55;
        onOpenChange(shouldOpen);
        Animated.spring(x, {
          toValue: shouldOpen ? -ACTION : 0,
          useNativeDriver: true,
          bounciness: 0,
          speed: 18,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(x, {
          toValue: openRef.current ? -ACTION : 0,
          useNativeDriver: true,
          bounciness: 0,
          speed: 18,
        }).start();
      },
    }),
  ).current;

  return (
    <View style={styles.wrap}>
      <View style={styles.actions} pointerEvents={open ? 'auto' : 'none'}>
        <Pressable
          style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.88 }]}
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel="Quitar producto"
        >
          <Text style={styles.deleteTxt}>Quitar</Text>
        </Pressable>
      </View>
      <Animated.View
        style={{ transform: [{ translateX: x }] }}
        {...pan.panHandlers}
      >
        <Pressable
          onPress={() => {
            if (openRef.current) {
              onOpenChange(false);
              return;
            }
            onPress?.();
          }}
        >
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.md,
  },
  actions: {
    ...StyleSheet.absoluteFill,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 0,
  },
  deleteBtn: {
    width: ACTION,
    height: '100%',
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  deleteTxt: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
});
