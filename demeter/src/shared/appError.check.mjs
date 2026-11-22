import assert from 'node:assert/strict';

function friendlyError(err, fallback = 'Algo salió mal. Intenta de nuevo.') {
  const msg = String(err && typeof err === 'object' && 'message' in err ? err.message : err || '').trim();
  if (!msg) return fallback;
  if (/failed to fetch|network request failed|load failed|net::|econnrefused|cors/i.test(msg)) {
    return 'No hubo conexión con el servicio. Revisa red o la URL en Ajustes.';
  }
  if (/timeout|timed out|aborted/i.test(msg)) {
    return 'Tardó demasiado. Intenta de nuevo.';
  }
  if (msg.length <= 140 && !/^[A-Za-z]+Error\b/.test(msg) && !/^HTTP\s*\d/i.test(msg)) {
    return msg;
  }
  return fallback;
}

assert.match(friendlyError(new Error('Failed to fetch')), /conexión/i);
assert.match(friendlyError(new Error('timeout')), /Tardó/i);
assert.equal(friendlyError(new Error('El carrito está vacío')), 'El carrito está vacío');
assert.equal(friendlyError(new Error('TypeError: boom')), 'Algo salió mal. Intenta de nuevo.');

console.log('appError.check ok');
