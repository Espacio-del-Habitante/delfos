import { Platform } from 'react-native';

/** Foto → data URL. Nativo: expo-image-picker; web: file input (+ capture). */
export async function pickProductPhoto(opts?: {
  /** Preferir cámara trasera. */
  camera?: boolean;
}): Promise<string | null> {
  const preferCamera = Boolean(opts?.camera);

  if (Platform.OS !== 'web') {
    try {
      // Dynamic import: no tumba el bundle web si el módulo falla en algún entorno.
      const ImagePicker = await import('expo-image-picker');
      if (preferCamera) {
        const cam = await ImagePicker.requestCameraPermissionsAsync();
        if (!cam.granted) return null;
        const shot = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.7,
          base64: true,
        });
        if (shot.canceled || !shot.assets?.[0]) return null;
        const a = shot.assets[0];
        if (a.base64) return `data:${a.mimeType || 'image/jpeg'};base64,${a.base64}`;
        return a.uri || null;
      }
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!lib.granted) return null;
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        base64: true,
      });
      if (picked.canceled || !picked.assets?.[0]) return null;
      const a = picked.assets[0];
      if (a.base64) return `data:${a.mimeType || 'image/jpeg'};base64,${a.base64}`;
      return a.uri || null;
    } catch {
      return null;
    }
  }

  if (typeof document === 'undefined') return null;
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (preferCamera) input.setAttribute('capture', 'environment');
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}
