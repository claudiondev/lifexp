import { defineConfig } from 'vitest/config';
import { resolveTestDatabase } from './test/test-db.js';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: resolveTestDatabase().testUrl,
      JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123',
      AUTH_RATE_LIMIT_PER_MINUTE: '1000',
      COOKIE_SECURE: 'false',
    },
  },
});
