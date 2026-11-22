/** Traduce errores técnicos a copy de app (nunca “Failed to fetch” crudo). */

export function friendlyError(
  err: unknown,
  fallback = 'Algo salió mal. Intenta de nuevo.',
): string {
  const msg = String(
    err && typeof err === 'object' && 'message' in err
      ? (err as { message?: unknown }).message
      : err || '',
  ).trim();

  if (!msg) return fallback;

  if (/failed to fetch|network request failed|load failed|net::|econnrefused|cors/i.test(msg)) {
    return 'No hubo conexión con el servicio. Revisa red o la URL en Ajustes.';
  }
  if (/timeout|timed out|aborted/i.test(msg)) {
    return 'Tardó demasiado. Intenta de nuevo.';
  }
  if (/api key|falta api|unauthorized|401/i.test(msg)) {
    return 'Falta o falló la API key. Revísala en Ajustes.';
  }
  if (/403|forbidden/i.test(msg)) {
    return 'El servicio rechazó la petición (permisos).';
  }
  if (/404|not found/i.test(msg)) {
    return 'No encontramos ese recurso.';
  }
  if (/5\d\d|internal server|bad gateway/i.test(msg)) {
    return 'El servicio falló un momento. Prueba otra vez.';
  }
  if (/json|unexpected token|syntaxerror/i.test(msg)) {
    return 'La respuesta no se pudo leer. Intenta de nuevo.';
  }

  // Mensajes cortos en español / ya amigables: se quedan.
  if (msg.length <= 140 && !/^[A-Za-z]+Error\b/.test(msg) && !/^HTTP\s*\d/i.test(msg)) {
    return msg;
  }

  return fallback;
}

export function friendlyNotice(kind: 'ai-fallback' | 'empty-cart' | 'offline-ok'): string {
  if (kind === 'ai-fallback') return 'La IA no respondió · te mostramos ideas locales';
  if (kind === 'empty-cart') return 'Suma algo al carrito para proponer recetas';
  return 'Listo · modo sin conexión';
}
