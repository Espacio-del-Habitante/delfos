import { useCallback, useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { TourGuideProvider, TourGuideOverlay } from '@wrack/react-native-tour-guide';
import { LinearGradient } from 'expo-linear-gradient';
import { AppRoot } from './src/app/AppRoot';
import { MercappSplash } from './src/features/onboarding/MercappSplash';
import { colors } from './src/shared/theme';

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const [splashDone, setSplashDone] = useState(false);
  const onSplashDone = useCallback(() => setSplashDone(true), []);

  if (!fontsLoaded) {
    return (
      <View style={styles.boot}>
        <LinearGradient
          colors={['#0f3d28', colors.primary, '#2f9e64']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Image
          source={require('./assets/mercapp-logo.png')}
          style={styles.bootLogo}
          accessibilityLabel="MercApp"
        />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <TourGuideProvider>
        {splashDone ? (
          <>
            <AppRoot />
            <TourGuideOverlay />
          </>
        ) : (
          <MercappSplash onDone={onSplashDone} />
        )}
      </TourGuideProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryDark,
  },
  bootLogo: { width: 148, height: 140, resizeMode: 'contain', opacity: 0.92 },
});
