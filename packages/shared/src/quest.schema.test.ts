import { describe, expect, it } from 'vitest';
import {
  QUEST_BONUS_PERCENT,
  QUEST_TARGET_PERCENT,
  QUEST_TIERS,
  questQuerySchema,
  questSchema,
  questStatusSchema,
  questTierSchema,
} from './quest.schema.js';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

const quest = {
  weekStart: '2026-10-05',
  status: 'active',
  eligible: 10,
  completed: 6,
  target: 8,
  ratio: 0.6,
  bonusXp: 120,
  tiers: [
    { percent: 80, requiredCount: 8, reached: false },
    { percent: 90, requiredCount: 9, reached: false },
    { percent: 100, requiredCount: 10, reached: false },
  ],
  completedAt: null,
};

describe('constantes da quest (RN17, RN34)', () => {
  it('80% cumpre, 20% de bônus, faixas de 80, 90 e 100', () => {
    expect(QUEST_TARGET_PERCENT).toBe(80);
    expect(QUEST_BONUS_PERCENT).toBe(20);
    expect([...QUEST_TIERS]).toEqual([80, 90, 100]);
  });
});

describe('questSchema', () => {
  it('aceita ativa, cumprida e sem quest', () => {
    expect(ok(questSchema, quest)).toBe(true);
    expect(
      ok(questSchema, {
        ...quest,
        status: 'completed',
        completed: 8,
        completedAt: '2026-10-09T15:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      ok(questSchema, {
        ...quest,
        status: 'none',
        eligible: 0,
        completed: 0,
        target: 0,
        ratio: null,
        bonusXp: 0,
        tiers: [],
      }),
    ).toBe(true);
  });

  it('a proporção é de 0 a 1 ou nula', () => {
    for (const ratio of [0, 0.5, 1, null]) expect(ok(questSchema, { ...quest, ratio })).toBe(true);
    for (const ratio of [-0.1, 1.01]) expect(ok(questSchema, { ...quest, ratio })).toBe(false);
  });

  it('contagens e bônus são inteiros não negativos', () => {
    for (const field of ['eligible', 'completed', 'target', 'bonusXp']) {
      expect(ok(questSchema, { ...quest, [field]: -1 })).toBe(false);
      expect(ok(questSchema, { ...quest, [field]: 1.5 })).toBe(false);
    }
  });

  it('só os três estados conhecidos', () => {
    for (const status of ['none', 'active', 'completed'])
      expect(ok(questStatusSchema, status)).toBe(true);
    expect(ok(questStatusSchema, 'failed')).toBe(false);
    expect(ok(questStatusSchema, 'expired')).toBe(false); // não existe quest "perdida": nada pune
  });

  it('a data de conclusão é um instante ISO ou nula', () => {
    expect(ok(questSchema, { ...quest, completedAt: 'ontem' })).toBe(false);
  });
});

describe('questTierSchema', () => {
  it('só as faixas 80, 90 e 100', () => {
    for (const percent of [80, 90, 100]) {
      expect(ok(questTierSchema, { percent, requiredCount: 1, reached: true })).toBe(true);
    }
    for (const percent of [0, 50, 85, 101]) {
      expect(ok(questTierSchema, { percent, requiredCount: 1, reached: true })).toBe(false);
    }
  });
});

describe('questQuerySchema', () => {
  it('a semana é opcional (padrão: a atual) e precisa ser segunda-feira', () => {
    expect(ok(questQuerySchema, {})).toBe(true);
    expect(ok(questQuerySchema, { weekStart: '2026-10-05' })).toBe(true);
    expect(ok(questQuerySchema, { weekStart: '2026-10-06' })).toBe(false);
    expect(ok(questQuerySchema, { weekStart: '2026-02-30' })).toBe(false);
    expect(() => questQuerySchema.safeParse({ weekStart: 'abc' })).not.toThrow();
  });
});
