/**
 * Check de clasificación de fallos de sync (sin browser).
 * Mirrors frontend/src/common/lib/hub.ts → classifySyncFailure
 * ponytail: si cambia la política HTTP, este check debe fallar.
 */
function classifySyncFailure(httpStatus) {
  if (httpStatus == null) return 'network';
  if (httpStatus === 401 || httpStatus === 403) return 'auth';
  if (httpStatus === 408 || httpStatus === 429) return 'network';
  if (httpStatus >= 500) return 'network';
  if (httpStatus >= 400) return 'conflict';
  return 'network';
}

const cases = [
  [null, 'network'],
  [500, 'network'],
  [408, 'network'],
  [429, 'network'],
  [401, 'auth'],
  [403, 'auth'],
  [404, 'conflict'],
  [400, 'conflict'],
  [409, 'conflict'],
];

for (const [status, expected] of cases) {
  const got = classifySyncFailure(status);
  if (got !== expected) {
    console.error(`FAIL classifySyncFailure(${status})=${got}, expected ${expected}`);
    process.exit(1);
  }
}

console.log('hub sync classify check OK');
