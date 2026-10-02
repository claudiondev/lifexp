import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REVIEWS_PAGE,
  MAX_REVIEWS_PAGE,
  REVIEW_TEXT_MAX,
  areaAdherenceSchema,
  listReviewsQuerySchema,
  reviewDetailSchema,
  reviewPageSchema,
  reviewWeekParamSchema,
  updateReviewSchema,
  weekSummarySchema,
  weeklyReviewSchema,
} from './review.schema.js';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

const id = '0192f1a0-7b3c-7000-8000-0000000000a1';
const area = {
  areaId: id,
  name: 'Saúde',
  color: 'moss',
  icon: 'heart-pulse',
  planned: 4,
  completed: 3,
  plannedMin: 240,
  completedMin: 180,
  adherence: 0.75,
};
const summary = {
  weekStart: '2026-10-05',
  weekEnd: '2026-10-11',
  totals: {
    planned: 4,
    completed: 3,
    plannedMin: 240,
    completedMin: 180,
    skipped: 1,
    adherence: 0.75,
    xp: 180,
  },
  areas: [area],
};
const review = {
  weekStart: '2026-10-05',
  wins: 'Corri 3 vezes',
  blockers: 'Choveu',
  nextPriority: 'Entregar o relatório',
  updatedAt: '2026-10-11T20:00:00.000Z',
};

describe('weekSummarySchema', () => {
  it('aceita o resumo, inclusive de uma semana sem nada planejado', () => {
    expect(ok(weekSummarySchema, summary)).toBe(true);
    expect(
      ok(weekSummarySchema, {
        ...summary,
        totals: { ...summary.totals, planned: 0, completed: 0, adherence: null, xp: 0 },
        areas: [],
      }),
    ).toBe(true);
  });

  it('aderência é de 0 a 1 ou nula (nunca 0% de nada planejado)', () => {
    expect(ok(areaAdherenceSchema, { ...area, adherence: 0 })).toBe(true);
    expect(ok(areaAdherenceSchema, { ...area, adherence: 1 })).toBe(true);
    expect(ok(areaAdherenceSchema, { ...area, adherence: null })).toBe(true);
    expect(ok(areaAdherenceSchema, { ...area, adherence: 1.01 })).toBe(false);
    expect(ok(areaAdherenceSchema, { ...area, adherence: -0.1 })).toBe(false);
  });

  it('contagens são inteiros não negativos; o XP líquido pode ser negativo', () => {
    expect(ok(areaAdherenceSchema, { ...area, planned: -1 })).toBe(false);
    expect(ok(areaAdherenceSchema, { ...area, completed: 1.5 })).toBe(false);
    expect(ok(weekSummarySchema, { ...summary, totals: { ...summary.totals, xp: -60 } })).toBe(
      true,
    );
    expect(ok(weekSummarySchema, { ...summary, totals: { ...summary.totals, skipped: -1 } })).toBe(
      false,
    );
  });

  it('cor e ícone da área são das listas fixas', () => {
    expect(ok(areaAdherenceSchema, { ...area, color: 'neon' })).toBe(false);
    expect(ok(areaAdherenceSchema, { ...area, icon: 'foguete' })).toBe(false);
  });
});

