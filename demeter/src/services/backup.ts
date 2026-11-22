import { Platform, Share } from 'react-native';
import {
  exportBackupObject,
  restoreFromBackupObject,
  type BackupPayload,
} from './store';

export type { BackupPayload };

export function backupFileName(d = new Date()) {
  const stamp = d.toISOString().slice(0, 10);
  return `mercapp-backup-${stamp}.json`;
}

export function backupJsonString() {
  return JSON.stringify(exportBackupObject(), null, 2);
}

/** Web: descarga archivo. Nativo: Share sheet con el JSON. */
export async function shareOrDownloadBackup() {
  const json = backupJsonString();
  const name = backupFileName();

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true as const, mode: 'download' as const, name };
  }

  await Share.share({
    title: name,
    message: json,
  });
  return { ok: true as const, mode: 'share' as const, name };
}

export async function restoreBackupFromText(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Ese JSON no se entiende');
  }
  return restoreFromBackupObject(parsed);
}

/** Web: lee un .json del usuario. */
export function pickBackupFileWeb(): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return Promise.reject(new Error('Solo en web: elige un archivo .json'));
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('Sin archivo'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No pudimos leer ese archivo'));
      reader.readAsText(file);
    };
    input.click();
  });
}
