import { describe, expect, it } from 'vitest';
import {
  CONSISTENCY_DEFAULT_WEEKS,
  CONSISTENCY_MAX_WEEKS,
  CONSISTENCY_MIN_WEEKS,
  consistencyDaySchema,
  consistencyQuerySchema,
  consistencySchema,
} from './consistency.schema.js';

describe('consistencyQuerySchema', () => {
  it('sem valor usa o padrão', () => {
    expect(consistencyQuerySchema.parse({}).weeks).toBe(CONSISTENCY_DEFAULT_WEEKS);
  });

  it('aceita texto numérico e os limites', () => {
    expect(consistencyQuerySchema.parse({ weeks: '12' }).weeks).toBe(12);
    expect(consistencyQuerySchema.parse({ weeks: String(CONSISTENCY_MIN_WEEKS) }).weeks).toBe(
      CONSISTENCY_MIN_WEEKS,
    );
    expect(consistencyQuerySchema.parse({ weeks: String(CONSISTENCY_MAX_WEEKS) }).weeks).toBe(
      CONSISTENCY_MAX_WEEKS,
    );
  });

  it.each([
    String(CONSISTENCY_MIN_WEEKS - 1),
    String(CONSISTENCY_MAX_WEEKS + 1),
    '0',
    '-1',
    '2.5',
    'abc',
  ])('recusa weeks=%s', (weeks) => {
    expect(consistencyQuerySchema.safeParse({ weeks }).success).toBe(false);
  });

  it('campo extra vira erro (RS07)', () => {
    expect(consistencyQuerySchema.safeParse({ weeks: '8', extra: 1 }).success).toBe(false);
  });
});

describe('consistencyDaySchema', () => {
  it('aceita dia coerente e dia sem blocos', () => {
    expect(
      consistencyDaySchema.safeParse({ date: '2026-10-07', planned: 3, completed: 2 }).success,
    ).toBe(true);
    expect(
      consistencyDaySchema.safeParse({ date: '2026-10-07', planned: 0, completed: 0 }).success,
    ).toBe(true);
  });

  it('concluídos não passam dos planejados', () => {
    expect(
      consistencyDaySchema.safeParse({ date: '2026-10-07', planned: 1, completed: 2 }).success,
    ).toBe(false);
  });

  it('recusa data inválida e contagem negativa', () => {
    expect(
      consistencyDaySchema.safeParse({ date: '2026-02-30', planned: 0, completed: 0 }).success,
    ).toBe(false);
    expect(
      consistencyDaySchema.safeParse({ date: '2026-10-07', planned: -1, completed: 0 }).success,
    ).toBe(false);
  });
});

describe('consistencySchema', () => {
  it('exige ao menos um dia', () => {
    expect(
      consistencySchema.safeParse({ start: '2026-10-05', end: '2026-10-07', days: [] }).success,
    ).toBe(false);
  });
});
