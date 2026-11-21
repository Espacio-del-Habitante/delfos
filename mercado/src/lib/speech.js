/** Web Speech API — Safari iOS / Chrome Android con HTTPS + permiso de mic. */

const ERROR_MSG = {
  'not-allowed': 'Micrófono bloqueado. Revisa permisos del navegador.',
  'no-speech': 'No detecté voz. Intenta de nuevo.',
  'audio-capture': 'No hay micrófono disponible.',
  aborted: 'Dictado cancelado.',
  network: 'Sin servicio de dictado (red). Prueba Safari/Chrome o escribe.',
  'service-not-allowed': 'Este navegador bloquea el dictado. Escribe el producto.',
};

export function speechErrorMessage(code) {
  return ERROR_MSG[code] || (code ? `Dictado: ${code}` : 'No pude escuchar. Intenta de nuevo.');
}

export function speechSupportReason() {
  if (typeof window === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'needs-https';
  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) return 'unsupported';
  return null;
}

export function speechSupported() {
  return speechSupportReason() === null;
}

/**
 * Escucha una frase. Devuelve { promise, stop }.
 * onPartial recibe texto interim (para pintar el input).
 */
export function listenOnce({ lang = 'es-CO', timeoutMs = 12000, onPartial } = {}) {
  let settle;
  let settled = false;
  let rec = null;
  let timer = null;
  let finalText = '';

  const promise = new Promise((resolve, reject) => {
    settle = (ok, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        rec?.stop();
      } catch {
        /* ignore */
      }
      if (ok) resolve(value);
      else reject(value instanceof Error ? value : new Error(String(value)));
    };

    const reason = speechSupportReason();
    if (reason === 'needs-https') {
      settle(false, new Error('Dictado necesita HTTPS. Abre el enlace del túnel.'));
      return;
    }
    if (reason) {
      settle(false, new Error('Tu navegador no soporta dictado. Usa el campo de texto.'));
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    timer = setTimeout(() => {
      if (finalText) settle(true, finalText);
      else settle(false, new Error('No escuché nada. Intenta de nuevo.'));
    }, timeoutMs);

    rec.onresult = (ev) => {
      let text = '';
      let isFinal = false;
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        text += r?.[0]?.transcript || '';
        if (r.isFinal) isFinal = true;
      }
      text = String(text).trim();
      if (text) onPartial?.(text);
      if (isFinal && text) {
        finalText = text;
        settle(true, text);
      }
    };

    rec.onerror = (ev) => {
      const code = ev?.error || '';
      if (code === 'aborted') {
        if (finalText) settle(true, finalText);
        else settle(false, new Error(speechErrorMessage('aborted')));
        return;
      }
      if (code === 'no-speech' && finalText) {
        settle(true, finalText);
        return;
      }
      settle(false, new Error(speechErrorMessage(code)));
    };

    rec.onend = () => {
      if (settled) return;
      if (finalText) settle(true, finalText);
      else settle(false, new Error('No escuché nada. Intenta de nuevo.'));
    };

    try {
      rec.start();
    } catch (e) {
      settle(false, e instanceof Error ? e : new Error('No pude iniciar el micrófono'));
    }
  });

  return {
    promise,
    stop() {
      try {
        rec?.stop();
      } catch {
        /* ignore */
      }
    },
  };
}
