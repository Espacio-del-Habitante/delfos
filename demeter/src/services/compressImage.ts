import { Platform } from 'react-native';

/**
 * Reduce data-URL de foto para no tumbar AsyncStorage / localStorage.
 * ponytail: techo = canvas web + passthrough nativo; upgrade = ImageManipulator.
 */
export async function compressImageDataUrl(
  dataUrl: string,
  opts?: { maxEdge?: number; quality?: number },
): Promise<string> {
  const src = String(dataUrl || '');
  if (!src.startsWith('data:image/')) return src;
  // Ya chiquita (~<250KB base64): no tocar.
  if (src.length < 350_000) return src;

  const maxEdge = opts?.maxEdge ?? 960;
  const quality = opts?.quality ?? 0.62;

  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    // Sin manipulación nativa instalada: devolver igual (mejor mensaje de cuota).
    return src;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const scale = Math.min(1, maxEdge / Math.max(w, h, 1));
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0, cw, ch);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}
