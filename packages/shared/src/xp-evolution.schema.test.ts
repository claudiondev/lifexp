import { describe, expect, it } from 'vitest';
import {
  XP_EVOLUTION_DEFAULT_WEEKS,
  XP_EVOLUTION_MAX_WEEKS,
  xpEvolutionQuerySchema,
  xpEvolutionSchema,
  xpEvolutionWeekSchema,
} from './xp-evolution.schema.js';

const week = (patch: object = {}) => ({
  weekStart: '2026-10-05',
  gained: 100,
  reverted: 20,
  net: 80,
  byArea: [],
  ...patch,
});

describe('xpEvolutionQuerySchema', () => {
  it('sem valor usa o padrão', () => {
    expect(xpEvolutionQuerySchema.parse({}).weeks).toBe(XP_EVOLUTION_DEFAULT_WEEKS);
  });

  it('aceita texto numérico (vem da URL)', () => {
    expect(xpEvolutionQuerySchema.parse({ weeks: '12' }).weeks).toBe(12);
  });

  it.each(['1', '0', '-3', String(XP_EVOLUTION_MAX_WEEKS + 1), '2.5', 'abc'])(
    'recusa weeks=%s',
    (weeks) => {
      expect(xpEvolutionQuerySchema.safeParse({ weeks }).success).toBe(false);
    },
  );

  it('campo extra vira erro (RS07)', () => {
    expect(xpEvolutionQuerySchema.safeParse({ weeks: '4', extra: 1 }).success).toBe(false);
  });
});

describe('xpEvolutionWeekSchema', () => {
  it('aceita uma semana coerente', () => {
    expect(xpEvolutionWeekSchema.safeParse(week()).success).toBe(true);
  });

  it('exige net = ganhos - estornos', () => {
    expect(xpEvolutionWeekSchema.safeParse(week({ net: 99 })).success).toBe(false);
  });

  it('net pode ser negativo (estorno de XP de semana anterior)', () => {
    expect(
      xpEvolutionWeekSchema.safeParse(week({ gained: 0, reverted: 50, net: -50 })).success,
    ).toBe(true);
  });

  it('weekStart precisa ser segunda-feira', () => {
    expect(xpEvolutionWeekSchema.safeParse(week({ weekStart: '2026-10-07' })).success).toBe(false);
  });
});

describe('xpEvolutionSchema', () => {
  it('exige ao menos 2 semanas', () => {
    expect(xpEvolutionSchema.safeParse({ weeks: [week()], today: '2026-10-07' }).success).toBe(
      false,
    );
  });
});
