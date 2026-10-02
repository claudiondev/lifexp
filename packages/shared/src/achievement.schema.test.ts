import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_CATALOG,
  ACHIEVEMENT_KEYS,
  achievementSchema,
  achievementKeySchema,
} from './achievement.schema.js';

const base = {
  key: 'first_step',
  title: 'Primeiro passo',
  description: 'x',
  unlocked: false,
  unlockedAt: null,
  progress: null,
};
const ok = (value: unknown) => achievementSchema.safeParse(value).success;

describe('catálogo de conquistas', () => {
  it('toda chave tem título e descrição, e o catálogo não tem chaves a mais', () => {
    expect(Object.keys(ACHIEVEMENT_CATALOG).sort()).toEqual([...ACHIEVEMENT_KEYS].sort());
    for (const key of ACHIEVEMENT_KEYS) {
      expect(ACHIEVEMENT_CATALOG[key].title.length).toBeGreaterThan(0);
      expect(ACHIEVEMENT_CATALOG[key].description.endsWith('.')).toBe(true);
    }
  });

  it('as 8 conquistas iniciais, sem repetir', () => {
    expect(ACHIEVEMENT_KEYS).toHaveLength(8);
    expect(new Set(ACHIEVEMENT_KEYS).size).toBe(8);
  });

  it('a descrição cita os números reais (7, 30, 100 horas, 10 blocos)', () => {
    expect(ACHIEVEMENT_CATALOG.constant.description).toContain('7');
    expect(ACHIEVEMENT_CATALOG.unshakeable.description).toContain('30');
    expect(ACHIEVEMENT_CATALOG.hundred_hours.description).toContain('100 horas');
    expect(ACHIEVEMENT_CATALOG.deserved_rest.description).toContain('10 blocos');
  });
});

describe('achievementKeySchema', () => {
  it('aceita as chaves do catálogo e recusa outras', () => {
    expect(achievementKeySchema.safeParse('constant').success).toBe(true);
    expect(achievementKeySchema.safeParse('inventada').success).toBe(false);
  });
});

describe('achievementSchema', () => {
  it('aceita bloqueada (sem data) e desbloqueada (com data)', () => {
    expect(ok(base)).toBe(true);
    expect(ok({ ...base, unlocked: true, unlockedAt: '2026-10-07T12:00:00.000Z' })).toBe(true);
  });

  it('desbloqueada e data precisam concordar', () => {
    expect(ok({ ...base, unlocked: true })).toBe(false);
    expect(ok({ ...base, unlockedAt: '2026-10-07T12:00:00.000Z' })).toBe(false);
  });

  it('progresso tem alvo positivo', () => {
    expect(ok({ ...base, progress: { current: 3, target: 7 } })).toBe(true);
    expect(ok({ ...base, progress: { current: 3, target: 0 } })).toBe(false);
    expect(ok({ ...base, progress: { current: -1, target: 7 } })).toBe(false);
  });
});
