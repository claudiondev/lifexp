import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      // RNF02: regras de negócio puras (domain/) precisam de >= 80% de cobertura. Só o domínio
      // entra na meta; controllers e services são cobertos pelos testes e2e.
      include: ['src/**/domain/**/*.ts'],
      exclude: ['**/*.spec.ts'],
      reporter: ['text-summary', 'text'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
