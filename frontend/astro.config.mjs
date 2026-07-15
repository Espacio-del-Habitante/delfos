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
    // Tunnel / móvil: el browser llama /api en el mismo origen (Astro);
    // Vite reenvía a Flask. Evita PUBLIC_API_BASE_URL=http://localhost:5000
    // (en el celular "localhost" no es tu PC).
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:5000',
          changeOrigin: true,
        },
      },
    },
  },
});