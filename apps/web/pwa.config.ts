import type { ManifestOptions, VitePWAOptions } from 'vite-plugin-pwa';

/** Cores do tema escuro do HUD (--background em src/index.css). */
export const THEME_COLOR = '#0e0b1a';

export const manifest: Partial<ManifestOptions> = {
  name: 'LifeXP',
  short_name: 'LifeXP',
  description: 'Cumpra. Descanse. Evolua. Planeje a semana em blocos, ganhe XP pelo que cumpriu.',
  lang: 'pt-BR',
  // Abre direto nas missões do dia; o escopo cobre o app inteiro.
  start_url: '/hoje',
  scope: '/',
  id: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: THEME_COLOR,
  theme_color: THEME_COLOR,
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

/**
 * Só o "casco" do app (JS, CSS, HTML, ícones) é pré-cacheado: o app abre rápido e é instalável.
 * A API NUNCA é cacheada: XP, streak e blocos mudam o tempo todo, e o token de acesso vive só em
 * memória, então servir resposta velha seria pior que mostrar erro de rede.
 */
export const workbox: VitePWAOptions['workbox'] = {
  globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
  navigateFallback: '/index.html',
  // Navegar direto para /api/... (ex.: docs) não pode cair no index.html do app.
  navigateFallbackDenylist: [/^\/api\//],
  runtimeCaching: [
    { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
  ],
  cleanupOutdatedCaches: true,
};
