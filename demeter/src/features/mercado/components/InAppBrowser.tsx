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
import { colors, radius, space, type, card } from '../../../shared/theme';
import { formatCop } from '../../../shared/format';
import { fetchWebSearchResults, type SearchHit } from '../../../services/webSearch';

type Props = {
  visible: boolean;
  query: string;
  photoDataUrl?: string | null;
  title?: string;
  onClose: () => void;
  onUsePrice?: (amount: number) => void;
};

/** Visor in-app: cards organizadas (scrape + IA opcional) + atajo a Google. */
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
  const [organizedBy, setOrganizedBy] = useState<'ai' | 'scrape'>('scrape');

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
        setOrganizedBy(res.organizedBy);
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
              <Text style={styles.photoHint}>Tu foto · precios afuera</Text>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}>Buscando y organizando…</Text>
            </View>
          ) : null}

          {!loading && hits.length > 0 ? (
            <Text style={styles.sourceHint}>
              {organizedBy === 'ai' ? 'Organizado con tu IA' : 'Precios encontrados en la web'}
            </Text>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {hits.map((h) => (
            <Pressable
              key={h.url + h.title}
              style={({ pressed }) => [styles.hit, pressed && { opacity: 0.92 }]}
              onPress={() => void Linking.openURL(h.url)}
            >
              <View style={styles.hitMedia}>
                {h.image ? (
                  <Image source={{ uri: h.image }} style={styles.hitImg} />
                ) : (
                  <View style={[styles.hitImg, styles.hitImgFallback]}>
                    <Text style={styles.hitImgLetter}>{(h.store || '?').slice(0, 1)}</Text>
                  </View>
                )}
              </View>
              <View style={styles.hitBody}>
                <Text style={styles.storeBadge}>{h.store}</Text>
                <Text style={styles.hitTitle} numberOfLines={2}>
                  {h.title}
                </Text>
                <Text style={styles.hitSnippet} numberOfLines={2}>
                  {h.snippet}
                </Text>
                <View style={styles.hitActions}>
                  {h.approx != null ? (
                    <Text style={styles.hitApprox}>{formatCop(h.approx)}</Text>
                  ) : (
                    <Text style={styles.muted}>Sin precio claro</Text>
                  )}
                  {h.approx != null && onUsePrice ? (
                    <Pressable style={styles.useBtn} onPress={() => onUsePrice(h.approx!)}>
                      <Text style={styles.useBtnTxt}>Usar</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </Pressable>
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

export function googleEmbedUrl(query: string) {
  const q = String(query || '').trim() || 'precio Colombia';
  return `https://www.google.com/search?hl=es-419&gl=co&q=${encodeURIComponent(`${q} precio Colombia`)}`;
}

export function googleExternalUrl(query: string) {
  return googleEmbedUrl(query);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: Platform.OS === 'web' ? 0 : 40 },
  chrome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: space.md,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
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
  photo: { width: 112, height: 112, borderRadius: 18, backgroundColor: colors.surface },
  photoHint: { color: colors.muted, fontSize: 12, fontFamily: 'Inter_400Regular' },
  sourceHint: {
    ...type.label,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  muted: { color: colors.muted, fontSize: 12, fontFamily: 'Inter_400Regular' },
  error: { color: colors.danger, fontSize: 13, fontFamily: 'Inter_400Regular' },
  hit: {
    ...card(),
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    alignItems: 'stretch',
  },
  hitMedia: { justifyContent: 'center' },
  hitImg: { width: 72, height: 72, borderRadius: 14, backgroundColor: colors.bg },
  hitImgFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(27,122,74,0.12)' },
  hitImgLetter: { color: colors.primary, fontWeight: '800', fontSize: 22, fontFamily: 'Inter_800ExtraBold' },
  hitBody: { flex: 1, minWidth: 0, gap: 4 },
  storeBadge: {
    alignSelf: 'flex-start',
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  hitTitle: { ...type.title, fontSize: 15, color: colors.text },
  hitSnippet: { color: colors.muted, fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  hitActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
  },
  hitApprox: { color: colors.text, fontWeight: '800', fontSize: 16, fontFamily: 'Inter_800ExtraBold' },
  useBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  useBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 12, fontFamily: 'Inter_700Bold' },
  googleBtn: {
    marginTop: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  googleBtnTxt: { color: colors.text, fontWeight: '700', fontFamily: 'Inter_700Bold' },
});
