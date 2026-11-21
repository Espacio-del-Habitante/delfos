import { extractCopPrices, median } from './priceSearch';
import { aiReady, completeJson } from './aiComplete';
import { getAiSettings } from './store';
import { effectiveProvider, type AiSettings } from './aiSettings';

export type SearchHit = {
  title: string;
  url: string;
  /** Texto legible, nunca una URL. */
  snippet: string;
  store: string;
  hostname: string;
  image: string | null;
  approx: number | null;
  source?: 'scrape' | 'ai';
};

function decodeUddg(href: string) {
  try {
    const u = new URL(href, 'https://duckduckgo.com');
    const uddg = u.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
  } catch {
    /* ignore */
  }
  return href;
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function storeLabel(hostname: string, title: string, snippet: string) {
  const blob = `${hostname} ${title} ${snippet}`.toLowerCase();
  if (/\bd1\b|tiendas\s*d1/.test(blob)) return 'D1';
  if (/éxito|exito\.com|\bexito\b/.test(blob)) return 'Éxito';
  if (/mercado\s*libre|mercadolibre|\bmeli\b/.test(blob)) return 'Mercado Libre';
  if (/jumbo/.test(blob)) return 'Jumbo';
  if (/olakasa|ola\s*kasa/.test(blob)) return 'Ola Kasa';
  if (/croper/.test(blob)) return 'Croper';
  if (/agronegocios/.test(blob)) return 'Agronegocios';
  const host = hostname.split('.')[0] || 'Web';
  return host.charAt(0).toUpperCase() + host.slice(1);
}

function faviconFor(hostname: string) {
  if (!hostname) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`;
}

function looksLikeUrl(s: string) {
  return /https?:\/\//i.test(s) || /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s.trim());
}

function cleanSnippet(raw: string, hostname: string, store?: string) {
  let snippet = String(raw || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/^\(+|\)+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!snippet || snippet.length < 8 || looksLikeUrl(snippet)) {
    return store ? `Precio en ${store}` : hostname ? `Precio en ${hostname}` : 'Resultado de búsqueda';
  }
  return snippet.slice(0, 140);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/** Foto + precio extra de la ficha del producto. */
async function scrapeProductPage(url: string): Promise<{ image: string | null; approx: number | null }> {
  try {
    const res = await withTimeout(
      fetch(`https://r.jina.ai/${url}`, { headers: { Accept: 'text/plain' } }),
      9000,
    );
    if (!res.ok) return { image: null, approx: null };
    const text = await res.text();
    const md = [...text.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi)].map((m) => m[1]);
    const naked = [...text.matchAll(/https?:\/\/[^\s)"']+\.(?:jpg|jpeg|png|webp)(?:\?[^\s)"']*)?/gi)].map(
      (m) => m[0],
    );
    const candidates = [...md, ...naked].filter(
      (u) => !/\.ico(\?|$)/i.test(u) && !/favicon|sprite|logo-small|1x1|pixel/i.test(u),
    );
    const prices = extractCopPrices(text.slice(0, 4000));
    return { image: candidates[0] || null, approx: median(prices.slice(0, 8)) };
  } catch {
    return { image: null, approx: null };
  }
}

function parseDdgMarkdown(text: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const re = /## \[(.+?)\]\((.+?)\)\n+([\s\S]*?)(?=\n## |\n*$)/g;
  for (const m of text.matchAll(re)) {
    const title = m[1].replace(/\*\*/g, '').trim();
    const url = decodeUddg(m[2]);
    if (!title || /duckduckgo\.com\/html/i.test(url)) continue;
    const hostname = hostnameOf(url);
    const body = m[3] || '';
    const store = storeLabel(hostname, title, body);
    const snippet = cleanSnippet(body, hostname, store);
    const prices = extractCopPrices(`${title} ${body}`);
    hits.push({
      title,
      url,
      snippet,
      store,
      hostname,
      image: faviconFor(hostname),
      approx: median(prices),
      source: 'scrape',
    });
    if (hits.length >= 8) break;
  }
  return hits;
}

