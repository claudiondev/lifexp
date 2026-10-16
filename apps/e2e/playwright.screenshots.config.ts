import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

/**
 * Capturas de tela do README (`pnpm --filter @lifexp/e2e screenshots`). Reaproveita os servidores e o banco da suíte
 * e2e, mas roda só `screenshots/`, em tema escuro e um trabalhador (a semeadura de dados é sequencial). Não faz parte
 * do `e2e` nem do CI: gera imagens, não verifica nada.
 */
export default defineConfig({
  ...base,
  testDir: './screenshots',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  projects: [
    {
      name: 'readme',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        colorScheme: 'dark',
      },
    },
  ],
});
