import { Platform } from 'react-native';

/** Foto del producto → data URL. Web: file input; nativo: null hasta ImagePicker. */
export function pickProductPhoto(): Promise<string | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
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
