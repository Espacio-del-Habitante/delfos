/** Comparación de precios: aprox. desde la web; si falla, Google. */

export type PriceQuote = {
  id: string;
  label: string;
  status: 'ok' | 'missing';
  approx: number | null;
  sample: string | null;
  url: string;
  source?: string;
};

type StoreDef = {
  id: string;
  label: string;
  match: RegExp;
  searchUrl: (q: string) => string;
};

const STORE_DEFS: StoreDef[] = [
  {
    id: 'exito',
    label: 'Éxito',
    match: /\béxito\b|\bexito\b/i,
    searchUrl: (q) => `https://www.exito.com/s?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'd1',
    label: 'D1',
    match: /\bd1\b|justo\s*y\s*bueno|tiendas\s*d1/i,
    searchUrl: (q) =>
      `https://www.google.com/search?hl=es-419&gl=co&q=${encodeURIComponent(`precio ${q} D1 Colombia`)}`,
  },
  {
    id: 'ml',
    label: 'Mercado Libre',
    match: /mercado\s*libre|\bmeli\b/i,
    searchUrl: (q) => `https://listado.mercadolibre.com.co/${encodeURIComponent(q)}`,
  },
];

export function googlePriceUrl(productName: string, storeLabel = '') {
  const q = [productName, storeLabel, 'precio', 'Colombia'].filter(Boolean).join(' ');
  return `https://www.google.com/search?hl=es-419&gl=co&q=${encodeURIComponent(q)}`;
}

/** Extrae montos COP plausibles de un texto libre. */
export function extractCopPrices(text: string): number[] {
  const raw = String(text || '');
  const out: number[] = [];
  const re =
    /(?:\$\s*)(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})(?:\s*(?:COP|pesos))?|\b(\d{1,3}(?:[.\s]\d{3})+)\s*(?:COP|pesos)\b/gi;
  for (const m of raw.matchAll(re)) {
    const token = (m[1] || m[2] || '').replace(/\s/g, '').replace(/\./g, '');
    const n = Number(token);
    // ponytail: filtra ruido (años, ids); mercado típico 500–2_000_000
    if (Number.isFinite(n) && n >= 500 && n <= 2_000_000) out.push(n);
  }
  return out;
}

export function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    }),
  ]);
}

async function fetchMercadoLibre(query: string) {
  const url = `https://api.mercadolibre.com/sites/MCO/search?q=${encodeURIComponent(query)}&limit=12`;
  const res = await withTimeout(fetch(url, { headers: { Accept: 'application/json' } }), 8000, 'ml');
  if (!res.ok) throw new Error(`ML HTTP ${res.status}`);
  const data = (await res.json()) as { results?: Array<{ price?: number; title?: string }> };
  const results = Array.isArray(data.results) ? data.results : [];
  const prices = results.map((r) => Number(r.price)).filter((n) => Number.isFinite(n) && n > 0);
  return {
    prices,
    sample: results[0]?.title || null,
    url: `https://listado.mercadolibre.com.co/${encodeURIComponent(query)}`,
  };
}

async function fetchViaJina(pageUrl: string) {
  const res = await withTimeout(
    fetch(`https://r.jina.ai/${pageUrl}`, { headers: { Accept: 'text/plain' } }),
    12000,
    'jina',
  );
  if (!res.ok) throw new Error(`jina HTTP ${res.status}`);
  return res.text();
}

async function quoteForStore(store: StoreDef, query: string): Promise<PriceQuote> {
  const pageUrl =
    store.id === 'd1'
      ? `https://www.bing.com/search?q=${encodeURIComponent(`precio ${query} D1 supermercado Colombia`)}&setlang=es-co`
      : store.id === 'exito'
        ? `https://www.bing.com/search?q=${encodeURIComponent(`precio ${query} éxito colombia`)}&setlang=es-co`
        : store.searchUrl(query);

  try {
    if (store.id === 'ml') {
      try {
        const ml = await fetchMercadoLibre(query);
        const approx = median(ml.prices);
        if (approx != null) {
          return {
            id: store.id,
            label: store.label,
            status: 'ok',
            approx,
            sample: ml.sample,
            url: ml.url,
            source: 'api',
          };
        }
      } catch {
        /* fall through */
      }
    }

    const text = await fetchViaJina(pageUrl);
    const prices = extractCopPrices(text);
    const lines = text.split('\n');
    const focused = lines.filter((l) => store.match.test(l) || /\$|\bCOP\b/i.test(l)).join('\n');
    const focusedPrices = extractCopPrices(focused);
    const pool = focusedPrices.length ? focusedPrices : prices;
    const approx = median(pool.slice(0, 12));
    if (approx == null) {
      return {
        id: store.id,
        label: store.label,
        status: 'missing',
        approx: null,
        sample: null,
        url: googlePriceUrl(query, store.label),
        source: 'none',
      };
    }
    return {
      id: store.id,
      label: store.label,
      status: 'ok',
      approx,
      sample: null,
      url: store.searchUrl(query),
      source: 'web',
    };
  } catch {
    return {
      id: store.id,
      label: store.label,
      status: 'missing',
      approx: null,
      sample: null,
      url: googlePriceUrl(query, store.label),
      source: 'error',
    };
  }
}

export async function fetchPriceQuotes(productName: string) {
  const query = String(productName || '').trim();
  if (!query) {
    return { query: '', quotes: [] as PriceQuote[], googleUrl: googlePriceUrl(''), found: 0 };
  }
  const quotes = await Promise.all(STORE_DEFS.map((s) => quoteForStore(s, query)));
  return {
    query,
    quotes,
    googleUrl: googlePriceUrl(query),
    found: quotes.filter((q) => q.status === 'ok').length,
  };
}
