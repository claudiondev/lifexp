import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.schema.js';

describe('healthResponseSchema', () => {
  it('aceita uma resposta válida', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('rejeita status desconhecido', () => {
    const result = healthResponseSchema.safeParse({ status: 'x', timestamp: 'nope' });
    expect(result.success).toBe(false);
  });
});
