import { useEffect, useMemo, useRef, useState } from 'react';
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
  ActivityIndicator,
  Image,
} from 'react-native';
import { colors, radius, space, field, type, card } from '../../../shared/theme';
import { categoryMeta, mergeCategories } from '../../../domain/categories';
import { UNITS, convertQty, unitPriceAs, inferPackFromText } from '../../../domain/units';
import { formatCop } from '../../../shared/format';
import { fetchPriceQuotes, googlePriceUrl, type PriceQuote } from '../../../services/priceSearch';
import { pickProductPhoto } from '../../../services/pickPhoto';
import { scanNutritionLabel } from '../../../services/nutritionLabel';
import type { NutritionFacts } from '../../../domain/nutrition';
import {
  getCustomCategories,
  subscribe,
  type CartItem,
} from '../../../services/store';
import { VerticalWheel } from './VerticalWheel';
import { InAppBrowser } from './InAppBrowser';

type Props = {
  item: CartItem | null;
  visible: boolean;
  onClose: () => void;
  onSave: (patch: Partial<CartItem>) => void;
  onRemove: (id: string) => void;
};

/** Ruleta de cantidades enteras; se puede escribir otro valor en el centro. */
const QTY_ITEMS = Array.from({ length: 40 }, (_, i) => i + 1);

const MASS_UNITS = new Set(['lb', 'kg', 'g', 'gr']);

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

function quoteUnitHint(q: PriceQuote, cartUnit: string) {
  if (q.approx == null || q.status !== 'ok') return null;
  const pack =
    inferPackFromText(`${q.label} ${q.sample || ''}`) ||
    inferPackFromText(q.sample || '') ||
    inferPackFromText(q.label);
  if (!pack) return null;
  const prefer = MASS_UNITS.has(cartUnit) ? (cartUnit === 'gr' ? 'g' : cartUnit) : 'lb';
  const per = unitPriceAs(q.approx, pack.qty, pack.unit, prefer);
  if (per == null) return null;
  return {
    packLabel: `${pack.qty} ${pack.unit}`,
    perLabel: `${formatCop(per)} / ${prefer}`,
    per,
  };
}

