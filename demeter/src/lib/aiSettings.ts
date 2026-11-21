/** Config de LLM al estilo Delfos, persistida en el dispositivo (Deméter Expo). */

export type AiProviderId = 'local' | 'gemini' | 'compatible';

export type AiSettings = {
  cloud_enabled: boolean;
  provider: AiProviderId;
  text_model: string;
  vision_model: string;
  base_url: string;
  /** ponytail: en Expo no hay backend; la key vive en AsyncStorage del dispositivo. */
  api_key: string;
};

export type AiProviderOption = {
  id: AiProviderId;
  label: string;
  suggested_text_model: string;
  suggested_vision_model: string;
  default_base_url: string;
  needs_key: boolean;
};

export const AI_PROVIDERS: AiProviderOption[] = [
  {
    id: 'local',
    label: 'Ollama (local)',
    suggested_text_model: 'llama3.2',
    suggested_vision_model: 'llava',
    default_base_url: 'http://127.0.0.1:11434',
    needs_key: false,
  },
  {
    id: 'gemini',
    label: 'Gemini',
    suggested_text_model: 'gemini-2.0-flash',
    suggested_vision_model: 'gemini-2.0-flash',
    default_base_url: 'https://generativelanguage.googleapis.com/v1beta',
    needs_key: true,
  },
  {
    id: 'compatible',
    label: 'OpenAI-compatible (OpenRouter / Groq)',
    suggested_text_model: 'openai/gpt-4o-mini',
    suggested_vision_model: 'openai/gpt-4o-mini',
    default_base_url: 'https://openrouter.ai/api/v1',
    needs_key: true,
  },
];

export const DEFAULT_AI: AiSettings = {
  cloud_enabled: false,
  provider: 'local',
  text_model: 'llama3.2',
  vision_model: 'llava',
  base_url: 'http://127.0.0.1:11434',
  api_key: '',
};

export function effectiveProvider(ai: AiSettings): AiProviderId {
  if (!ai.cloud_enabled) return 'local';
  return ai.provider || 'local';
}

export function maskKey(key: string) {
  const k = String(key || '');
  if (k.length < 8) return k ? '••••' : '';
  return `${k.slice(0, 3)}…${k.slice(-4)}`;
}

export function providerMeta(id: AiProviderId) {
  return AI_PROVIDERS.find((p) => p.id === id) || AI_PROVIDERS[0];
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

export async function listAiModels(ai: AiSettings): Promise<{ models: string[]; source: string; error?: string }> {
  const provider = effectiveProvider(ai);
  const meta = providerMeta(provider);
  const base = (ai.base_url || meta.default_base_url).replace(/\/$/, '');

  try {
    if (provider === 'local') {
      const res = await withTimeout(fetch(`${base}/api/tags`), 6000);
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data = (await res.json()) as { models?: Array<{ name?: string }> };
      const models = (data.models || []).map((m) => String(m.name || '')).filter(Boolean);
      return { models, source: 'ollama' };
    }
    if (provider === 'gemini') {
      if (!ai.api_key.trim()) return { models: [meta.suggested_text_model], source: 'suggested', error: 'Falta API key' };
      const res = await withTimeout(
        fetch(`${base}/models?key=${encodeURIComponent(ai.api_key.trim())}`),
        8000,
      );
      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
      const data = (await res.json()) as { models?: Array<{ name?: string }> };
      const models = (data.models || [])
        .map((m) => String(m.name || '').replace(/^models\//, ''))
        .filter(Boolean);
      return { models: models.length ? models : [meta.suggested_text_model], source: 'gemini' };
    }
    // compatible
    if (!ai.api_key.trim()) {
      return { models: [meta.suggested_text_model], source: 'suggested', error: 'Falta API key' };
    }
    const res = await withTimeout(
      fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${ai.api_key.trim()}`, Accept: 'application/json' },
      }),
      8000,
    );
    if (!res.ok) throw new Error(`Models HTTP ${res.status}`);
    const data = (await res.json()) as { data?: Array<{ id?: string }> };
    const models = (data.data || []).map((m) => String(m.id || '')).filter(Boolean);
    return { models: models.slice(0, 80), source: 'compatible' };
  } catch (e: any) {
    return {
      models: [meta.suggested_text_model, meta.suggested_vision_model].filter(Boolean),
      source: 'fallback',
      error: e?.message || 'No se pudo listar modelos',
    };
  }
}

export async function testAiConnection(
  ai: AiSettings,
): Promise<{ ok: boolean; provider: AiProviderId; detail?: string; error?: string }> {
  const provider = effectiveProvider(ai);
  const meta = providerMeta(provider);
  const base = (ai.base_url || meta.default_base_url).replace(/\/$/, '');

  try {
    if (provider === 'local') {
      const res = await withTimeout(fetch(`${base}/api/tags`), 6000);
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data = (await res.json()) as { models?: unknown[] };
      return {
        ok: true,
        provider,
        detail: `${Array.isArray(data.models) ? data.models.length : 0} modelos en Ollama`,
      };
    }
    if (provider === 'gemini') {
      if (!ai.api_key.trim()) throw new Error('Falta API key de Gemini');
      const res = await withTimeout(
        fetch(`${base}/models?key=${encodeURIComponent(ai.api_key.trim())}`),
        8000,
      );
      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
      return { ok: true, provider, detail: 'Gemini responde' };
    }
    if (!ai.api_key.trim()) throw new Error('Falta API key');
    const res = await withTimeout(
      fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${ai.api_key.trim()}`, Accept: 'application/json' },
      }),
      8000,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, provider, detail: 'Endpoint compatible OK' };
  } catch (e: any) {
    return { ok: false, provider, error: e?.message || 'Sin conexión' };
  }
}
