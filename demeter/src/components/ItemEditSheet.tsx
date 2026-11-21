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
import { colors, radius, space, softRaised, softInset, softPressed, type } from '../theme';
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
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.eyebrow}>
                  {meta.emoji}  {meta.label}
                </Text>
                <Text style={styles.title}>Editar</Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
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
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholderTextColor={colors.muted}
              />

              <Text style={styles.label}>Cantidad</Text>
              <View style={styles.stepper}>
                <Pressable
                  style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
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
                  style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
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
                      style={[styles.unit, on ? styles.unitOn : null]}
                      onPress={() => pickUnit(u.id)}
                    >
                      <Text style={[styles.unitTxt, on && styles.unitTxtOn]}>{u.id}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Precio</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                keyboardType="number-pad"
                placeholder="0"
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
                  style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
                  onPress={onClose}
                >
                  <Text style={styles.secondaryTxt}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
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
    backgroundColor: 'rgba(42, 47, 58, 0.18)',
  },
  sheetWrap: { justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '92%',
    paddingBottom: space.lg,
    ...softRaised('md'),
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.softDark,
    marginTop: 12,
    marginBottom: 8,
    opacity: 0.55,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: space.md,
  },
  eyebrow: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  title: { ...type.title, fontSize: 26 },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...softRaised('sm'),
  },
  closeBtnPressed: {
    ...softPressed(),
    transform: [{ scale: 0.97 }],
  },
  closeTxt: { fontSize: 22, color: colors.muted, lineHeight: 24 },
  body: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xl,
    gap: 10,
  },
  label: { ...type.label, marginTop: space.md },
  input: {
    ...softInset('md'),
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 17,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
    width: '100%',
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 4,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  stepBtn: {
    width: 48,
    height: 48,
    flexShrink: 0,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    ...softRaised('sm'),
  },
  stepBtnPressed: {
    ...softPressed(),
    transform: [{ scale: 0.97 }],
  },
  stepTxt: {
    fontSize: 22,
    color: colors.accent,
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
  units: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  unit: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    minWidth: 48,
    alignItems: 'center',
    ...softRaised('sm'),
  },
  unitOn: {
    ...softPressed(),
  },
  unitTxt: {
    fontWeight: '600',
    color: colors.muted,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  unitTxtOn: { color: colors.text },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: 12,
  },
  remove: {
    color: colors.danger,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    paddingVertical: 14,
  },
  footerRight: { flexDirection: 'row', gap: 12, flex: 1, justifyContent: 'flex-end' },
  secondary: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: radius.sm,
    ...softRaised('sm'),
  },
  secondaryPressed: {
    ...softPressed(),
    transform: [{ scale: 0.97 }],
  },
  secondaryTxt: {
    color: colors.muted,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  primary: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    shadowColor: '#2a2f3a',
    shadowOffset: { width: 4, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryPressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
  primaryTxt: {
    color: '#f7f8fa',
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
});
