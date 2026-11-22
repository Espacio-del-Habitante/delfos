import assert from 'node:assert/strict';

function looksLikeUrl(s) {
  return /https?:\/\//i.test(s) || /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(String(s).trim());
}

function cleanSnippet(raw, hostname, store) {
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

assert.equal(
  cleanSnippet('[](https://x) www.d1.com.co/papa', 'd1.com.co', 'D1'),
  'Precio en D1',
);
assert.equal(
  cleanSnippet('Papa Criolla EXITO 1000 gr $ 9.200 Llévalo con puntos', 'exito.com', 'Éxito').includes('Papa'),
  true,
);
assert.equal(looksLikeUrl('www.exito.com/papa'), true);
assert.equal(looksLikeUrl('Ahorra en D1 hoy'), false);

console.log('webSearch check ok');
