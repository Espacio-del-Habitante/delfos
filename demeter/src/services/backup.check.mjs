import assert from 'node:assert/strict';

function validateBackup(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Backup vacío');
  if (raw.app && raw.app !== 'mercapp') throw new Error('no es MercApp');
  if (!raw.state || typeof raw.state !== 'object') throw new Error('sin state');
  return true;
}

assert.throws(() => validateBackup(null), /vacío/);
assert.throws(() => validateBackup({ app: 'other', state: {} }), /MercApp/);
assert.throws(() => validateBackup({ app: 'mercapp' }), /state/);
assert.equal(validateBackup({ version: 1, app: 'mercapp', state: { trips: [] } }), true);

console.log('backup.check ok');
