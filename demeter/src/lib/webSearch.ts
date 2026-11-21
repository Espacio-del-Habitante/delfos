import { extractCopPrices, median } from './priceSearch';

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
  approx: number | null;
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

/** Resultados de búsqueda visibles in-app (via Jina → DuckDuckGo HTML). */
export async function fetchWebSearchResults(query: string): Promise<{
  query: string;
  hits: SearchHit[];
  googleUrl: string;
}> {
  const q = String(query || '').trim() || 'precio Colombia';
  const googleUrl = `https://www.google.com/search?hl=es-419&gl=co&q=${encodeURIComponent(`${q} precio Colombia`)}`;
  const jinaUrl = `https://r.jina.ai/http://html.duckduckgo.com/html/?q=${encodeURIComponent(`${q} precio Colombia supermercado`)}`;

  const res = await fetch(jinaUrl, { headers: { Accept: 'text/plain' } });
  if (!res.ok) throw new Error(`search HTTP ${res.status}`);
  const text = await res.text();

  const hits: SearchHit[] = [];
  const re = /## \[(.+?)\]\((.+?)\)\n+([\s\S]*?)(?=\n## |\n*$)/g;
  for (const m of text.matchAll(re)) {
    const title = m[1].replace(/\*\*/g, '').trim();
    const url = decodeUddg(m[2]);
    const snippet = m[3]
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\*\*/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
    if (!title || /duckduckgo\.com\/html/i.test(url)) continue;
    const prices = extractCopPrices(`${title} ${snippet}`);
    hits.push({
      title,
      url,
      snippet,
      approx: median(prices),
    });
    if (hits.length >= 8) break;
  }

  return { query: q, hits, googleUrl };
}
