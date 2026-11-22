import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, radius, space, type, card } from '../../../shared/theme';
import { contentBottomPad } from '../../../shared/BottomNav';
import {
  getActiveTrip,
  getAiSettings,
  getShopProfile,
  subscribe,
  tripTotal,
} from '../../../services/store';
import { proposeRecipes, type RecipeIdea } from '../../../services/recipes';
import { shopProfileMeta } from '../../../domain/shopProfiles';
import { formatCop } from '../../../shared/format';
import { aiReady } from '../../../services/aiComplete';

export function RecipesScreen() {
  const insets = useSafeAreaInsets();
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [recipes, setRecipes] = useState<RecipeIdea[]>([]);
  const [source, setSource] = useState<'ai' | 'local' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);

  const trip = getActiveTrip();
  const items = trip?.items || [];
  const profile = getShopProfile();
  const meta = shopProfileMeta(profile);

  const run = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await proposeRecipes({ profile });
      setRecipes(res.recipes);
      setSource(res.source);
      if (res.error) setErr(res.error);
    } catch (e: any) {
      setErr(e?.message || 'No se pudieron proponer recetas');
    } finally {
      setBusy(false);
    }
  }, [profile, tick]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <StatusBar style="dark" />
      <Text style={styles.title}>Recetas</Text>
      <Text style={styles.lead}>
        Aquí verás propuestas de recetas para tu mercado — con lo que estás comprando
        ahora.
      </Text>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingBottom: contentBottomPad(insets.bottom, 24),
          gap: 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Perfil · {meta.chip}</Text>
          <Text style={styles.muted}>
            {items.length
              ? `${items.length} ítem${items.length === 1 ? '' : 's'} en el carrito · ${formatCop(tripTotal(trip))}`
              : 'Carrito vacío — suma productos en Mercado y vuelve.'}
          </Text>
          {!aiReady(getAiSettings()) ? (
            <Text style={styles.hint}>
              Sin IA configurada: usamos ideas locales. En Ajustes puedes activar Gemini /
              Ollama para propuestas más creativas.
            </Text>
          ) : (
            <Text style={styles.hint}>IA lista · las propuestas se piden bajo demanda.</Text>
          )}
          <Pressable
            disabled={busy || !items.length}
            onPress={() => void run()}
            style={({ pressed }) => [
              styles.btn,
              (!items.length || busy) && { opacity: 0.5 },
              pressed && items.length ? { opacity: 0.9 } : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Proponer recetas"
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnTxt}>Proponer recetas</Text>
            )}
          </Pressable>
        </View>

        {err ? <Text style={styles.err}>{err}</Text> : null}
        {source ? (
          <Text style={styles.source}>
            Fuente: {source === 'ai' ? 'IA' : 'ideas locales'}
          </Text>
        ) : null}

        {recipes.map((r) => (
          <View key={r.title} style={styles.recipe}>
            <Text style={styles.recipeTitle}>{r.title}</Text>
            <Text style={styles.recipeMeta}>
              {r.minutes} min · {r.vibe}
            </Text>
            {!!r.uses.length && (
              <Text style={styles.muted}>Usa: {r.uses.join(', ')}</Text>
            )}
            {!!r.missing.length && (
              <Text style={styles.missing}>Te falta: {r.missing.join(', ')}</Text>
            )}
            {r.steps.map((s, i) => (
              <Text key={`${r.title}-${i}`} style={styles.step}>
                {i + 1}. {s}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: {
    ...type.title,
    fontSize: 26,
    paddingHorizontal: space.lg,
    marginBottom: 4,
  },
  lead: {
    ...type.label,
    paddingHorizontal: space.lg,
    marginBottom: space.md,
    lineHeight: 18,
  },
  card: { ...card(), padding: space.lg, gap: 8 },
  cardLabel: { fontFamily: 'Inter_700Bold', fontSize: 15, color: colors.text },
  muted: { ...type.label, color: colors.muted },
  hint: { ...type.label, fontSize: 12, color: colors.muted },
  btn: {
    marginTop: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnTxt: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 },
  err: { color: colors.danger, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  source: { ...type.label, fontSize: 12 },
  recipe: { ...card(), padding: space.lg, gap: 6 },
  recipeTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, color: colors.text },
  recipeMeta: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.primary },
  missing: { color: '#b45309', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  step: { ...type.label, color: colors.text, lineHeight: 18 },
});
