import assert from 'node:assert/strict';

function friendlyError(err, fallback = 'Uy, algo se torció. Prueba otra vez.') {
  const msg = String(
    err && typeof err === 'object' && 'message' in err ? err.message : err || '',
  ).trim();
  if (!msg) return fallback;
  if (/failed to fetch|network request failed|load failed|net::|econnrefused|cors/i.test(msg)) {
    return 'Sin señal con el servicio. Mira tu red o la URL en Ajustes.';
  }
  if (/timeout|timed out|aborted/i.test(msg)) {
    return 'Se demoró demasiado. Dale otra pasada.';
  }
  if (/quota|quotaexceeded|storage|el espacio|espacio de almacen/i.test(msg)) {
    return 'Se llenó el espacio del teléfono (casi siempre por fotos). Quita fotos viejas o cierra sin foto de factura.';
  }
  if (/resource.?exhausted|rate.?limit|429|billing|insufficient.?quota/i.test(msg)) {
    return 'La cuota de la IA se acabó o está limitada. Prueba más tarde o cambia de modelo en Ajustes.';
  }
  if (
    msg.length <= 140 &&
    !/^[A-Za-z]+Error\b/.test(msg) &&
    !/^HTTP\s*\d/i.test(msg) &&
    !/\bquota\b/i.test(msg)
  ) {
    return msg;
  }
  return fallback;
}

assert.match(friendlyError(new Error('Failed to fetch')), /señal|red|Ajustes/i);
assert.match(friendlyError(new Error('timeout')), /demoró|pasada/i);
assert.equal(friendlyError(new Error('El carrito está vacío')), 'El carrito está vacío');
assert.equal(friendlyError(new Error('TypeError: boom')), 'Uy, algo se torció. Prueba otra vez.');
assert.match(
  friendlyError(new Error('The quota has been exceeded.')),
  /espacio|fotos|teléfono/i,
);
assert.match(friendlyError(new Error('RESOURCE_EXHAUSTED')), /cuota de la IA|limitada/i);

console.log('appError.check ok');
