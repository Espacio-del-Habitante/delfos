// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  integrations: [svelte()],
  vite: {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@mercado': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      allowedHosts: true,
    },
  },
});
