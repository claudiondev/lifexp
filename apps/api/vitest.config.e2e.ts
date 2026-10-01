import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // O e2e do health não toca o banco (conexão preguiçosa), mas o env precisa ser válido.
    env: { DATABASE_URL: 'postgresql://lifexp:lifexp@localhost:5433/lifexp?schema=public' },
  },
});
