import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { colors, radius, space, type, card } from './theme';

type Props = {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onClose: () => void;
};

/** Modal informativo corto (errores / avisos de app). */
export function InfoModal({
  visible,
  title,
  body,
  confirmLabel = 'Dale',
  onClose,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.body}>{body}</Text>
          </ScrollView>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}
          >
            <Text style={styles.btnTxt}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  wrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  sheet: {
    ...card(),
    padding: space.lg,
    gap: 12,
  },
  title: { ...type.title, fontSize: 18 },
  body: { ...type.label, color: colors.text, lineHeight: 20, fontSize: 14 },
  btn: {
    marginTop: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnTxt: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 },
});
