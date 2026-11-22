import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
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
import { friendlyError } from '../../../shared/appError';
import { AppToast } from '../../../shared/AppToast';
import { InfoModal } from '../../../shared/InfoModal';
import { RecipeDetailSheet } from '../components/RecipeDetailSheet';

export function RecipesScreen() {
  const insets = useSafeAreaInsets();
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [recipes, setRecipes] = useState<RecipeIdea[]>([]);
  const [source, setSource] = useState<'ai' | 'local' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<'info' | 'warn' | 'error'>('info');
  const [info, setInfo] = useState<{ title: string; body: string } | null>(null);
  const [selected, setSelected] = useState<RecipeIdea | null>(null);

  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);

  const trip = getActiveTrip();
  const items = trip?.items || [];
  const profile = getShopProfile();
  const meta = shopProfileMeta(profile);

  const showToast = useCallback((msg: string, tone: 'info' | 'warn' | 'error' = 'info') => {
    setToastTone(tone);
    setToast(msg);
  }, []);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const res = await proposeRecipes({ profile });
      setRecipes(res.recipes);
      setSource(res.source);
      if (res.notice) showToast(res.notice, res.noticeTone || 'warn');
      else if (res.recipes.length) showToast('Listo · toca una card y cocina la idea', 'info');
    } catch (e) {
      const msg = friendlyError(e, 'No salieron recetas esta vez');
      showToast(msg, 'error');
      setInfo({
        title: 'Las recetas se tomaron el día',
        body: `${msg}\n\nRevisa la red o la IA en Ajustes. Mientras, sigue sumando al carrito — luego lo intentamos otra vez.`,
      });
    } finally {
      setBusy(false);
    }
  }, [profile, tick, showToast]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <StatusBar style="dark" />
      <Text style={styles.title}>Recetas</Text>
      <Text style={styles.lead}>
        Ideas para cocinar con lo que vas metiendo al carrito. Toca una card y te
        contamos el paso a paso.
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
              ? `${items.length} cosa${items.length === 1 ? '' : 's'} en el carrito · ${formatCop(tripTotal(trip))}`
              : 'Carrito vacío · suma en Mercado y vuelve a cocinar ideas.'}
          </Text>
          {!aiReady(getAiSettings()) ? (
            <Text style={styles.hint}>
              Sin IA aún: usamos ideas caseras. En Ajustes puedes encender Gemini u Ollama
              para sorprenderte más.
            </Text>
          ) : (
            <Text style={styles.hint}>IA lista · pide propuestas cuando quieras.</Text>
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
              <Text style={styles.btnTxt}>¿Qué cocino?</Text>
            )}
          </Pressable>
        </View>

        {source ? (
          <Text style={styles.source}>
            {source === 'ai' ? 'Con ayuda de la IA' : 'Ideas caseras del carrito'}
            {recipes.some((r) => r.imageUrl) ? ' · con fotito' : ''}
          </Text>
        ) : null}

        {recipes.map((r) => (
          <Pressable
            key={r.title}
            onPress={() => setSelected(r)}
            style={({ pressed }) => [styles.recipe, pressed && { opacity: 0.92 }]}
            accessibilityRole="button"
            accessibilityLabel={`Ver receta ${r.title}`}
          >
            <View style={styles.recipeTop}>
              {r.imageUrl ? (
                <Image source={{ uri: r.imageUrl }} style={styles.thumb} />
              ) : (
                <View style={styles.thumbEmoji}>
                  <Text style={{ fontSize: 28 }}>{r.emoji || '🍽️'}</Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={styles.recipeTitle} numberOfLines={2}>
                  {r.title}
                </Text>
                <Text style={styles.recipeMeta}>
                  {r.minutes} min · {r.vibe}
                </Text>
                {!!r.description && (
                  <Text style={styles.muted} numberOfLines={2}>
                    {r.description}
                  </Text>
                )}
              </View>
            </View>
            {!!r.missing.length && (
              <Text style={styles.missing} numberOfLines={1}>
                Te falta: {r.missing.join(', ')}
              </Text>
            )}
            <Text style={styles.tapHint}>Toca para ver cómo se hace →</Text>
          </Pressable>
        ))}
      </ScrollView>

      <RecipeDetailSheet
        recipe={selected}
        visible={Boolean(selected)}
        onClose={() => setSelected(null)}
      />
      <InfoModal
        visible={Boolean(info)}
        title={info?.title || ''}
        body={info?.body || ''}
        onClose={() => setInfo(null)}
      />
      <AppToast
        message={toast}
        tone={toastTone}
        onHide={() => setToast(null)}
      />
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
  source: { ...type.label, fontSize: 12 },
  recipe: { ...card(), padding: space.md, gap: 8 },
  recipeTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 72, height: 72, borderRadius: 16, backgroundColor: colors.bg },
  thumbEmoji: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: 'rgba(27, 122, 74, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: colors.text },
  recipeMeta: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.primary },
  missing: { color: '#b45309', fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  tapHint: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: colors.muted,
  },
});
