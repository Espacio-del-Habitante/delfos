import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, radius, space, type, card, field } from '../../../shared/theme';
import { contentBottomPad } from '../../../shared/BottomNav';
import {
  getActiveTrip,
  getAiSettings,
  getShopProfile,
  getTripById,
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

type Props = {
  /** Mercado del historial a consultar; null = activo. */
  focusTripId?: string | null;
  onFocusConsumed?: () => void;
};

export function RecipesScreen({ focusTripId = null, onFocusConsumed }: Props) {
  const insets = useSafeAreaInsets();
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [recipes, setRecipes] = useState<RecipeIdea[]>([]);
  const [source, setSource] = useState<'ai' | 'local' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<'info' | 'warn' | 'error'>('info');
  const [info, setInfo] = useState<{ title: string; body: string } | null>(null);
  const [selected, setSelected] = useState<RecipeIdea | null>(null);
  const [note, setNote] = useState('');
  const [boundTripId, setBoundTripId] = useState<string | null>(null);

  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);

  const trip = boundTripId ? getTripById(boundTripId) : getActiveTrip();
  const items = trip?.items || [];
  const profile = getShopProfile();
  const meta = shopProfileMeta(profile);
  const fromHistory = Boolean(boundTripId && trip && trip.status === 'closed');

  // Hidrata últimas recetas guardadas del trip (activo o enfocado).
  useEffect(() => {
    const t = boundTripId ? getTripById(boundTripId) : getActiveTrip();
    if (t?.recipes?.length) {
      setRecipes(t.recipes);
      setSource('ai');
      if (t.recipesNote) setNote(t.recipesNote);
    } else if (!boundTripId) {
      setRecipes([]);
      setSource(null);
    }
  }, [tick, boundTripId]);

  // Enfoque desde historial: carga recetas o deja listo para preguntar.
  useEffect(() => {
    if (!focusTripId) return;
    setBoundTripId(focusTripId);
    const t = getTripById(focusTripId);
    if (t?.recipes?.length) {
      setRecipes(t.recipes);
      setSource('ai');
      if (t.recipesNote) setNote(t.recipesNote);
    } else {
      setRecipes([]);
      setSource(null);
    }
    onFocusConsumed?.();
  }, [focusTripId, onFocusConsumed]);

  const showToast = useCallback((msg: string, tone: 'info' | 'warn' | 'error' = 'info') => {
    setToastTone(tone);
    setToast(msg);
  }, []);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const res = await proposeRecipes({
        profile,
        tripId: trip?.id || boundTripId,
        note,
      });
      setRecipes(res.recipes);
      setSource(res.source);
      if (res.tripId) setBoundTripId(res.tripId);
      if (res.notice) showToast(res.notice, res.noticeTone || 'warn');
      else if (res.recipes.length) {
        showToast(
          fromHistory
            ? 'Listo · quedó guardado en ese mercado'
            : 'Listo · toca una card y cocina la idea',
          'info',
        );
      }
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
  }, [profile, trip?.id, boundTripId, note, fromHistory, showToast, tick]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <StatusBar style="dark" />
      <Text style={styles.title}>Recetas</Text>
      <Text style={styles.lead}>
        {fromHistory
          ? `Ideas con lo que compraste en ${trip?.storeName || 'ese mercado'}. Quedan guardadas ahí.`
          : 'Ideas para cocinar con lo del carrito. Se guardan en el mercado; si preguntas otra vez, queda la más reciente.'}
      </Text>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingBottom: contentBottomPad(insets.bottom, 24),
          gap: 12,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardLabel}>
            {fromHistory ? `Historial · ${meta.chip}` : `Perfil · ${meta.chip}`}
          </Text>
          <Text style={styles.muted}>
            {items.length
              ? `${items.length} cosa${items.length === 1 ? '' : 's'} · ${formatCop(tripTotal(trip))}`
              : 'Carrito vacío · suma en Mercado y vuelve a cocinar ideas.'}
          </Text>
          {!aiReady(getAiSettings()) ? (
            <Text style={styles.hint}>
              Sin IA aún: usamos ideas caseras. En Ajustes puedes encender Gemini u Ollama
              para sorprenderte más.
            </Text>
          ) : (
            <Text style={styles.hint}>IA lista · escribe un antojo o pide propuestas.</Text>
          )}

          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Ej: algo liviano · con pollo · para la semana"
            placeholderTextColor={colors.muted}
            editable={!busy}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (items.length && !busy) void run();
            }}
            accessibilityLabel="Qué te provoca cocinar"
          />

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
              <Text style={styles.btnTxt}>
                {recipes.length ? 'Preguntar de nuevo' : '¿Qué cocino?'}
              </Text>
            )}
          </Pressable>
          {fromHistory ? (
            <Pressable
              onPress={() => {
                setBoundTripId(null);
                setNote('');
                const active = getActiveTrip();
                setRecipes(active?.recipes || []);
                setSource(active?.recipes?.length ? 'ai' : null);
              }}
              style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.75 }]}
            >
              <Text style={styles.linkTxt}>Volver al carrito activo</Text>
            </Pressable>
          ) : null}
        </View>

        {source ? (
          <Text style={styles.source}>
            {source === 'ai' ? 'Con ayuda de la IA' : 'Ideas caseras del carrito'}
            {recipes.some((r) => r.imageUrl) ? ' · con fotito' : ''}
            {trip?.recipesAt ? ' · guardadas en este mercado' : ''}
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
                  {r.kcalApprox != null ? ` · ≈${r.kcalApprox} kcal` : ''}
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
  noteInput: {
    ...field(),
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
  },
  btn: {
    marginTop: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnTxt: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 },
  linkBtn: { alignItems: 'center', paddingVertical: 6 },
  linkTxt: { color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
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
