import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import type { TooltipProps } from '@wrack/react-native-tour-guide';
import { colors, radius } from '../../shared/theme';

const CARD_W = 312;

/** Extrae emoji inicial del título si viene embebido. */
function splitEmoji(title?: string) {
  const t = String(title || '').trim();
  const m = t.match(/^(\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*)\s*(.*)$/u);
  if (m) return { emoji: m[1], rest: m[2] || t };
  return { emoji: '🌿', rest: t };
}

/**
 * Tooltip custom MercApp: card centrada en X, anclada al hueco libre
 * arriba/abajo del spotlight (sin flecha rara).
 */
export function MercappTooltip({
  title,
  description,
  position,
  currentStep,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
  targetHeight = 0,
  screenWidth = 0,
  screenHeight = 0,
  insets = { top: 0, bottom: 0, left: 0, right: 0 },
  hideNextButton,
  hidePrevButton,
  hideSkipButton,
  nextDisabled,
  isLastStep,
  config,
}: TooltipProps) {
  const win = useWindowDimensions();
  const W = screenWidth || win.width;
  const H = screenHeight || win.height;
  const { emoji, rest } = splitEmoji(title);

  const targetTop = position.y;
  const targetBottom = position.y + targetHeight;
  const targetMidY = targetTop + targetHeight / 2;
  const safeTop = insets.top + 16;
  const safeBottom = H - insets.bottom - 16;
  const estimatedCardH = 236;
  const cardLeft = Math.max(16, (W - CARD_W) / 2);

  // Targets del bottom nav: card arriba, centrada en el hueco libre.
  // Targets del header: card debajo, con aire.
  // Otros: el hueco más grande, card centrada en ese hueco.
  let cardTop: number;
  if (targetMidY > H * 0.62) {
    const gapEnd = Math.max(safeTop + 8, targetTop - 20);
    cardTop = safeTop + Math.max(0, (gapEnd - safeTop - estimatedCardH) / 2);
  } else if (targetMidY < H * 0.28) {
    cardTop = Math.min(targetBottom + 18, safeBottom - estimatedCardH);
  } else {
    const spaceAbove = targetTop - safeTop;
    const spaceBelow = safeBottom - targetBottom;
    if (spaceBelow >= spaceAbove) {
      cardTop = targetBottom + 18;
      if (cardTop + estimatedCardH > safeBottom) {
        cardTop = Math.max(safeTop, safeBottom - estimatedCardH);
      }
    } else {
      cardTop = Math.max(safeTop, targetTop - estimatedCardH - 18);
    }
  }

  // currentStep viene 0-based en esta lib
  const stepNum = Math.min(totalSteps, Math.max(1, currentStep + 1));
  const isLast = isLastStep || stepNum >= totalSteps;
  const nextLabel =
    isLast
      ? config?.doneButtonText || 'Listo'
      : config?.nextButtonText || 'Siguiente';
  const prevLabel = config?.prevButtonText || 'Atrás';
  const skipLabel = config?.skipButtonText || 'Omitir';
  const progress = stepNum / Math.max(totalSteps, 1);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.layer, { width: W, height: H }]}
      accessibilityViewIsModal
    >
      <View style={[styles.card, { left: cardLeft, top: cardTop, width: CARD_W }]}>
        {!hideSkipButton && (
          <Pressable
            onPress={onSkip}
            hitSlop={10}
            style={({ pressed }) => [styles.skip, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={skipLabel}
          >
            <Text style={styles.skipTxt}>{skipLabel}</Text>
          </Pressable>
        )}

        <View style={styles.emojiWrap}>
          <Text style={styles.emoji}>{emoji}</Text>
        </View>

        <Text style={styles.title}>{rest}</Text>
        {!!description && <Text style={styles.body}>{description}</Text>}

        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.max(progress * 100, 8)}%` as `${number}%` }]} />
        </View>
        <Text style={styles.counter}>
          {stepNum} de {totalSteps}
        </Text>

        <View style={styles.actions}>
          {!hidePrevButton && stepNum > 1 && (
            <Pressable
              onPress={onPrev}
              style={({ pressed }) => [styles.btnGhost, pressed && styles.btnPressed]}
              accessibilityRole="button"
              accessibilityLabel={prevLabel}
            >
              <Text style={styles.btnGhostTxt}>{prevLabel}</Text>
            </Pressable>
          )}
          {!hideNextButton && (
            <Pressable
              onPress={onNext}
              disabled={nextDisabled}
              style={({ pressed }) => [
                styles.btnPrimary,
                nextDisabled && styles.btnDisabled,
                pressed && !nextDisabled && styles.btnPressed,
                { flex: 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={nextLabel}
            >
              <Text style={styles.btnPrimaryTxt}>{nextLabel}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
    zIndex: 10001,
  },
  card: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 28,
    paddingTop: 18,
    paddingBottom: 16,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(18, 36, 26, 0.06)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 16,
  },
  skip: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  skipTxt: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.muted,
  },
  emojiWrap: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: '#e8f5ee',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  emoji: { fontSize: 28 },
  title: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 20,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5ebe7',
    overflow: 'hidden',
    marginBottom: 6,
  },
  fill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  counter: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  btnPrimary: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  btnPrimaryTxt: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  btnGhost: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  btnGhostTxt: {
    color: colors.primaryDark,
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  btnPressed: { transform: [{ scale: 0.97 }] },
  btnDisabled: { backgroundColor: '#9ca3af' },
});
