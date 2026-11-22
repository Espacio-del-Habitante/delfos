import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import type { TooltipProps } from '@wrack/react-native-tour-guide';
import { colors, radius } from '../../shared/theme';

const CARD_W = 312;
const ARROW = 12;
const GAP = 10;

/** Extrae emoji inicial del título si viene embebido. */
function splitEmoji(title?: string) {
  const t = String(title || '').trim();
  const m = t.match(
    /^(\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*)\s*(.*)$/u,
  );
  if (m) return { emoji: m[1], rest: m[2] || t };
  return { emoji: '🌿', rest: t };
}

/**
 * Tooltip MercApp: card anclada al target, centrada bajo/sobre el foco,
 * con “poquito” (flecha) apuntando al elemento.
 */
export function MercappTooltip({
  title,
  description,
  position,
  tooltipPosition: tipPos = 'auto',
  currentStep,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
  targetHeight = 0,
  targetWidth = 0,
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
  const [cardH, setCardH] = useState(236);

  const targetTop = position.y;
  const targetBottom = position.y + targetHeight;
  const targetMidX = position.x + targetWidth / 2;
  const targetMidY = targetTop + targetHeight / 2;
  const safeTop = insets.top + 12;
  const safeBottom = H - insets.bottom - 12;

  let placeBelow: boolean;
  if (tipPos === 'bottom') placeBelow = true;
  else if (tipPos === 'top') placeBelow = false;
  else if (targetMidY > H * 0.58) placeBelow = false;
  else if (targetMidY < H * 0.32) placeBelow = true;
  else placeBelow = safeBottom - targetBottom >= targetTop - safeTop;

  // Ancla horizontal al target. Si el foco está a la izquierda (logo),
  // la card se corre para que el logo quede sobre el tercio izquierdo —
  // centrar 312px bajo un logo pegado al borde es imposible.
  const leftBias = targetMidX < W * 0.38 ? 0.3 : targetMidX > W * 0.62 ? 0.7 : 0.5;
  let cardLeft = targetMidX - CARD_W * leftBias;
  cardLeft = Math.max(14, Math.min(cardLeft, W - CARD_W - 14));

  let cardTop: number;
  if (placeBelow) {
    cardTop = targetBottom + GAP + ARROW;
    if (cardTop + cardH > safeBottom) {
      cardTop = Math.max(safeTop + ARROW, safeBottom - cardH);
    }
  } else {
    cardTop = targetTop - GAP - ARROW - cardH;
    if (cardTop < safeTop) {
      cardTop = safeTop;
    }
  }

  // Poquito alineado al centro del target.
  let arrowLeft = targetMidX - cardLeft - ARROW;
  arrowLeft = Math.max(20, Math.min(arrowLeft, CARD_W - 20 - ARROW * 2));

  const stepNum = Math.min(totalSteps, Math.max(1, currentStep + 1));
  const isLast = isLastStep || stepNum >= totalSteps;
  const nextLabel = isLast
    ? config?.doneButtonText || 'Listo'
    : config?.nextButtonText || 'Siguiente';
  const prevLabel = config?.prevButtonText || 'Atrás';
  const skipLabel = config?.skipButtonText || 'Omitir';
  const progress = stepNum / Math.max(totalSteps, 1);

  function onCardLayout(e: LayoutChangeEvent) {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - cardH) > 2) setCardH(h);
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.layer, { width: W, height: H }]}
      accessibilityViewIsModal
    >
      <View
        onLayout={onCardLayout}
        style={[styles.card, { left: cardLeft, top: cardTop, width: CARD_W }]}
      >
        {/* Poquito / caret hacia el target */}
        {placeBelow ? (
          <View style={[styles.arrowUp, { left: arrowLeft }]} />
        ) : (
          <View style={[styles.arrowDown, { left: arrowLeft }]} />
        )}

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
  arrowUp: {
    position: 'absolute',
    top: -ARROW + 1,
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderLeftWidth: ARROW,
    borderRightWidth: ARROW,
    borderBottomWidth: ARROW,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#fff',
  },
  arrowDown: {
    position: 'absolute',
    bottom: -ARROW + 1,
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderLeftWidth: ARROW,
    borderRightWidth: ARROW,
    borderTopWidth: ARROW,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fff',
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
