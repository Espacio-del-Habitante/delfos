import assert from 'node:assert/strict';

function validateBackup(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Ese backup vino vacío');
  if (raw.app && raw.app !== 'mercapp') {
    throw new Error('Ese archivo no parece un backup de MercApp');
  }
  if (!raw.state || typeof raw.state !== 'object') throw new Error('Ese backup no trae datos');
  return true;
}

function stripAiKeyFromSettings(settings) {
  const next = structuredClone(settings);
  if (next.ai) next.ai = { ...next.ai, api_key: '' };
  return next;
}

assert.throws(() => validateBackup(null), /vacío/);
assert.throws(() => validateBackup({ app: 'other', state: {} }), /MercApp/);
assert.throws(() => validateBackup({ app: 'mercapp' }), /datos/);
assert.equal(validateBackup({ version: 1, app: 'mercapp', state: { trips: [] } }), true);

const exported = {
  settings: stripAiKeyFromSettings({
    ai: { provider: 'gemini', api_key: 'AIzaLEAK' },
  }),
};
assert.equal(exported.settings.ai.api_key, '');

console.log('backup.check ok');
