import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors, radius, space, field, chip, chipOn, type } from '../theme';
import { formatCop } from '../lib/format';
import { categoryMeta } from '../lib/categories';
import { UNITS, convertQty } from '../lib/units';
import type { CartItem } from '../lib/store';

type Props = {
  item: CartItem | null;
  visible: boolean;
  onClose: () => void;
  onSave: (patch: Partial<CartItem>) => void;
  onRemove: (id: string) => void;
};

export function ItemEditSheet({ item, visible, onClose, onSave, onRemove }: Props) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('und');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setQty(String(item.qty));
    setUnit(item.unit || 'und');
    setAmount(item.amount != null ? String(item.amount) : '');
  }, [item]);

  if (!item) return null;
  const meta = categoryMeta(item.category);

  function bump(delta: number) {
    const n = Math.max(0.05, Math.round((Number(qty) + delta) * 100) / 100);
    setQty(String(n));
  }

  function pickUnit(next: string) {
    const converted = convertQty(Number(qty) || 1, unit, next);
    if (converted != null) setQty(String(converted));
    setUnit(next);
  }

  function save() {
    const amt = amount.trim() ? Number(String(amount).replace(/\D/g, '')) : null;
    onSave({
      name: name.trim() || item!.name,
      qty: Number(qty) || 1,
      unit,
      amount: amt && Number.isFinite(amt) ? amt : null,
    });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <View style={styles.grabber} />

            <View style={styles.header}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.eyebrow}>
                  {meta.emoji}  {meta.label}
                </Text>
                <Text style={styles.title}>Editar</Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.closeTxt}>×</Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.label}>Producto</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} />

              <Text style={styles.label}>Cantidad</Text>
              <View style={styles.stepper}>
                <Pressable
                  style={({ pressed }) => [styles.stepBtn, pressed && { transform: [{ scale: 0.97 }] }]}
                  onPress={() => bump(-1)}
                >
                  <Text style={styles.stepTxt}>−</Text>
                </Pressable>
                <TextInput
                  style={[styles.input, styles.stepInput]}
                  value={qty}
                  onChangeText={setQty}
                  keyboardType="decimal-pad"
                />
                <Pressable
                  style={({ pressed }) => [styles.stepBtn, pressed && { transform: [{ scale: 0.97 }] }]}
                  onPress={() => bump(1)}
                >
                  <Text style={styles.stepTxt}>+</Text>
                </Pressable>
              </View>

              <Text style={styles.label}>Unidad</Text>
              <View style={styles.units}>
                {UNITS.map((u) => {
                  const on = unit === u.id;
                  return (
                    <Pressable
                      key={u.id}
                      style={[styles.unit, on && styles.unitOn]}
                      onPress={() => pickUnit(u.id)}
                    >
                      <Text style={[styles.unitTxt, on && styles.unitTxtOn]}>{u.id}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Precio (COP)</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                keyboardType="number-pad"
                placeholder="Ej. 8000"
                placeholderTextColor={colors.muted}
              />
              {!!amount && (
                <Text style={styles.hint}>
                  {formatCop(Number(String(amount).replace(/\D/g, '')))}
                </Text>
              )}
            </ScrollView>

            <View style={styles.footer}>
              <Pressable onPress={() => onRemove(item.id)} hitSlop={8}>
                <Text style={styles.remove}>Quitar</Text>
              </Pressable>
              <View style={styles.footerRight}>
                <Pressable
                  style={({ pressed }) => [styles.secondary, pressed && { transform: [{ scale: 0.97 }] }]}
                  onPress={onClose}
                >
                  <Text style={styles.secondaryTxt}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.primary, pressed && { transform: [{ scale: 0.97 }] }]}
                  onPress={save}
                >
                  <Text style={styles.primaryTxt}>Guardar</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  sheetWrap: { justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '92%',
    paddingBottom: space.md,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(15, 23, 42, 0.16)',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: space.sm,
  },
  eyebrow: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  title: { ...type.title, fontSize: 22 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.05)',
  },
  closeTxt: { fontSize: 22, color: colors.muted, lineHeight: 24 },
  body: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    gap: 8,
  },
  label: { ...type.label, marginTop: 10 },
  input: {
    ...field(),
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
    width: '100%',
  },
  hint: { color: colors.muted, fontSize: 13, marginTop: 2 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  stepBtn: {
    width: 48,
    height: 48,
    flexShrink: 0,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(27, 122, 74, 0.1)',
  },
  stepTxt: {
    fontSize: 22,
    color: colors.primaryDark,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  stepInput: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
  },
  units: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unit: {
    ...chip(),
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 48,
    alignItems: 'center',
  },
  unitOn: { ...chipOn() },
  unitTxt: {
    fontWeight: '600',
    color: colors.text,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  unitTxtOn: { color: '#fff' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 10,
  },
  remove: {
    color: colors.danger,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    paddingVertical: 12,
  },
  footerRight: { flexDirection: 'row', gap: 8, flex: 1, justifyContent: 'flex-end' },
  secondary: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(27, 122, 74, 0.08)',
  },
  secondaryTxt: {
    color: colors.primaryDark,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  primary: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 4,
  },
  primaryTxt: {
    color: '#fff',
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
});