async function organizeWithAi(
  query: string,
  hits: SearchHit[],
  ai: AiSettings,
): Promise<SearchHit[] | null> {
  if (!hits.length || !aiReady(ai)) return null;
  // Si es Ollama, un ping corto evita esperar 15s cuando no hay daemon.
  if (effectiveProvider(ai) === 'local') {
    try {
      const base = (ai.base_url || 'http://127.0.0.1:11434').replace(/\/$/, '');
      const ping = await withTimeout(fetch(`${base}/api/tags`), 1200);
      if (!ping.ok) return null;
    } catch {
      return null;
    }
  }
  const compact = hits.slice(0, 6).map((h, i) => ({
    i,
    title: h.title,
    store: h.store,
    url: h.url,
    snippet: h.snippet,
    approx: h.approx,
  }));
  const prompt = `Eres un asistente de mercado en Colombia.
Producto buscado: "${query}"
Resultados crudos:
${JSON.stringify(compact)}

Devuelve SOLO un JSON con esta forma:
{"cards":[{"i":0,"title":"nombre corto del producto","store":"D1","price":9200,"summary":"frase humana sin urls ni dominios"}]}

Reglas:
- Máximo 6 cards, solo ofertas útiles de supermercado/precio.
- price en COP entero o null si no hay monto claro.
- summary máximo 90 caracteres, español, sin URLs ni hostnames.
- title corto (sin SEO basura).
- Usa el índice i del resultado original.`;

  try {
    const raw = await completeJson(ai, prompt);
    const parsed = JSON.parse(raw) as {
      cards?: Array<{ i?: number; title?: string; store?: string; price?: number | null; summary?: string }>;
    };
    const cards = Array.isArray(parsed.cards) ? parsed.cards : [];
    if (!cards.length) return null;
    const out: SearchHit[] = [];
    for (const c of cards) {
      const base = hits[Number(c.i)] || hits[0];
      if (!base) continue;
      const price = c.price != null && Number.isFinite(Number(c.price)) ? Number(c.price) : base.approx;
      const summary = cleanSnippet(c.summary || base.snippet, base.hostname, c.store || base.store);
      out.push({
        ...base,
        title: (c.title || base.title).trim().slice(0, 80),
        store: (c.store || base.store).trim() || base.store,
        snippet: summary,
        approx: price != null && price >= 500 && price <= 2_000_000 ? Math.round(price) : null,
        source: 'ai',
      });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/** Resultados listos para cards: scrape + (opcional) IA + foto de producto. */
export async function fetchWebSearchResults(query: string): Promise<{
  query: string;
  hits: SearchHit[];
  googleUrl: string;
  organizedBy: 'ai' | 'scrape';
}> {
  const q = String(query || '').trim() || 'precio Colombia';
  const googleUrl = `https://www.google.com/search?hl=es-419&gl=co&q=${encodeURIComponent(`${q} precio Colombia`)}`;
  const jinaUrl = `https://r.jina.ai/http://html.duckduckgo.com/html/?q=${encodeURIComponent(`${q} precio Colombia supermercado`)}`;

  const res = await fetch(jinaUrl, { headers: { Accept: 'text/plain' } });
  if (!res.ok) throw new Error(`search HTTP ${res.status}`);
  const text = await res.text();
  let hits = parseDdgMarkdown(text);

  const ai = getAiSettings();
  // ponytail: techo 15s — si Ollama/nube no responde, nos quedamos con el scrape.
  const organized = await withTimeout(organizeWithAi(q, hits, ai), 15000).catch(() => null);
  const organizedBy = organized ? 'ai' : 'scrape';
  if (organized) hits = organized;

  // Enriquecer foto + precio desde la ficha (top 4); si falla, queda favicon/scrape.
  await Promise.all(
    hits.slice(0, 4).map(async (h, idx) => {
      const extra = await scrapeProductPage(h.url);
      hits[idx] = {
        ...hits[idx],
        image: extra.image || hits[idx].image,
        approx: hits[idx].approx ?? extra.approx,
      };
    }),
  );

  return { query: q, hits, googleUrl, organizedBy };
}
