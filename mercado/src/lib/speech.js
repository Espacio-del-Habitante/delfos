/** Web Speech API — funciona en Safari iOS con permiso de micrófono. */

export function speechSupported() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function listenOnce({ lang = 'es-CO', timeoutMs = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      reject(new Error('Tu navegador no soporta dictado. Usa el campo de texto.'));
      return;
    }
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    const timer = setTimeout(() => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      reject(new Error('No escuché nada. Intenta de nuevo.'));
    }, timeoutMs);

    rec.onresult = (ev) => {
      clearTimeout(timer);
      const text = ev.results?.[0]?.[0]?.transcript || '';
      resolve(String(text).trim());
    };
    rec.onerror = (ev) => {
      clearTimeout(timer);
      reject(new Error(ev.error === 'not-allowed' ? 'Permiso de micrófono denegado' : `Dictado: ${ev.error}`));
    };
    rec.onend = () => clearTimeout(timer);
    rec.start();
  });
}
