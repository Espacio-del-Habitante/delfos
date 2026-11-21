import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Linking,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { colors, radius, space, type, card } from '../theme';
import { formatCop } from '../lib/format';
import { fetchWebSearchResults, type SearchHit } from '../lib/webSearch';

type Props = {
  visible: boolean;
  /** Query de búsqueda (producto). */
  query: string;
  photoDataUrl?: string | null;
  title?: string;
  onClose: () => void;
  onUsePrice?: (amount: number) => void;
};

/** Visor in-app de precios: resultados nativos + atajo a Google. */
export function InAppBrowser({
  visible,
  query,
  photoDataUrl,
  title = 'Buscar',
  onClose,
  onUsePrice,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [googleUrl, setGoogleUrl] = useState('');

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHits([]);
    void fetchWebSearchResults(query)
      .then((res) => {
        if (cancelled) return;
        setHits(res.hits);
        setGoogleUrl(res.googleUrl);
        if (!res.hits.length) setError('Sin resultados. Prueba Google.');
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message || 'No pude buscar ahora');
        setGoogleUrl(
          `https://www.google.com/search?hl=es-419&gl=co&q=${encodeURIComponent(`${query} precio Colombia`)}`,
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.chrome}>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Cerrar búsqueda"
            accessibilityRole="button"
          >
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Pressable
            onPress={() => googleUrl && void Linking.openURL(googleUrl)}
            hitSlop={8}
            style={styles.extBtn}
            accessibilityLabel="Abrir en Google"
          >
            <Text style={styles.extTxt}>↗</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {photoDataUrl ? (
            <View style={styles.photoBlock}>
              <Image source={{ uri: photoDataUrl }} style={styles.photo} />
              <Text style={styles.photoHint}>Foto del producto · buscando precios</Text>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}>Buscando precios…</Text>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {hits.map((h) => (
            <View key={h.url + h.title} style={styles.hit}>
              <Pressable onPress={() => void Linking.openURL(h.url)}>
                <Text style={styles.hitTitle}>{h.title}</Text>
                {!!h.snippet && <Text style={styles.hitSnippet}>{h.snippet}</Text>}
              </Pressable>
              <View style={styles.hitActions}>
                {h.approx != null ? (
                  <>
                    <Text style={styles.hitApprox}>aprox. {formatCop(h.approx)}</Text>
                    {onUsePrice ? (
                      <Pressable style={styles.useBtn} onPress={() => onUsePrice(h.approx!)}>
                        <Text style={styles.useBtnTxt}>Usar</Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.muted}>Sin monto claro</Text>
                )}
              </View>
            </View>
          ))}

          <Pressable
            style={styles.googleBtn}
            onPress={() => googleUrl && void Linking.openURL(googleUrl)}
          >
            <Text style={styles.googleBtnTxt}>Abrir en Google</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

/** @deprecated kept for callers that built embed URLs */
export function googleEmbedUrl(query: string) {
  const q = String(query || '').trim() || 'precio Colombia';
  return `https://www.google.com/search?hl=es-419&gl=co&q=${encodeURIComponent(`${q} precio Colombia`)}`;
}

export function googleExternalUrl(query: string) {
  return googleEmbedUrl(query);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, paddingTop: Platform.OS === 'web' ? 0 : 40 },
  chrome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: space.md,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  backGlyph: { fontSize: 28, lineHeight: 30, color: colors.text, marginTop: -2 },
  title: { flex: 1, ...type.title, fontSize: 16 },
  extBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  extTxt: { fontSize: 18, color: colors.muted },
  body: { padding: space.lg, paddingBottom: 48, gap: 12 },
  photoBlock: { alignItems: 'center', gap: 8, marginBottom: 4 },
  photo: { width: 120, height: 120, borderRadius: 16, backgroundColor: colors.bg },
  photoHint: { color: colors.muted, fontSize: 12, fontFamily: 'Inter_400Regular' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  muted: { color: colors.muted, fontSize: 12, fontFamily: 'Inter_400Regular' },
  error: { color: colors.danger, fontSize: 13, fontFamily: 'Inter_400Regular' },
  hit: {
    ...card(),
    padding: space.md,
    gap: 8,
  },
  hitTitle: { ...type.title, fontSize: 15, color: colors.primary },
  hitSnippet: { color: colors.muted, fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  hitActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  hitApprox: { color: colors.text, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  useBtn: {
    backgroundColor: 'rgba(27,122,74,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  useBtnTxt: { color: colors.primary, fontWeight: '700', fontSize: 12, fontFamily: 'Inter_700Bold' },
  googleBtn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  googleBtnTxt: { color: '#fff', fontWeight: '700', fontFamily: 'Inter_700Bold' },
});
