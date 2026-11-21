import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/** Soft UI monocromático — relieve por sombras, sin bordes duros. */
export const colors = {
  bg: '#eef0f4',
  surface: '#eef0f4',
  text: '#2a2f3a',
  muted: '#8a93a6',
  accent: '#4a5568',
  softDark: '#c5ccd8',
  softLight: '#ffffff',
  danger: '#a66b6b',
  micListen: '#a66b6b',
  // legacy aliases used lightly
  primary: '#4a5568',
  primaryDark: '#2a2f3a',
  soft: '#dfe3ea',
  border: 'transparent',
  heroFrom: '#eef0f4',
  heroTo: '#eef0f4',
};

export const space = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 18,
  md: 24,
  lg: 32,
  pill: 999,
};

const webRaised =
  '-8px -8px 16px #ffffff, 8px 8px 16px rgba(163, 177, 198, 0.45)' as unknown as string;
const webInset =
  'inset 6px 6px 12px rgba(163, 177, 198, 0.45), inset -6px -6px 12px #ffffff' as unknown as string;
const webRaisedSm =
  '-4px -4px 10px #ffffff, 4px 4px 10px rgba(163, 177, 198, 0.4)' as unknown as string;
const webInsetSm =
  'inset 4px 4px 8px rgba(163, 177, 198, 0.4), inset -4px -4px 8px #ffffff' as unknown as string;

export function softRaised(size: 'sm' | 'md' = 'md'): ViewStyle {
  if (Platform.OS === 'web') {
    return {
      backgroundColor: colors.bg,
      boxShadow: size === 'sm' ? webRaisedSm : webRaised,
    } as ViewStyle;
  }
  return {
    backgroundColor: colors.bg,
    shadowColor: '#a3b1c6',
    shadowOffset: { width: size === 'sm' ? 4 : 6, height: size === 'sm' ? 4 : 6 },
    shadowOpacity: 0.4,
    shadowRadius: size === 'sm' ? 8 : 12,
    elevation: size === 'sm' ? 4 : 7,
  };
}

/** Campos hundidos — inset en web; tono más frío en nativo. */
export function softInset(size: 'sm' | 'md' = 'md'): ViewStyle {
  if (Platform.OS === 'web') {
    return {
      backgroundColor: colors.bg,
      boxShadow: size === 'sm' ? webInsetSm : webInset,
      borderWidth: 0,
    } as ViewStyle;
  }
  return {
    backgroundColor: '#e4e7ed',
    borderWidth: 0,
    shadowColor: 'transparent',
    elevation: 0,
  };
}

export function softPressed(): ViewStyle {
  if (Platform.OS === 'web') {
    return {
      backgroundColor: colors.bg,
      boxShadow: webInsetSm,
    } as ViewStyle;
  }
  return {
    backgroundColor: '#e2e5eb',
  };
}

export const type = {
  brand: {
    fontFamily: 'Inter_800ExtraBold',
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.6,
  } as TextStyle,
  title: {
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.4,
  } as TextStyle,
  body: {
    fontFamily: 'Inter_400Regular',
    fontWeight: '400',
    color: colors.text,
  } as TextStyle,
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  } as TextStyle,
};
