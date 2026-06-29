// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://astro.build/config
export default defineConfig({
  integrations: [svelte()],
  vite: {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@common': path.resolve(__dirname, './src/common'),
        '@features': path.resolve(__dirname, './src/features'),
      },
    },
  },
});