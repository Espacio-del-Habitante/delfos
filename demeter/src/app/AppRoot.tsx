import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { MercadoScreen } from '../features/mercado/screens/MercadoScreen';
import { RecipesScreen } from '../features/recipes/screens/RecipesScreen';
import { HistoryScreen } from '../features/history/screens/HistoryScreen';
import { StatsScreen } from '../features/stats/screens/StatsScreen';
import { SettingsScreen } from '../features/settings/screens/SettingsScreen';
import { BottomNav, type BottomNavId } from '../shared/BottomNav';
import { TourBootstrap } from '../features/onboarding/TourBootstrap';
import { colors } from '../shared/theme';

export function AppRoot() {
  const [tab, setTab] = useState<BottomNavId>('mercado');
  const [tourForce, setTourForce] = useState(0);

  return (
    <View style={styles.root}>
      <View style={styles.body}>
        {tab === 'mercado' && (
          <MercadoScreen onOpenSettings={() => setTab('ajustes')} />
        )}
        {tab === 'recetas' && <RecipesScreen />}
        {tab === 'historial' && <HistoryScreen onNewTrip={() => setTab('mercado')} />}
        {tab === 'stats' && <StatsScreen />}
        {tab === 'ajustes' && (
          <SettingsScreen onReplayTour={() => setTourForce((n) => n + 1)} />
        )}
      </View>
      <BottomNav active={tab} onChange={setTab} />
      <TourBootstrap go={setTab} forceToken={tourForce} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
});
