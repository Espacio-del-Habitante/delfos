<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';

  export let text = '';

  const dispatch = createEventDispatcher<{ transcript: string }>();

  let unsupported = false;
  let listening = false;
  let status = 'Listo para escuchar';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let recognition: any = null;

  onMount(() => {
    const SpeechRecognition = (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      unsupported = true;
      status = 'Tu navegador no soporta voz';
      return;
    }

    recognition = new (SpeechRecognition as new () => {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      start: () => void;
      stop: () => void;
      onstart: (() => void) | null;
      onend: (() => void) | null;
      onresult: ((event: { resultIndex: number; results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
      onerror: ((event: { error?: string }) => void) | null;
    })();
    recognition.lang = 'es-CO';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      listening = true;
      status = 'Escuchando…';
    };
    recognition.onend = () => {
      listening = false;
      if (status === 'Escuchando…') status = 'Listo para escuchar';
    };
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      text = transcript.trim();
      dispatch('transcript', text);
      status = 'Transcripción lista';
    };
    recognition.onerror = (event) => {
      const messages: Record<string, string> = {
        'not-allowed': 'Micrófono bloqueado. Revisa permisos del sistema o de la app.',
        'service-not-allowed': 'El reconocimiento de voz no está permitido en este entorno.',
        network: 'Sin red para el servicio de reconocimiento. Revisa la conexión.',
        'no-speech': 'No detecté voz. Intenta de nuevo.',
        'audio-capture': 'No hay micrófono disponible.',
        aborted: 'Escucha cancelada.',
      };
      status = messages[event.error ?? ''] ?? 'No pude escuchar. Intenta de nuevo.';
    };
  });

  function toggleVoice() {
    if (unsupported || !recognition) return;
    if (listening) recognition.stop();
    else recognition.start();
  }
</script>

<section class="voice-card section" aria-label="Registro por voz">
  <p class="voice-card__hint">Habla naturalmente — Delfos entiende gastos, inversiones y notas.</p>
  <button
    type="button"
    class="voice-button"
    class:is-listening={listening}
    class:is-unsupported={unsupported}
    aria-pressed={listening}
    disabled={unsupported}
    on:click={toggleVoice}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
    Dictar movimiento
  </button>
  <p class="voice-status" class:is-active={listening}>{status}</p>
</section>
