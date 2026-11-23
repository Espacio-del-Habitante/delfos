import { Platform } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

export { useSpeechRecognitionEvent };

export function speechAvailable() {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export async function ensureSpeechPermission() {
  const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return result.granted === true;
}

export async function startListening(lang = 'es-CO') {
  const ok = await ensureSpeechPermission();
  if (!ok) throw new Error('Necesitamos permiso del micrófono');
  if (!speechAvailable()) {
    throw new Error(
      Platform.OS === 'web'
        ? 'Este navegador no dicta · escribe aquí'
        : 'Este teléfono no dicta · escribe aquí',
    );
  }
  ExpoSpeechRecognitionModule.start({
    lang,
    interimResults: true,
    continuous: false,
    maxAlternatives: 1,
  });
}

export function stopListening() {
  try {
    ExpoSpeechRecognitionModule.stop();
  } catch {
    /* ignore */
  }
}

export function abortListening() {
  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {
    /* ignore */
  }
}
