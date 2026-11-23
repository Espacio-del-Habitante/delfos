import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from './theme';

type Props = {
  message: string | null;
  /** 'info' verde oscuro · 'warn' ámber · 'error' rojo suave */
  tone?: 'info' | 'warn' | 'error';
  topOffset?: number;
  onHide?: () => void;
  durationMs?: number;
};

/** Snackbar flotante al estilo MercApp. */
export function AppToast({
  message,
  tone = 'info',
  topOffset,
  onHide,
  durationMs = 2800,
}: Props) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!message || !onHide) return;
    const t = setTimeout(onHide, durationMs);
    return () => clearTimeout(t);
  }, [message, onHide, durationMs]);

  if (!message) return null;

  const bg =
    tone === 'error'
      ? 'rgba(127, 29, 29, 0.94)'
      : tone === 'warn'
        ? 'rgba(120, 53, 15, 0.94)'
        : 'rgba(18, 36, 26, 0.92)';

  return (
    <View
      pointerEvents="none"
      style={[
        styles.toast,
        { top: topOffset ?? insets.top + 56, backgroundColor: bg },
      ]}
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.txt}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    left: 24,
    right: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.pill,
    zIndex: 200,
    elevation: 20,
  },
  txt: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
  },
});
