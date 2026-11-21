#!/usr/bin/env node
/**
 * Copia piezas visuales de Delfos al package Mercado (aparte).
 * Así el build/publish no depende de paths fuera de mercado/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendCommon = path.resolve(root, '../frontend/src/common');
const out = path.resolve(root, 'src/vendor/delfos');

const files = [
  ['styles/global.css', 'global.css'],
  ['lib/toast.ts', 'toast.ts'],
  ['molecules/Toast.svelte', 'Toast.svelte'],
];

fs.mkdirSync(out, { recursive: true });

for (const [rel, name] of files) {
  const src = path.join(frontendCommon, rel);
  if (!fs.existsSync(src)) {
    console.error(`Missing Delfos file: ${src}`);
    process.exit(1);
  }
  let text = fs.readFileSync(src, 'utf8');
  if (name === 'Toast.svelte') {
    text = text.replaceAll('@common/lib/toast', './toast');
  }
  // Deméter: apaga el índigo/morado de Delfos en el CSS vendored.
  if (name === 'global.css') {
    text = text
      .replaceAll('#4f46e5', '#1b7a4a')
      .replaceAll('#4338ca', '#166534')
      .replaceAll('#8b5cf6', '#3f9b68')
      .replaceAll('rgba(79, 70, 229', 'rgba(27, 122, 74')
      .replaceAll('rgba(139, 92, 246', 'rgba(63, 155, 104');
  }
  fs.writeFileSync(path.join(out, name), text);
  console.log('vendored', name);
}