describe('updateReviewSchema', () => {
  const body = { wins: 'a', blockers: 'b', nextPriority: 'c' };

  it('aceita os três campos, inclusive vazios (limpar uma reflexão)', () => {
    expect(ok(updateReviewSchema, body)).toBe(true);
    expect(ok(updateReviewSchema, { wins: '', blockers: '', nextPriority: '' })).toBe(true);
  });

  it('apara espaços nas pontas', () => {
    expect(
      updateReviewSchema.parse({ wins: '  ok  ', blockers: '', nextPriority: '\n x \n' }),
    ).toEqual({
      wins: 'ok',
      blockers: '',
      nextPriority: 'x',
    });
  });

  it('exige os três campos e rejeita campos extras (RS07)', () => {
    expect(ok(updateReviewSchema, { wins: 'a', blockers: 'b' })).toBe(false);
    expect(ok(updateReviewSchema, { ...body, userId: 'x' })).toBe(false);
    expect(ok(updateReviewSchema, { ...body, weekStart: '2026-10-05' })).toBe(false);
    expect(ok(updateReviewSchema, { ...body, wins: 1 })).toBe(false);
  });

  it('limite de 2000 caracteres por campo, contados depois de aparar', () => {
    expect(REVIEW_TEXT_MAX).toBe(2000);
    expect(ok(updateReviewSchema, { ...body, wins: 'x'.repeat(2000) })).toBe(true);
    expect(ok(updateReviewSchema, { ...body, wins: 'x'.repeat(2001) })).toBe(false);
    expect(ok(updateReviewSchema, { ...body, blockers: 'x'.repeat(2001) })).toBe(false);
    expect(ok(updateReviewSchema, { ...body, nextPriority: 'x'.repeat(2001) })).toBe(false);
    expect(ok(updateReviewSchema, { ...body, wins: `  ${'x'.repeat(2000)}  ` })).toBe(true);
  });
});

describe('reviewWeekParamSchema', () => {
  it('só aceita segunda-feira e datas válidas', () => {
    expect(ok(reviewWeekParamSchema, { weekStart: '2026-10-05' })).toBe(true);
    expect(ok(reviewWeekParamSchema, { weekStart: '2026-10-06' })).toBe(false);
    expect(ok(reviewWeekParamSchema, { weekStart: '2026-02-30' })).toBe(false);
    expect(ok(reviewWeekParamSchema, { weekStart: 'hoje' })).toBe(false);
    expect(ok(reviewWeekParamSchema, {})).toBe(false);
  });
});

describe('reviewDetailSchema', () => {
  it('aceita com e sem revisão e com e sem prioridade anterior', () => {
    expect(ok(reviewDetailSchema, { summary, review, previousPriority: 'Foco' })).toBe(true);
    expect(ok(reviewDetailSchema, { summary, review: null, previousPriority: null })).toBe(true);
    expect(ok(weeklyReviewSchema, review)).toBe(true);
    expect(ok(weeklyReviewSchema, { ...review, updatedAt: 'ontem' })).toBe(false);
  });
});

describe('listReviewsQuerySchema', () => {
  it('padrão de 20, máximo de 50, e converte o limite da query string', () => {
    expect(listReviewsQuerySchema.parse({})).toEqual({ limit: DEFAULT_REVIEWS_PAGE });
    expect(listReviewsQuerySchema.parse({ limit: '5', before: '2026-10-05' })).toEqual({
      limit: 5,
      before: '2026-10-05',
    });
    expect(ok(listReviewsQuerySchema, { limit: String(MAX_REVIEWS_PAGE) })).toBe(true);
    expect(ok(listReviewsQuerySchema, { limit: String(MAX_REVIEWS_PAGE + 1) })).toBe(false);
    expect(ok(listReviewsQuerySchema, { limit: '0' })).toBe(false);
  });

  it('semana ou cursor inexistente é recusado sem lançar erro', () => {
    for (const value of ['2026-02-30', 'abc', '']) {
      expect(() => reviewWeekParamSchema.safeParse({ weekStart: value })).not.toThrow();
      expect(() => listReviewsQuerySchema.safeParse({ before: value })).not.toThrow();
    }
  });

  it('o cursor é uma segunda-feira válida', () => {
    expect(ok(listReviewsQuerySchema, { before: '2026-10-06' })).toBe(false);
    expect(ok(listReviewsQuerySchema, { before: 'abc' })).toBe(false);
  });
});

describe('reviewPageSchema', () => {
  it('aceita página com e sem próxima', () => {
    const item = { weekStart: '2026-10-05', nextPriority: 'Foco', updatedAt: review.updatedAt };
    expect(ok(reviewPageSchema, { items: [item], nextCursor: '2026-10-05' })).toBe(true);
    expect(ok(reviewPageSchema, { items: [], nextCursor: null })).toBe(true);
  });
});
