import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../shared/theme';

type Props = { onDone: () => void };

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * Splash de marca (raro / una vez por arranque): el carrito “entra” al mercado.
 * Solo transform + opacity. Respeta reduce-motion.
 */
export function MercappSplash({ onDone }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const rootOp = useRef(new Animated.Value(1)).current;
  const logoOp = useRef(new Animated.Value(0)).current;
  const logoX = useRef(new Animated.Value(-56)).current;
  const logoRot = useRef(new Animated.Value(-10)).current;
  const logoScale = useRef(new Animated.Value(0.92)).current;
  const ringA = useRef(new Animated.Value(0)).current;
  const ringB = useRef(new Animated.Value(0)).current;
  const spark1 = useRef(new Animated.Value(0)).current;
  const spark2 = useRef(new Animated.Value(0)).current;
  const spark3 = useRef(new Animated.Value(0)).current;
  const tagOp = useRef(new Animated.Value(0)).current;
  const tagY = useRef(new Animated.Value(12)).current;
  const doneRef = useRef(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (alive) setReduceMotion(Boolean(v));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone();
    };

    if (reduceMotion) {
      const seq = Animated.sequence([
        Animated.timing(logoOp, {
          toValue: 1,
          duration: 220,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.delay(420),
        Animated.timing(rootOp, {
          toValue: 0,
          duration: 220,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
      ]);
      seq.start(({ finished }) => {
        if (finished) finish();
      });
      return () => seq.stop();
    }

    // Reset start values for the “cart rolls in” beat.
    logoX.setValue(-56);
    logoRot.setValue(-10);
    logoScale.setValue(0.92);
    logoOp.setValue(0);

    const intro = Animated.parallel([
      Animated.timing(logoOp, {
        toValue: 1,
        duration: 480,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(logoX, {
        toValue: 0,
        duration: 780,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(logoRot, {
        toValue: 0,
        duration: 780,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 780,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(ringA, {
        toValue: 1,
        duration: 900,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
    ]);

    const settle = Animated.parallel([
      Animated.timing(ringB, {
        toValue: 1,
        duration: 700,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(tagOp, {
        toValue: 1,
        duration: 420,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(tagY, {
        toValue: 0,
        duration: 420,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.stagger(100, [
        Animated.timing(spark1, {
          toValue: 1,
          duration: 240,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(spark2, {
          toValue: 1,
          duration: 240,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(spark3, {
          toValue: 1,
          duration: 240,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
      ]),
    ]);

    const pulse = Animated.sequence([
      Animated.timing(logoScale, {
        toValue: 1.04,
        duration: 220,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 280,
        easing: Easing.bezier(0.77, 0, 0.175, 1),
        useNativeDriver: true,
      }),
    ]);

    const exit = Animated.timing(rootOp, {
      toValue: 0,
      duration: 380,
      easing: EASE_OUT,
      useNativeDriver: true,
    });

    const seq = Animated.sequence([
      intro,
      settle,
      Animated.delay(180),
      pulse,
      Animated.delay(420),
      exit,
    ]);

    seq.start(({ finished }) => {
      if (finished) finish();
    });
    return () => seq.stop();
  }, [
    reduceMotion,
    onDone,
    rootOp,
    logoOp,
    logoX,
    logoRot,
    logoScale,
    ringA,
    ringB,
    spark1,
    spark2,
    spark3,
    tagOp,
    tagY,
  ]);

  const logoRotate = logoRot.interpolate({
    inputRange: [-10, 0],
    outputRange: ['-10deg', '0deg'],
  });

  return (
    <Animated.View
      style={[styles.root, { opacity: rootOp }]}
      pointerEvents="auto"
      accessibilityViewIsModal
      accessibilityLabel="MercApp cargando"
    >
      <LinearGradient
        colors={['#0f3d28', colors.primary, '#2f9e64']}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowBlob} />
      <View style={styles.glowBlobSoft} />

      <View style={styles.stage}>
        <Animated.View
          style={[
            styles.ring,
            styles.ringOuter,
            {
              opacity: ringA.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.28],
              }),
              transform: [
                {
                  scale: ringA.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.72, 1.18],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.ring,
            styles.ringInner,
            {
              opacity: ringB.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.4],
              }),
              transform: [
                {
                  scale: ringB.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1],
                  }),
                },
              ],
            },
          ]}
        />

        <Animated.View
          style={[
            styles.spark,
            styles.spark1,
            {
              opacity: spark1,
              transform: [
                {
                  scale: spark1.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.7, 1],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.spark,
            styles.spark2,
            {
              opacity: spark2,
              transform: [
                {
                  scale: spark2.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.7, 1],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.spark,
            styles.spark3,
            {
              opacity: spark3,
              transform: [
                {
                  scale: spark3.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.7, 1],
                  }),
                },
              ],
            },
          ]}
        />

        <Animated.View
          style={{
            opacity: logoOp,
            transform: [
              { translateX: logoX },
              { rotate: logoRotate },
              { scale: logoScale },
            ],
          }}
        >
          {/* Halo claro: el wordmark oscuro del logo se lee sobre el verde. */}
          <View style={styles.logoHalo}>
            <Image
              source={require('../../../assets/mercapp-logo.png')}
              style={styles.logo}
              accessibilityIgnoresInvertColors
              accessibilityLabel="Logo MercApp"
            />
          </View>
        </Animated.View>

        <Animated.View
          style={{
            opacity: tagOp,
            transform: [{ translateY: tagY }],
          }}
        >
          <Text style={styles.tag}>Tu compañera de mercado</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryDark,
  },
  glowBlob: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(134, 239, 172, 0.18)',
    top: '28%',
  },
  glowBlobSoft: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    bottom: '8%',
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 280,
    height: 280,
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  ringOuter: { width: 220, height: 220 },
  ringInner: { width: 168, height: 168, borderColor: 'rgba(187, 247, 208, 0.7)' },
  spark: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#bbf7d0',
  },
  spark1: { top: 42, right: 58 },
  spark2: { top: 68, right: 36, width: 6, height: 6 },
  spark3: { top: 34, right: 88, width: 5, height: 5, backgroundColor: '#fff' },
  logoHalo: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 36,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 14,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 10,
  },
  logo: {
    width: 168,
    height: 158,
    resizeMode: 'contain',
  },
  tag: {
    marginTop: 22,
    color: 'rgba(255,255,255,0.95)',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
});
