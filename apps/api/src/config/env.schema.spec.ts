import { validateEnv } from './env.schema.js';

describe('validateEnv', () => {
  it('aplica defaults e converte PORT para número', () => {
    const env = validateEnv({ DATABASE_URL: 'postgresql://x', PORT: '4000' });
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('falha quando DATABASE_URL está ausente', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });
});
