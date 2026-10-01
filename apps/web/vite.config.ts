import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  },
});
