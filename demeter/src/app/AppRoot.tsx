import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { MercadoScreen } from '../features/mercado/screens/MercadoScreen';
import { HistoryScreen } from '../features/history/screens/HistoryScreen';
import { StatsScreen } from '../features/stats/screens/StatsScreen';
import { SettingsScreen } from '../features/settings/screens/SettingsScreen';
import { BottomNav, type BottomNavId } from '../shared/BottomNav';
import { colors } from '../shared/theme';

export function AppRoot() {
  const [tab, setTab] = useState<BottomNavId>('mercado');

  return (
    <View style={styles.root}>
      <View style={styles.body}>
        {tab === 'mercado' && <MercadoScreen />}
        {tab === 'historial' && <HistoryScreen onNewTrip={() => setTab('mercado')} />}
        {tab === 'stats' && <StatsScreen />}
        {tab === 'ajustes' && <SettingsScreen />}
      </View>
      <BottomNav active={tab} onChange={setTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
});
