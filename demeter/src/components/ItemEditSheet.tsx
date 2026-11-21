import { useEffect, useMemo, useState } from 'react';
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

const QTY_PRESETS = [1, 2, 3, 4, 5, 6];

function formatAmountInput(raw: string) {
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('es-CO');
}

export function ItemEditSheet({ item, visible, onClose, onSave, onRemove }: Props) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('und');
  const [amountDigits, setAmountDigits] = useState('');

  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setQty(Number(item.qty) || 1);
    setUnit(item.unit || 'und');
    setAmountDigits(item.amount != null ? String(Math.round(Number(item.amount))) : '');
  }, [item]);

  const qtyChips = useMemo(() => {
    const base = QTY_PRESETS.slice();
    const n = Math.round(qty * 100) / 100;
    if (!base.includes(n) && Number.isFinite(n) && n > 0) {
      return [...base, n].sort((a, b) => a - b);
    }
    return base;
  }, [qty]);

  if (!item) return null;
  const meta = categoryMeta(item.category);
  const amountDisplay = formatAmountInput(amountDigits);

  function pickUnit(next: string) {
    const converted = convertQty(qty, unit, next);
    if (converted != null) setQty(Math.round(converted * 100) / 100);
    setUnit(next);
  }

  function save() {
    const amt = amountDigits ? Number(amountDigits) : null;
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

            <View style={styles.topBar}>
              <Text style={styles.eyebrow}>
                {meta.emoji}  {meta.label}
              </Text>
              <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
                <Text style={styles.closeTxt}>×</Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* 1. Nombre */}
              <TextInput
                style={styles.nameInput}
                value={name}
                onChangeText={setName}
                placeholder="Producto"
                placeholderTextColor={colors.muted}
                autoCapitalize="sentences"
              />

              {/* 2. Qty */}
              <Text style={styles.stepLabel}>Cantidad</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.qtyRow}
              >
                {qtyChips.map((n) => {
                  const on = Math.abs(qty - n) < 0.001;
                  return (
                    <Pressable
                      key={String(n)}
                      style={[styles.qtyChip, on && styles.qtyChipOn]}
                      onPress={() => setQty(n)}
                    >
                      <Text style={[styles.qtyChipTxt, on && styles.qtyChipTxtOn]}>{n}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* 3. Unidad */}
              <Text style={styles.stepLabel}>Unidad</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.unitRow}
              >
                {UNITS.map((u) => {
                  const on = unit === u.id;
                  return (
                    <Pressable
                      key={u.id}
                      style={[styles.unitChip, on && styles.unitChipOn]}
                      onPress={() => pickUnit(u.id)}
                    >
                      <Text style={[styles.unitChipTxt, on && styles.unitChipTxtOn]}>
                        {u.id.toUpperCase()}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* 4. Precio — protagonista */}
              <Text style={styles.stepLabel}>Precio</Text>
              <View style={styles.priceBox}>
                <Text style={styles.priceCurrency}>COP</Text>
                <TextInput
                  style={styles.priceInput}
                  value={amountDisplay}
                  onChangeText={(t) => setAmountDigits(String(t).replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="rgba(17, 24, 39, 0.25)"
                />
              </View>
            </ScrollView>

            <View style={styles.footer}>
              <Pressable onPress={() => onRemove(item.id)} hitSlop={8}>
                <Text style={styles.remove}>Quitar</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.primary, pressed && { transform: [{ scale: 0.97 }] }]}
                onPress={save}
              >
                <Text style={styles.primaryTxt}>Listo</Text>
              </Pressable>
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
    maxHeight: '88%',
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
    marginBottom: 2,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: 4,
  },
  eyebrow: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
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
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  nameInput: {
    fontSize: 32,
    fontWeight: '800',
    fontFamily: 'Inter_800ExtraBold',
    color: colors.text,
    letterSpacing: -0.8,
    paddingVertical: 8,
    marginBottom: space.md,
  },
  stepLabel: {
    ...type.label,
    marginBottom: 10,
    marginTop: space.md,
  },
  qtyRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 2,
  },
  qtyChip: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(246, 247, 251, 0.95)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  qtyChipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  qtyChipTxt: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: colors.text,
  },
  qtyChipTxtOn: { color: '#fff' },
  unitRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  unitChip: {
    ...chip(),
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 56,
    alignItems: 'center',
  },
  unitChipOn: { ...chipOn() },
  unitChipTxt: {
    fontWeight: '700',
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    letterSpacing: 0.4,
  },
  unitChipTxtOn: { color: '#fff' },
  priceBox: {
    ...field(),
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 18,
    minHeight: 88,
    justifyContent: 'center',
  },
  priceCurrency: {
    ...type.label,
    marginBottom: 4,
  },
  priceInput: {
    fontSize: 36,
    fontWeight: '800',
    fontFamily: 'Inter_800ExtraBold',
    color: colors.text,
    letterSpacing: -1,
    padding: 0,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: 12,
  },
  remove: {
    color: colors.danger,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  primary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 4,
  },
  primaryTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
});
