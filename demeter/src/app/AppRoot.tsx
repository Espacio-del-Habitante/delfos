import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MercadoScreen } from '../features/mercado/screens/MercadoScreen';
import { HistoryScreen } from '../features/history/screens/HistoryScreen';
import { StatsScreen } from '../features/stats/screens/StatsScreen';
import { SettingsScreen } from '../features/settings/screens/SettingsScreen';
import { colors, radius, space } from '../shared/theme';

export type TabId = 'mercado' | 'historial' | 'stats' | 'ajustes';

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'mercado', label: 'Mercado', icon: '🛒' },
  { id: 'historial', label: 'Historial', icon: '📜' },
  { id: 'stats', label: 'Stats', icon: '📊' },
  { id: 'ajustes', label: 'Ajustes', icon: '⚙' },
];

export function AppRoot() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabId>('mercado');

  return (
    <View style={styles.root}>
      <View style={styles.body}>
        {tab === 'mercado' && <MercadoScreen />}
        {tab === 'historial' && <HistoryScreen onNewTrip={() => setTab('mercado')} />}
        {tab === 'stats' && <StatsScreen />}
        {tab === 'ajustes' && <SettingsScreen />}
      </View>

      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={({ pressed }) => [styles.tab, pressed && { opacity: 0.85 }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.label}
            >
              <Text style={[styles.tabIcon, on && styles.tabIconOn]}>{t.icon}</Text>
              <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingTop: 8,
    paddingHorizontal: space.sm,
    gap: 4,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4, borderRadius: radius.sm },
  tabIcon: { fontSize: 18, opacity: 0.55 },
  tabIconOn: { opacity: 1 },
  tabLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: colors.muted,
  },
  tabLabelOn: { color: colors.primary },
});
