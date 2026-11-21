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
import { colors, radius, space, field, type } from '../theme';
import { categoryMeta } from '../lib/categories';
import { UNITS, convertQty } from '../lib/units';
import type { CartItem } from '../lib/store';
import { VerticalWheel } from './VerticalWheel';

type Props = {
  item: CartItem | null;
  visible: boolean;
  onClose: () => void;
  onSave: (patch: Partial<CartItem>) => void;
  onRemove: (id: string) => void;
};

/** Ruleta de cantidades enteras; se puede escribir otro valor en el centro. */
const QTY_ITEMS = Array.from({ length: 40 }, (_, i) => i + 1);

function formatAmountInput(raw: string) {
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('es-CO');
}

function nearestQtyIndex(qty: number) {
  const n = Math.round(qty);
  const clamped = Math.max(1, Math.min(QTY_ITEMS.length, n));
  return clamped - 1;
}

export function ItemEditSheet({ item, visible, onClose, onSave, onRemove }: Props) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [qtyText, setQtyText] = useState('1');
  const [unit, setUnit] = useState('und');
  const [amountDigits, setAmountDigits] = useState('');

  useEffect(() => {
    if (!item) return;
    const q = Number(item.qty) || 1;
    setName(item.name);
    setQty(q);
    setQtyText(String(q));
    setUnit(item.unit || 'und');
    setAmountDigits(item.amount != null ? String(Math.round(Number(item.amount))) : '');
  }, [item]);

  const qtyIndex = useMemo(() => nearestQtyIndex(qty), [qty]);
  const unitIndex = useMemo(
    () => Math.max(0, UNITS.findIndex((u) => u.id === unit)),
    [unit],
  );

  if (!item) return null;
  const meta = categoryMeta(item.category);
  const amountDisplay = formatAmountInput(amountDigits);

  function onQtyWheel(i: number) {
    const n = QTY_ITEMS[i];
    setQty(n);
    setQtyText(String(n));
  }

  function onQtyType(text: string) {
    const cleaned = text.replace(',', '.').replace(/[^\d.]/g, '');
    setQtyText(cleaned);
    const n = Number(cleaned);
    if (Number.isFinite(n) && n > 0) setQty(n);
  }

  function onUnitWheel(i: number) {
    const next = UNITS[i]?.id || 'und';
    const converted = convertQty(qty, unit, next);
    if (converted != null) {
      const q = Math.round(converted * 100) / 100;
      setQty(q);
      setQtyText(String(q));
    }
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
              nestedScrollEnabled
            >
              <TextInput
                style={styles.nameInput}
                value={name}
                onChangeText={setName}
                placeholder="Producto"
                placeholderTextColor={colors.muted}
                autoCapitalize="sentences"
              />

              <View style={styles.wheelsRow}>
                <View style={styles.wheelCol}>
                  <Text style={styles.stepLabel}>Cantidad</Text>
                  <VerticalWheel
                    items={QTY_ITEMS}
                    index={qtyIndex}
                    onChangeIndex={onQtyWheel}
                    labelOf={(n) => String(n)}
                    hideCenterLabel
                    centerSlot={
                      <TextInput
                        style={styles.qtyEditInput}
                        value={qtyText}
                        onChangeText={onQtyType}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                      />
                    }
                  />
                </View>

                <View style={styles.wheelCol}>
                  <Text style={styles.stepLabel}>Unidad</Text>
                  <VerticalWheel
                    items={[...UNITS]}
                    index={unitIndex}
                    onChangeIndex={onUnitWheel}
                    labelOf={(u) => u.id.toUpperCase()}
                  />
                </View>
              </View>

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
    maxHeight: '90%',
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
    marginBottom: space.sm,
  },
  stepLabel: {
    ...type.label,
    marginBottom: 8,
    marginTop: 4,
  },
  wheelsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: space.md,
  },
  wheelCol: { flex: 1 },
  qtyEditInput: {
    width: '80%',
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    fontFamily: 'Inter_800ExtraBold',
    color: colors.text,
    paddingVertical: 6,
    backgroundColor: 'transparent',
  },
  priceBox: {
    ...field(),
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 18,
    minHeight: 88,
    justifyContent: 'center',
    marginTop: 4,
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
