import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
import { manifest, workbox } from './pwa.config';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // 'prompt': a versão nova só entra quando a pessoa aceita (não recarrega no meio de uma ação).
    VitePWA({
      registerType: 'prompt',
      manifest,
      workbox,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    // Em dev, /api vai para a API local. Em produção a Vercel faz o mesmo via rewrite,
    // então o front sempre chama "/api/..." na mesma origem (cookie SameSite=Strict).
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Com a suíte inteira rodando em paralelo (e a API e2e junto), 5 s (padrão) estoura em testes de
    // tela longos; a falha seria da máquina, não do código.
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
