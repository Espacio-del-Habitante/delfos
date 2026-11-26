/** Traduce errores técnicos a copy de app (nunca “Failed to fetch” crudo). */

export function friendlyError(
  err: unknown,
  fallback = 'Uy, algo se torció. Prueba otra vez.',
): string {
  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name?: unknown }).name)
      : '';
  const msg = String(
    err && typeof err === 'object' && 'message' in err
      ? (err as { message?: unknown }).message
      : err || '',
  ).trim();

  if (!msg && name !== 'QuotaExceededError') return fallback;

  if (/failed to fetch|network request failed|load failed|net::|econnrefused|cors/i.test(msg)) {
    return 'Sin señal con el servicio. Mira tu red o la URL en Ajustes.';
  }
  if (/timeout|timed out|aborted/i.test(msg)) {
    return 'Se demoró demasiado. Dale otra pasada.';
  }
  if (/api key|falta api|unauthorized|401/i.test(msg)) {
    return 'Falta (o falló) la API key. Revísala en Ajustes.';
  }
  if (/403|forbidden/i.test(msg)) {
    return 'Ese servicio dijo “no” (permisos).';
  }
  if (/404|not found/i.test(msg)) {
    return 'No encontramos eso por ningún lado.';
  }
  if (/5\d\d|internal server|bad gateway/i.test(msg)) {
    return 'El servicio está de malas hoy. Intenta en un rato.';
  }
  if (/json|unexpected token|syntaxerror/i.test(msg)) {
    return 'Esa respuesta vino rara. Prueba de nuevo.';
  }
  // IA primero (resource_exhausted / 429). "The quota has been exceeded" de Safari = storage.
  if (/resource.?exhausted|rate.?limit|429|billing|insufficient.?quota/i.test(msg)) {
    return 'La cuota de la IA se acabó o está limitada. Prueba más tarde o cambia de modelo en Ajustes.';
  }
  // LocalStorage / AsyncStorage lleno (fotos base64) — NO es cuota de IA.
  if (
    name === 'QuotaExceededError' ||
    /quota|quotaexceeded|storage|el espacio|espacio de almacen|espacio del teléfono/i.test(msg)
  ) {
    return 'Se llenó el espacio del teléfono (casi siempre por fotos). Quita fotos viejas o cierra sin foto de factura.';
  }

  // Mensajes cortos en español / ya amigables: se quedan.
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

export function friendlyNotice(kind: 'ai-fallback' | 'empty-cart' | 'offline-ok'): string {
  if (kind === 'ai-fallback') return 'La IA no contestó · te dejamos ideas caseras';
  if (kind === 'empty-cart') return 'Primero suma algo al carrito y luego cocinamos ideas';
  return 'Listo · seguimos offline sin drama';
}
