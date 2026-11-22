import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, radius, space, field, type, card } from '../../../shared/theme';
import { contentBottomPad } from '../../../shared/BottomNav';
import {
  AI_PROVIDERS,
  effectiveProvider,
  listAiModels,
  maskKey,
  providerMeta,
  testAiConnection,
  type AiProviderId,
  type AiSettings,
} from '../../../services/aiSettings';
import {
  getAiSettings,
  getState,
  subscribe,
  updateAiSettings,
  updateSettings,
} from '../../../services/store';
import { pendingSyncTrips, syncAllPendingToDelfos } from '../../../services/syncDelfos';

type Props = {
  onBack?: () => void;
  onReplayTour?: () => void;
};

export function SettingsScreen({ onBack, onReplayTour }: Props) {
  const insets = useSafeAreaInsets();
  const [budget, setBudget] = useState(String(getState().settings.budgetDefault || 200000));
  const [delfosUrl, setDelfosUrl] = useState(getState().settings.delfosApiBase || '');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [ai, setAi] = useState<AiSettings>(getAiSettings());
  const [models, setModels] = useState<string[]>([]);
  const [modelSource, setModelSource] = useState('');
  const [modelError, setModelError] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(
    () =>
      subscribe(() => {
        setAi(getAiSettings());
        setPendingCount(pendingSyncTrips().length);
      }),
    [],
  );

  useEffect(() => {
    setPendingCount(pendingSyncTrips().length);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const refreshModels = useCallback(async (cfg: AiSettings) => {
    setLoadingModels(true);
    setModelError(null);
    try {
      const res = await listAiModels(cfg);
      setModels(res.models);
      setModelSource(res.source);
      setModelError(res.error || null);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    void refreshModels(ai);
  }, [ai.provider, ai.cloud_enabled, ai.base_url, refreshModels]);

  function patchAi(partial: Partial<AiSettings>) {
    setAi((prev) => ({ ...prev, ...partial }));
    setTestMsg(null);
  }

  function onProvider(id: AiProviderId) {
    const meta = providerMeta(id);
    patchAi({
      provider: id,
      text_model: meta.suggested_text_model,
      vision_model: meta.suggested_vision_model,
      base_url: meta.default_base_url,
    });
  }

  async function save() {
    setSaving(true);
    try {
      const budgetN = Number(String(budget).replace(/\D/g, '')) || 200000;
      await updateSettings({
        budgetDefault: budgetN,
        delfosApiBase: delfosUrl.trim(),
      });
      await updateAiSettings(ai);
      showToast('Guardado');
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await testAiConnection(ai);
      setTestMsg(res.ok ? `OK · ${res.detail || res.provider}` : `Error · ${res.error}`);
    } finally {
      setTesting(false);
    }
  }

  async function syncPending() {
    const url = delfosUrl.trim() || getState().settings.delfosApiBase || '';
    if (!url) {
      setSyncMsg('Pon la URL de Delfos arriba y guarda');
      return;
    }
    setSyncing(true);
    setSyncMsg(null);
    try {
      await updateSettings({ delfosApiBase: url });
      const res = await syncAllPendingToDelfos(getState().settings);
      setPendingCount(pendingSyncTrips().length);
      if (res.total === 0) setSyncMsg('Nada pendiente');
      else if (res.fail === 0) setSyncMsg(`Sync ✓ ${res.ok} mercado${res.ok === 1 ? '' : 's'}`);
      else setSyncMsg(`Sync ${res.ok} ok · ${res.fail} falló`);
    } catch (e: any) {
      setSyncMsg(e?.message || 'Sync falló');
    } finally {
      setSyncing(false);
    }
  }

  const eff = effectiveProvider(ai);
  const meta = providerMeta(eff);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <StatusBar style="dark" />
      <View style={styles.topBar}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={10}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Atrás"
            accessibilityRole="button"
          >
            <Text style={styles.backTxt}>‹</Text>
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
        <Text style={styles.title}>Configuración</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: contentBottomPad(insets.bottom, 32) }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.section}>🧭 Tour</Text>
        <View style={styles.card}>
          <Text style={styles.hint}>
            Recorre MercApp paso a paso: carrito, historial, gadgets y sync.
          </Text>
          <Pressable
            onPress={() => onReplayTour?.()}
            style={({ pressed }) => [styles.tourBtn, pressed && styles.tourBtnPressed]}
            accessibilityLabel="Ver tour de MercApp otra vez"
          >
            <Text style={styles.tourBtnTxt}>🎬 Ver tour otra vez</Text>
          </Pressable>
        </View>

        <Text style={styles.section}>🛒 Mercado</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Presupuesto por defecto (COP)</Text>
          <TextInput
            style={styles.input}
            value={budget}
            onChangeText={(t) => setBudget(t.replace(/[^\d]/g, ''))}
            keyboardType="number-pad"
            placeholder="200000"
            placeholderTextColor={colors.muted}
          />
          <Text style={[styles.label, { marginTop: 14 }]}>URL de Delfos (sync)</Text>
          <TextInput
            style={styles.input}
            value={delfosUrl}
            onChangeText={setDelfosUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://tu-delfos:5000"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.hintSmall}>
            Los mercados viven en el teléfono. Puedes acumular meses sin sync y luego enviar
            todos los pendientes de una vez. OCR de factura queda opcional y aparte.
          </Text>
          <Pressable
            disabled={syncing}
            onPress={() => void syncPending()}
            style={({ pressed }) => [styles.syncBtn, pressed && { opacity: 0.9 }]}
            accessibilityRole="button"
            accessibilityLabel="Sincronizar mercados pendientes a Delfos"
          >
            {syncing ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.syncBtnTxt}>
                {pendingCount > 0
                  ? `Sync pendientes · ${pendingCount}`
                  : 'Sync pendientes (0)'}
              </Text>
            )}
          </Pressable>
          {syncMsg ? <Text style={styles.hintSmall}>{syncMsg}</Text> : null}
        </View>

        <Text style={styles.section}>Lenguajes (IA)</Text>
        <Text style={styles.hint}>
          Como en Delfos: Ollama local o nube (Gemini / OpenRouter). En MercApp la key queda en este
          dispositivo.
        </Text>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.label}>Permitir nube</Text>
              <Text style={styles.hintSmall}>Si está apagado, siempre usa Ollama local</Text>
            </View>
            <Switch
              value={ai.cloud_enabled}
              onValueChange={(v) => patchAi({ cloud_enabled: v })}
              trackColor={{ true: colors.soft, false: '#d1d5db' }}
              thumbColor={ai.cloud_enabled ? colors.primary : '#f4f4f5'}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Proveedor</Text>
          <View style={styles.providerRow}>
            {AI_PROVIDERS.map((p) => {
              const on = ai.provider === p.id;
              const disabled = !ai.cloud_enabled && p.id !== 'local';
              return (
                <Pressable
                  key={p.id}
                  disabled={disabled}
                  onPress={() => onProvider(p.id)}
                  style={[styles.providerChip, on && styles.providerChipOn, disabled && { opacity: 0.4 }]}
                >
                  <Text style={[styles.providerTxt, on && styles.providerTxtOn]}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hintSmall}>Efectivo ahora: {providerMeta(eff).label}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Modelo de texto</Text>
          <TextInput
            style={styles.input}
            value={ai.text_model}
            onChangeText={(t) => patchAi({ text_model: t })}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={meta.suggested_text_model}
            placeholderTextColor={colors.muted}
          />
          <Text style={[styles.label, { marginTop: 14 }]}>Modelo de visión</Text>
          <TextInput
            style={styles.input}
            value={ai.vision_model}
            onChangeText={(t) => patchAi({ vision_model: t })}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={meta.suggested_vision_model}
            placeholderTextColor={colors.muted}
          />
          <Text style={[styles.label, { marginTop: 14 }]}>Base URL</Text>
          <TextInput
            style={styles.input}
            value={ai.base_url}
            onChangeText={(t) => patchAi({ base_url: t })}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={meta.default_base_url}
            placeholderTextColor={colors.muted}
          />
          {meta.needs_key && (
            <>
              <Text style={[styles.label, { marginTop: 14 }]}>API key</Text>
              <TextInput
                style={styles.input}
                value={ai.api_key}
                onChangeText={(t) => patchAi({ api_key: t })}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                placeholder={ai.api_key ? maskKey(ai.api_key) : 'pega tu key'}
                placeholderTextColor={colors.muted}
              />
            </>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>Modelos disponibles</Text>
            <Pressable onPress={() => void refreshModels(ai)} disabled={loadingModels}>
              <Text style={styles.link}>{loadingModels ? '…' : 'Actualizar'}</Text>
            </Pressable>
          </View>
          {modelError ? <Text style={styles.warn}>{modelError}</Text> : null}
          <Text style={styles.hintSmall}>Fuente: {modelSource || '—'}</Text>
          {loadingModels ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 10 }} />
          ) : (
            <View style={styles.modelList}>
              {(models.length ? models : [meta.suggested_text_model]).slice(0, 12).map((m) => (
                <Pressable
                  key={m}
                  style={[styles.modelChip, ai.text_model === m && styles.modelChipOn]}
                  onPress={() => patchAi({ text_model: m })}
                >
                  <Text style={[styles.modelTxt, ai.text_model === m && styles.modelTxtOn]} numberOfLines={1}>
                    {m}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.85 }]}
            onPress={() => void test()}
            disabled={testing}
          >
            <Text style={styles.secondaryTxt}>{testing ? 'Probando…' : 'Probar conexión'}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.primary, pressed && { transform: [{ scale: 0.97 }] }]}
            onPress={() => void save()}
            disabled={saving}
          >
            <Text style={styles.primaryTxt}>{saving ? '…' : 'Guardar'}</Text>
          </Pressable>
        </View>
        {testMsg ? <Text style={styles.testMsg}>{testMsg}</Text> : null}
      </ScrollView>

      {toast && (
        <View style={[styles.toast, { top: insets.top + 56 }]}>
          <Text style={styles.toastTxt}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  backTxt: { fontSize: 28, lineHeight: 30, color: colors.text, marginTop: -2 },
  title: { ...type.title, fontSize: 18 },
  body: { paddingHorizontal: space.lg, gap: 10 },
  section: {
    ...type.label,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 10,
    marginBottom: 2,
  },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18, marginBottom: 4, fontFamily: 'Inter_400Regular' },
  hintSmall: { color: colors.muted, fontSize: 12, marginTop: 6, fontFamily: 'Inter_400Regular' },
  syncBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  syncBtnTxt: { color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 14 },
  tourBtn: {
    marginTop: 10,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tourBtnPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: colors.primaryDark,
  },
  tourBtnTxt: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 },
  card: {
    ...card(),
    padding: space.md,
  },
  label: { ...type.label, color: colors.text, marginBottom: 8 },
  input: {
    ...field(),
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  providerRow: { gap: 8 },
  providerChip: {
    ...field(),
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  providerChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  providerTxt: { color: colors.text, fontFamily: 'Inter_600SemiBold', fontWeight: '600', fontSize: 13 },
  providerTxtOn: { color: '#fff' },
  link: { color: colors.primary, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  warn: { color: colors.danger, fontSize: 12, marginTop: 6 },
  modelList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  modelChip: {
    ...field(),
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  modelChipOn: { backgroundColor: 'rgba(27,122,74,0.12)', borderColor: colors.primary },
  modelTxt: { color: colors.text, fontSize: 12, fontFamily: 'Inter_400Regular' },
  modelTxtOn: { color: colors.primary, fontFamily: 'Inter_600SemiBold', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  secondary: {
    flex: 1,
    ...field(),
    backgroundColor: colors.surface,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  secondaryTxt: { color: colors.text, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  primary: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  primaryTxt: { color: '#fff', fontWeight: '700', fontFamily: 'Inter_700Bold' },
  testMsg: { textAlign: 'center', color: colors.muted, marginTop: 8, fontFamily: 'Inter_400Regular' },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(18, 36, 26, 0.92)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  toastTxt: { color: '#fff', fontWeight: '600', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
