import {
  effectiveProvider,
  providerMeta,
  type AiSettings,
} from './aiSettings';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

function stripJsonFence(raw: string) {
  const s = String(raw || '').trim();
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : s).trim();
}

/** Completar texto → JSON (estilo Delfos complete_json), usando la config de Ágora. */
export async function completeJson(ai: AiSettings, prompt: string): Promise<string> {
  const provider = effectiveProvider(ai);
  const meta = providerMeta(provider);
  const base = (ai.base_url || meta.default_base_url).replace(/\/$/, '');
  const model = ai.text_model || meta.suggested_text_model;

  if (provider === 'local') {
    const res = await withTimeout(
      fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          messages: [
            { role: 'system', content: 'Responde solo JSON válido, sin markdown.' },
            { role: 'user', content: prompt },
          ],
        }),
      }),
      45000,
    );
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = (await res.json()) as { message?: { content?: string } };
    return stripJsonFence(data.message?.content || '');
  }

  if (provider === 'gemini') {
    if (!ai.api_key.trim()) throw new Error('Falta API key de Gemini');
    const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(ai.api_key.trim())}`;
    const res = await withTimeout(
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }),
      45000,
    );
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    return stripJsonFence(text);
  }

  if (!ai.api_key.trim()) throw new Error('Falta API key');
  const res = await withTimeout(
    fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ai.api_key.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Responde solo JSON válido.' },
          { role: 'user', content: prompt },
        ],
      }),
    }),
    45000,
  );
  if (!res.ok) throw new Error(`Compatible HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return stripJsonFence(data.choices?.[0]?.message?.content || '');
}

export function aiReady(ai: AiSettings) {
  const provider = effectiveProvider(ai);
  const meta = providerMeta(provider);
  if (provider === 'local') return true;
  return Boolean(ai.api_key.trim()) || !meta.needs_key;
}
