import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env['CI']);
const WEB_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:3000';

// O front chama "/api/..." na mesma origem (o Vite repassa para a API em :3000), como em produção.
export default defineConfig({
  testDir: './tests',
  // Cada teste cria a própria pessoa (e-mail único), então rodam em paralelo sem dividir dados.
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: WEB_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Só para ambientes que já têm um Chromium instalado e não baixam o do Playwright.
    ...(process.env['PW_CHROMIUM_PATH'] && {
      launchOptions: { executablePath: process.env['PW_CHROMIUM_PATH'] },
    }),
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node scripts/start-api.mjs',
      url: `${API_URL}/api/health/ready`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      stdout: 'pipe',
      env: {
        NODE_ENV: 'test',
        PORT: '3000',
        APP_URL: WEB_URL,
        JWT_ACCESS_SECRET: 'e2e-e2e-e2e-e2e-e2e-e2e-e2e-e2e-e2e',
        // Cada teste cadastra uma pessoa: o limite por IP (RS08) travaria a suíte.
        AUTH_RATE_LIMIT_PER_MINUTE: '1000',
        // Sem varreduras em segundo plano: nada de aviso nascendo no meio de um teste.
        NOTIFICATIONS_SCHEDULER: 'false',
        QUESTS_SCHEDULER: 'false',
        ...(process.env['E2E_DATABASE_URL'] && {
          E2E_DATABASE_URL: process.env['E2E_DATABASE_URL'],
        }),
      },
    },
    {
      command: 'pnpm --filter @lifexp/web exec vite --port 5173 --strictPort',
      url: WEB_URL,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
