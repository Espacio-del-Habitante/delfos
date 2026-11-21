import assert from 'node:assert/strict';

function decodeUddg(href) {
  try {
    const u = new URL(href, 'https://duckduckgo.com');
    const uddg = u.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
  } catch {}
  return href;
}

const sample =
  '## [Papa criolla X 1000 G | D1](https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.d1.com.co%2Fpapa&rut=abc)\n\nPrecio aprox $4.500 COP en tienda\n\n';
const m = sample.match(/## \[(.+?)\]\((.+?)\)/);
assert.ok(m);
assert.equal(m[1], 'Papa criolla X 1000 G | D1');
assert.equal(decodeUddg(m[2]), 'https://www.d1.com.co/papa');
console.log('webSearch check ok');