export function ItemEditSheet({ item, visible, onClose, onSave, onRemove }: Props) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [qtyText, setQtyText] = useState('1');
  const [unit, setUnit] = useState('und');
  const [category, setCategory] = useState('otros');
  const [amountDigits, setAmountDigits] = useState('');
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceQuotes, setPriceQuotes] = useState<PriceQuote[]>([]);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [googleUrl, setGoogleUrl] = useState('');
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [nutrition, setNutrition] = useState<NutritionFacts | null>(null);
  const [nutritionBusy, setNutritionBusy] = useState(false);
  const [nutritionHint, setNutritionHint] = useState<string | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserQuery, setBrowserQuery] = useState('');
  const [catTick, setCatTick] = useState(0);
  /** Precio por 1 de la unidad actual; al cambiar qty recalcula el total. */
  const unitRateRef = useRef<number | null>(null);

  useEffect(() => subscribe(() => setCatTick((n) => n + 1)), []);

  useEffect(() => {
    if (!item) return;
    const q = Number(item.qty) || 1;
    setName(item.name);
    setQty(q);
    setQtyText(String(q));
    setUnit(item.unit || 'und');
    setCategory(item.category || 'otros');
    const amt = item.amount != null ? Math.round(Number(item.amount)) : null;
    setAmountDigits(amt != null && Number.isFinite(amt) ? String(amt) : '');
    unitRateRef.current =
      amt != null && Number.isFinite(amt) && q > 0 ? amt / q : null;
    setPhotoDataUrl(item.photoDataUrl || null);
    setNutrition(item.nutrition || null);
    setNutritionHint(null);
    setPriceQuotes([]);
    setPriceError(null);
    setGoogleUrl(googlePriceUrl(item.name));
    setExtrasOpen(false);
    setBrowserOpen(false);
  }, [item]);

  const catalog = useMemo(() => {
    void catTick;
    return mergeCategories(getCustomCategories());
  }, [catTick]);

  const qtyIndex = useMemo(() => nearestQtyIndex(qty), [qty]);
  const unitIndex = useMemo(
    () => Math.max(0, UNITS.findIndex((u) => u.id === unit)),
    [unit],
  );

  const amountNum = amountDigits ? Number(amountDigits) : null;
  const unitPriceLine = useMemo(() => {
    if (amountNum == null || !Number.isFinite(amountNum) || amountNum <= 0 || qty <= 0) {
      return null;
    }
    const perUnit = Math.round(amountNum / qty);
    const lines = [`${formatCop(perUnit)} / ${unit}`];
    if (MASS_UNITS.has(unit) && unit !== 'lb') {
      const perLb = unitPriceAs(amountNum, qty, unit, 'lb');
      if (perLb != null) lines.push(`${formatCop(perLb)} / lb`);
    }
    return lines.join(' · ');
  }, [amountNum, qty, unit]);

  if (!item) return null;
  const meta = categoryMeta(category, getCustomCategories());
  const amountDisplay = formatAmountInput(amountDigits);

  function applyQty(n: number) {
    if (!Number.isFinite(n) || n <= 0) return;
    setQty(n);
    setQtyText(String(n));
    if (unitRateRef.current != null) {
      setAmountDigits(String(Math.round(unitRateRef.current * n)));
    }
  }

  function onQtyWheel(i: number) {
    applyQty(QTY_ITEMS[i]);
  }

  function onQtyType(text: string) {
    const cleaned = text.replace(',', '.').replace(/[^\d.]/g, '');
    setQtyText(cleaned);
    const n = Number(cleaned);
    if (Number.isFinite(n) && n > 0) applyQty(n);
  }

  function onAmountType(t: string) {
    const digits = String(t).replace(/\D/g, '');
    setAmountDigits(digits);
    const amt = digits ? Number(digits) : NaN;
    if (Number.isFinite(amt) && qty > 0) {
      unitRateRef.current = amt / qty;
    } else if (!digits) {
      unitRateRef.current = null;
    }
  }

  function onUnitWheel(i: number) {
    const next = UNITS[i]?.id || 'und';
    if (next === unit) return;
    const converted = convertQty(qty, unit, next);
    if (converted != null) {
      const q = Math.round(converted * 100) / 100;
      setQty(q);
      setQtyText(String(q));
      // Total se mantiene; rate por la nueva unidad.
      if (amountNum != null && Number.isFinite(amountNum) && q > 0) {
        unitRateRef.current = amountNum / q;
      }
    } else if (unitRateRef.current != null && amountNum != null) {
      // und↔paq etc: no hay conversión; conservamos total y rate por pieza.
      unitRateRef.current = amountNum / qty;
    }
    setUnit(next);
  }

  function save() {
    const amt = amountDigits ? Number(amountDigits) : null;
    onSave({
      name: name.trim() || item!.name,
      qty: Number(qty) || 1,
      unit,
      category,
      amount: amt && Number.isFinite(amt) ? amt : null,
      photoDataUrl: photoDataUrl || null,
      nutrition: nutrition || null,
    });
  }

  async function onScanNutrition() {
    setNutritionBusy(true);
    setNutritionHint(null);
    try {
      const res = await scanNutritionLabel();
      if (res.photoDataUrl) setPhotoDataUrl(res.photoDataUrl);
      if (res.nutrition) setNutrition(res.nutrition);
      if (res.notice) setNutritionHint(res.notice);
      setExtrasOpen(true);
    } finally {
      setNutritionBusy(false);
    }
  }

  function openInAppSearch(query = name.trim()) {
    const q = query.trim() || 'producto mercado';
    setGoogleUrl(googlePriceUrl(q));
    setBrowserQuery(q);
    setBrowserOpen(true);
  }

  async function loadPrices(query = name.trim()) {
    const q = query.trim();
    if (!q) return;
    setPriceLoading(true);
    setPriceError(null);
    setGoogleUrl(googlePriceUrl(q));
    try {
      const res = await fetchPriceQuotes(q);
      setPriceQuotes(res.quotes);
      setGoogleUrl(res.googleUrl);
      if (!res.found) {
        setPriceError('No hallé precios solos. Ábrelo en Google aquí mismito.');
      }
    } catch {
      setPriceQuotes([]);
      setPriceError('La búsqueda se trabó. Ábrelo en Google aquí mismito.');
      setGoogleUrl(googlePriceUrl(q));
    } finally {
      setPriceLoading(false);
    }
  }

  function useApprox(approx: number | null) {
    if (approx == null) return;
    const digits = String(Math.round(approx));
    setAmountDigits(digits);
    if (qty > 0) unitRateRef.current = Number(digits) / qty;
  }

  async function onPhotoAndSearch() {
    const data = await pickProductPhoto({ camera: false });
    if (data) setPhotoDataUrl(data);
    setExtrasOpen(true);
    const q = name.trim() || 'producto mercado Colombia';
    openInAppSearch(q);
    void loadPrices(q);
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

              <Text style={styles.stepLabel}>Categoría</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.catRow}
                style={{ marginBottom: space.sm }}
              >
                {catalog.map((c) => {
                  const on = c.id === category;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setCategory(c.id)}
                      style={[styles.catChip, on && styles.catChipOn]}
                    >
                      <Text style={[styles.catChipTxt, on && styles.catChipTxtOn]}>
                        {c.emoji} {c.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

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
                  onChangeText={onAmountType}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="rgba(17, 24, 39, 0.25)"
                />
                {unitPriceLine ? (
                  <Text style={styles.unitPriceHint}>≈ {unitPriceLine}</Text>
                ) : (
                  <Text style={styles.unitPriceHintMuted}>
                    Pon el total; si subes la cantidad, recalculamos.
                  </Text>
                )}
              </View>

              <View style={styles.photoRow}>
                <Pressable
                  style={({ pressed }) => [styles.photoBtn, pressed && { opacity: 0.85 }]}
                  onPress={() => void onPhotoAndSearch()}
                >
                  <Text style={styles.photoBtnTxt}>
                    {photoDataUrl ? 'Otra foto y buscar' : 'Foto + buscar precios'}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.photoBtn,
                    styles.nutritionBtn,
                    pressed && { opacity: 0.85 },
                    nutritionBusy && { opacity: 0.55 },
                  ]}
                  disabled={nutritionBusy}
                  onPress={() => void onScanNutrition()}
                  accessibilityRole="button"
                  accessibilityLabel="Leer tabla nutricional con la cámara"
                >
                  {nutritionBusy ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={[styles.photoBtnTxt, styles.nutritionBtnTxt]}>
                      {nutrition ? 'Otra etiqueta' : 'Tabla nutricional'}
                    </Text>
                  )}
                </Pressable>
                {photoDataUrl ? (
                  <Image source={{ uri: photoDataUrl }} style={styles.photoThumb} />
                ) : null}
              </View>
              {nutrition ? (
                <Text style={styles.nutritionLine}>
                  ≈{nutrition.kcal ?? '—'} kcal · P {nutrition.proteinG ?? '—'}g · C{' '}
                  {nutrition.carbsG ?? '—'}g · G {nutrition.fatG ?? '—'}g
                  {nutrition.servingSize ? ` · ${nutrition.servingSize}` : ''}
                </Text>
              ) : null}
              {nutritionHint ? <Text style={styles.nutritionHint}>{nutritionHint}</Text> : null}

              <Pressable
                style={styles.extrasToggle}
                onPress={() => {
                  const next = !extrasOpen;
                  setExtrasOpen(next);
                  if (next && !priceQuotes.length && !priceLoading) void loadPrices();
                }}
              >
                <Text style={styles.extrasToggleTxt}>
                  {extrasOpen ? '▾' : '▸'}  ¿Cuánto cuesta afuera?
                </Text>
              </Pressable>

              {extrasOpen && (
                <View style={styles.priceSearch} accessibilityLabel="Comparar precios">
                  <View style={styles.priceSearchHead}>
                    <Text style={styles.priceSearchTitle}>Precios en la calle</Text>
                    <Pressable
                      onPress={() => void loadPrices()}
                      disabled={priceLoading || !name.trim()}
                      hitSlop={8}
                    >
                      <Text style={[styles.link, (!name.trim() || priceLoading) && { opacity: 0.4 }]}>
                        Buscar
                      </Text>
                    </Pressable>
                  </View>

                  {unitPriceLine ? (
                    <Text style={styles.compareMine}>Tu compra · {unitPriceLine}</Text>
                  ) : null}

                  {priceLoading ? (
                    <View style={styles.priceLoading}>
                      <ActivityIndicator color={colors.primary} />
                      <Text style={styles.muted}>Buscando…</Text>
                    </View>
                  ) : (
                    <>
                      {priceQuotes.map((q) => {
                        const prefer = MASS_UNITS.has(unit)
                          ? unit === 'gr'
                            ? 'g'
                            : unit
                          : 'lb';
                        const hint = quoteUnitHint(q, unit);
                        const mine =
                          amountNum != null
                            ? unitPriceAs(amountNum, qty, unit, prefer)
                            : null;
                        let vs = '';
                        if (hint && mine != null) {
                          if (hint.per < mine) vs = ' · más barato';
                          else if (hint.per > mine) vs = ' · más caro';
                          else vs = ' · similar';
                        }
                        return (
                          <View
                            key={q.id}
                            style={[styles.quoteRow, q.status !== 'ok' && styles.quoteMissing]}
                          >
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={styles.quoteLabel}>{q.label}</Text>
                              {q.status === 'ok' && q.approx != null ? (
                                <>
                                  <Text style={styles.quoteApprox}>
                                    aprox. {formatCop(q.approx)}
                                    {hint ? ` · pack ${hint.packLabel}` : ''}
                                  </Text>
                                  {hint ? (
                                    <Text style={styles.quoteUnit}>
                                      ≈ {hint.perLabel}
                                      {vs}
                                    </Text>
                                  ) : (
                                    <Text style={styles.muted}>
                                      Sin empaque claro · no comparamos por unidad
                                    </Text>
                                  )}
                                </>
                              ) : (
                                <Text style={styles.muted}>Sin precio automático</Text>
                              )}
                            </View>
                            <View style={styles.quoteActions}>
                              {q.status === 'ok' && q.approx != null && (
                                <Pressable
                                  style={styles.useBtn}
                                  onPress={() => useApprox(q.approx)}
                                >
                                  <Text style={styles.useBtnTxt}>Usar</Text>
                                </Pressable>
                              )}
                              <Pressable onPress={() => openInAppSearch(`${name} ${q.label}`)} hitSlop={6}>
                                <Text style={styles.link}>{q.status === 'ok' ? 'Ver' : 'Google'}</Text>
                              </Pressable>
                            </View>
                          </View>
                        );
                      })}

                      {priceError ? <Text style={styles.fallback}>{priceError}</Text> : null}
                      <Pressable
                        style={styles.googleBtn}
                        onPress={() => openInAppSearch(name.trim())}
                      >
                        <Text style={styles.googleBtnTxt}>Ver precios aquí</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              )}
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

      <InAppBrowser
        visible={browserOpen}
        query={browserQuery || name.trim() || 'producto'}
        photoDataUrl={photoDataUrl}
        title={name.trim() ? `Precios · ${name.trim()}` : 'Precios'}
        onClose={() => setBrowserOpen(false)}
        onUsePrice={(amount) => {
          useApprox(amount);
          setBrowserOpen(false);
        }}
      />
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
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  closeTxt: { fontSize: 22, color: colors.muted, lineHeight: 24 },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginTop: space.md,
  },
  photoBtn: {
    flexGrow: 1,
    flexBasis: '40%',
    ...field(),
    backgroundColor: colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  nutritionBtn: {
    borderColor: 'rgba(27, 122, 74, 0.35)',
  },
  photoBtnTxt: {
    color: colors.text,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  nutritionBtnTxt: { color: colors.primary },
  nutritionLine: {
    marginTop: 8,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: colors.primaryDark,
  },
  nutritionHint: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.muted,
  },
  photoThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.bg,
  },
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
  catRow: { gap: 8, paddingVertical: 2 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catChipOn: {
    backgroundColor: 'rgba(27,122,74,0.12)',
    borderColor: colors.primary,
  },
  catChipTxt: {
    fontSize: 13,
    color: colors.text,
    fontFamily: 'Inter_600SemiBold',
  },
  catChipTxtOn: { color: colors.primaryDark },
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
  unitPriceHint: {
    marginTop: 8,
    color: colors.primary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  unitPriceHintMuted: {
    marginTop: 8,
    color: colors.muted,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  extrasToggle: { marginTop: space.md, paddingVertical: 8 },
  extrasToggleTxt: {
    color: colors.text,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  priceSearch: {
    ...card(),
    padding: space.md,
    marginTop: 4,
    gap: 10,
  },
  priceSearchHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  priceSearchTitle: {
    ...type.title,
    fontSize: 15,
  },
  compareMine: {
    color: colors.primaryDark,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    backgroundColor: 'rgba(27,122,74,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
  link: { color: colors.primary, fontWeight: '600', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  muted: { color: colors.muted, fontSize: 12, marginTop: 4, fontFamily: 'Inter_400Regular' },
  priceLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  quoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  quoteMissing: { opacity: 0.85 },
  quoteLabel: { fontWeight: '700', color: colors.text, fontFamily: 'Inter_700Bold' },
  quoteApprox: {
    marginTop: 2,
    color: colors.primary,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  quoteUnit: {
    marginTop: 2,
    color: colors.text,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  quoteActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  useBtn: {
    backgroundColor: 'rgba(27,122,74,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  useBtnTxt: { color: colors.primary, fontWeight: '700', fontSize: 12, fontFamily: 'Inter_700Bold' },
  fallback: { color: colors.muted, fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  googleBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  googleBtnTxt: { color: '#fff', fontWeight: '700', fontFamily: 'Inter_700Bold' },
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
