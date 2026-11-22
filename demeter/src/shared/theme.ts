import { type TextStyle, type ViewStyle } from 'react-native';

/** Alineado a Delfos: superficie blanca, sombra suave, borde sutil. Sin neumorfismo. */
export const colors = {
  bg: '#f6f7fb',
  surface: '#ffffff',
  surfaceSoft: 'rgba(255, 255, 255, 0.92)',
  primary: '#1b7a4a',
  primaryDark: '#166534',
  text: '#111827',
  muted: '#6b7280',
  border: 'rgba(15, 23, 42, 0.08)',
  danger: '#ef4444',
  soft: '#86efac',
  micListen: '#dc2626',
  // aliases
  accent: '#1b7a4a',
  softDark: '#d1d5db',
  softLight: '#ffffff',
  heroFrom: '#1b7a4a',
  heroTo: '#14532d',
};

export const space = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
};

export const radius = {
  sm: 16,
  md: 24,
  lg: 28,
  pill: 999,
};

export function card(): ViewStyle {
  return {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  };
}

export function field(): ViewStyle {
  return {
    backgroundColor: 'rgba(246, 247, 251, 0.9)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  };
}

export function chip(): ViewStyle {
  return {
    backgroundColor: 'rgba(240, 253, 244, 0.95)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(27, 122, 74, 0.16)',
  };
}

export function chipOn(): ViewStyle {
  return {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  };
}

export const type = {
  brand: {
    fontFamily: 'Inter_800ExtraBold',
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  } as TextStyle,
  title: {
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
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
  } as TextStyle,
};
