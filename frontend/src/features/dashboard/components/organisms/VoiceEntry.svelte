<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { transcribeAudio } from '@common/lib/api';

  export let text = '';

  const dispatch = createEventDispatcher<{ transcript: string }>();

  let unsupported = false;
  let listening = false;
  let busy = false;
  let status = 'Listo para escuchar';
  let hint = 'Habla naturalmente — Delfos entiende gastos, inversiones y notas.';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let recognition: any = null;
  let mediaRecorder: MediaRecorder | null = null;
  let mediaStream: MediaStream | null = null;
  let recordedChunks: BlobPart[] = [];
  let useBackendStt = false;

  // Electron/Chromium no trae el servicio de voz de Chrome → STT por backend.
  function isElectronShell() {
    return /Electron/i.test(navigator.userAgent || '');
  }

  function pickRecorderMime(): string {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    for (const mime of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }
    return 'audio/webm';
  }

  function stopMediaTracks() {
    mediaStream?.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }

  async function startBackendRecording() {
    if (busy || listening) return;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      status = 'Micrófono bloqueado. Revisa permisos del sistema o de la app.';
      return;
    }

    recordedChunks = [];
    const mime = pickRecorderMime();
    try {
      mediaRecorder = new MediaRecorder(mediaStream, { mimeType: mime });
    } catch {
      mediaRecorder = new MediaRecorder(mediaStream);
    }

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) recordedChunks.push(event.data);
    };
    mediaRecorder.onerror = () => {
      listening = false;
      busy = false;
      stopMediaTracks();
      status = 'Error al grabar audio.';
    };
    mediaRecorder.onstop = () => {
      void finishBackendRecording(mediaRecorder?.mimeType || mime);
    };

    mediaRecorder.start();
    listening = true;
    status = 'Escuchando… (suelta para transcribir)';
  }

  async function finishBackendRecording(mimeType: string) {
    listening = false;
    busy = true;
    status = 'Transcribiendo…';
    stopMediaTracks();
    mediaRecorder = null;

    const blob = new Blob(recordedChunks, { type: mimeType.split(';')[0] || 'audio/webm' });
    recordedChunks = [];
    if (!blob.size) {
      busy = false;
      status = 'No grabé audio. Intenta de nuevo.';
      return;
    }

    try {
      const { text: transcript } = await transcribeAudio(blob);
      const cleaned = (transcript || '').trim();
      if (!cleaned) {
        status = 'No se detectó texto. Intenta de nuevo.';
      } else {
        text = cleaned;
        dispatch('transcript', cleaned);
        status = 'Transcripción lista';
      }
    } catch (err) {
      status = err instanceof Error ? err.message : 'No se pudo transcribir el audio.';
    } finally {
      busy = false;
    }
  }

  function stopBackendRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    } else {
      listening = false;
      stopMediaTracks();
    }
  }

  onMount(() => {
    useBackendStt = isElectronShell();

    if (useBackendStt) {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        unsupported = true;
        status = 'Este entorno no puede grabar audio.';
        return;
      }
      hint = 'Dictado local con Whisper (o nube si activaste dictado mejorado).';
      status = 'Listo para escuchar';
      return;
    }

    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // Fallback: misma ruta que Electron si hay grabación.
      if (navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined') {
        useBackendStt = true;
        hint = 'Dictado vía IA (tu navegador no trae reconocimiento nativo).';
        status = 'Listo para escuchar';
        return;
      }
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
      onresult: ((event: {
        resultIndex: number;
        results: { [i: number]: { [j: number]: { transcript: string } } };
      }) => void) | null;
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
      const err = event.error ?? '';
      if (err === 'network' || err === 'service-not-allowed') {
        // Auto-fallback a STT backend (mismo path que Electron).
        useBackendStt = true;
        recognition = null;
        hint = 'Dictado vía IA (reconocimiento nativo no disponible).';
        status = 'Listo para escuchar — pulsa de nuevo para grabar.';
        return;
      }
      const messages: Record<string, string> = {
        'not-allowed': 'Micrófono bloqueado. Revisa permisos del sistema o de la app.',
        'no-speech': 'No detecté voz. Intenta de nuevo.',
        'audio-capture': 'No hay micrófono disponible.',
        aborted: 'Escucha cancelada.',
      };
      status = messages[err] ?? 'No pude escuchar. Intenta de nuevo.';
    };
  });

  onDestroy(() => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch {
        /* ignore */
      }
    }
    stopMediaTracks();
  });

  function toggleVoice() {
    if (unsupported || busy) return;

    if (useBackendStt) {
      if (listening) stopBackendRecording();
      else void startBackendRecording();
      return;
    }

    if (!recognition) return;
    if (listening) recognition.stop();
    else recognition.start();
  }
</script>

<section class="voice-card section" aria-label="Registro por voz">
  <p class="voice-card__hint">{hint}</p>
  <button
    type="button"
    class="voice-button"
    class:is-listening={listening}
    class:is-unsupported={unsupported}
    aria-pressed={listening}
    disabled={unsupported || busy}
    on:click={toggleVoice}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
    {#if busy}
      Transcribiendo…
    {:else if listening}
      Detener y transcribir
    {:else}
      Dictar movimiento
    {/if}
  </button>
  <p class="voice-status" class:is-active={listening || busy}>{status}</p>
</section>
