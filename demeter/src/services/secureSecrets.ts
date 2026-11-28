import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Keystore/Keychain en nativo. Web: fallback aislado (preview). */
const SECURE_AI_KEY = 'mercapp_ai_api_key';
const WEB_FALLBACK_KEY = 'mercapp_ai_api_key_web';

async function nativeAvailable() {
  return Platform.OS !== 'web';
}

export async function readAiApiKey(): Promise<string> {
  try {
    if (await nativeAvailable()) {
      return (await SecureStore.getItemAsync(SECURE_AI_KEY)) || '';
    }
    return (await AsyncStorage.getItem(WEB_FALLBACK_KEY)) || '';
  } catch {
    return '';
  }
}

export async function writeAiApiKey(key: string): Promise<void> {
  const value = String(key || '').trim();
  if (await nativeAvailable()) {
    if (!value) {
      await SecureStore.deleteItemAsync(SECURE_AI_KEY);
      return;
    }
    await SecureStore.setItemAsync(SECURE_AI_KEY, value);
    return;
  }
  if (!value) {
    await AsyncStorage.removeItem(WEB_FALLBACK_KEY);
    return;
  }
  // ponytail: web no tiene Keystore; techo = localStorage del preview. Upgrade = proxy vía Delfos.
  await AsyncStorage.setItem(WEB_FALLBACK_KEY, value);
}

/** Quita api_key del objeto settings.ai (para JSON / backup). */
export function stripAiKeyFromSettings<T extends { ai?: { api_key?: string } }>(settings: T): T {
  const next = structuredClone(settings);
  if (next.ai) next.ai = { ...next.ai, api_key: '' };
  return next;
}
