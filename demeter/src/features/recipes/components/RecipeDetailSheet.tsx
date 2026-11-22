import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space, type, card } from '../../../shared/theme';
import { floatingDockBottom } from '../../../shared/BottomNav';
import type { RecipeIdea } from '../../../services/recipes';

type Props = {
  recipe: RecipeIdea | null;
  visible: boolean;
  onClose: () => void;
};

export function RecipeDetailSheet({ recipe, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  if (!recipe) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            bottom: floatingDockBottom(insets.bottom),
            maxHeight: '82%',
            paddingBottom: space.md,
          },
        ]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingBottom: 8 }}
        >
          <View style={styles.hero}>
            {recipe.imageUrl ? (
              <Image
                source={{ uri: recipe.imageUrl }}
                style={styles.heroImg}
                resizeMode="cover"
                accessibilityLabel={`Foto de ${recipe.title}`}
              />
            ) : (
              <View style={styles.heroEmojiWrap}>
                <Text style={styles.heroEmoji}>{recipe.emoji || '🍽️'}</Text>
              </View>
            )}
          </View>

          <Text style={styles.title}>{recipe.title}</Text>
          <Text style={styles.meta}>
            {recipe.minutes} min · {recipe.vibe}
          </Text>
          {!!recipe.description && (
            <Text style={styles.desc}>{recipe.description}</Text>
          )}

          {!!recipe.uses.length && (
            <View style={styles.block}>
              <Text style={styles.blockLabel}>Ya lo tienes</Text>
              <Text style={styles.blockBody}>{recipe.uses.join(' · ')}</Text>
            </View>
          )}
          {!!recipe.missing.length && (
            <View style={styles.block}>
              <Text style={[styles.blockLabel, { color: '#b45309' }]}>Si quieres, suma</Text>
              <Text style={styles.blockBody}>{recipe.missing.join(' · ')}</Text>
            </View>
          )}

          <Text style={styles.blockLabel}>Cómo se hace</Text>
          {recipe.steps.map((s, i) => (
            <View key={`${recipe.title}-d-${i}`} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumTxt}>{i + 1}</Text>
              </View>
              <Text style={styles.stepTxt}>{s}</Text>
            </View>
          ))}

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.9 }]}
            accessibilityRole="button"
            accessibilityLabel="Cerrar receta"
          >
            <Text style={styles.closeTxt}>Listo, gracias</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,23,42,0.35)' },
  sheet: {
    ...card(),
    position: 'absolute',
    left: space.md,
    right: space.md,
    padding: space.lg,
  },
  hero: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(27, 122, 74, 0.1)',
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImg: { width: '100%', height: '100%' },
  heroEmojiWrap: { alignItems: 'center', justifyContent: 'center' },
  heroEmoji: { fontSize: 64 },
  title: { ...type.title, fontSize: 22 },
  meta: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: colors.primary },
  desc: { ...type.label, color: colors.text, lineHeight: 20, fontSize: 14 },
  block: { gap: 4 },
  blockLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: colors.text,
    marginTop: 4,
  },
  blockBody: { ...type.label, color: colors.muted, lineHeight: 18 },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(27, 122, 74, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumTxt: { fontFamily: 'Inter_700Bold', fontSize: 12, color: colors.primaryDark },
  stepTxt: { flex: 1, ...type.label, color: colors.text, lineHeight: 20, fontSize: 14 },
  closeBtn: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 10,
  },
  closeTxt: { color: colors.muted, fontFamily: 'Inter_600SemiBold' },
});
