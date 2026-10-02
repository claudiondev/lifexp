import { defineConfig } from 'vitest/config';
import { resolveTestDatabase } from './test/test-db.js';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // argon2 é caro de propósito (RS01); com vários arquivos e2e e os testes da web em paralelo,
    // 5 s (padrão) estoura em máquinas com poucos núcleos, como o runner do CI.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: resolveTestDatabase().testUrl,
      JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123',
      AUTH_RATE_LIMIT_PER_MINUTE: '1000',
      COOKIE_SECURE: 'false',
      // O agendador não pode mexer nos dados no meio dos testes: a varredura é chamada à mão.
      NOTIFICATIONS_SCHEDULER: 'false',
      // Idem para o snapshot da quest: os testes chamam `runOnce` à mão.
      QUESTS_SCHEDULER: 'false',
    },
  },
});
