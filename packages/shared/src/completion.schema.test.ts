import { describe, expect, it } from 'vitest';
import { weekResponseSchema } from './block.schema.js';
import {
  areaProgressSchema,
  completionResultSchema,
  completionSchema,
  levelProgressSchema,
  progressSchema,
  jokerSchema,
  streakSchema,
  undoResultSchema,
} from './completion.schema.js';
import { occurrenceStatusSchema, todayItemSchema, todayResponseSchema } from './today.schema.js';
import { levelProgress } from './xp.js';

const id = (n: number) => `0192f1a0-7b3c-7000-8000-${String(n).padStart(12, '0')}`;
const completion = {
  blockId: id(1),
  occurrenceDate: '2026-10-07',
  completedAt: '2026-10-07T15:00:00.000Z',
  xpAmount: 60,
};
const occurrence = {
  blockId: id(1),
  occurrenceDate: '2026-10-07',
  date: '2026-10-07',
  startTime: '09:00',
  durationMin: 60,
  activityId: id(2),
  areaId: id(3),
  goalId: null,
  recurrence: 'weekly' as const,
  skipped: false,
  modified: false,
};

describe('levelProgressSchema / progressSchema', () => {
  it('aceita exatamente o que levelProgress() produz, para qualquer XP', () => {
    for (const xp of [0, 1, 99, 100, 283, 5000, 123_456]) {
      expect(levelProgressSchema.safeParse(levelProgress(xp)).success).toBe(true);
    }
  });

  it('rejeita valores impossíveis', () => {
    const base = levelProgress(60);
    expect(levelProgressSchema.safeParse({ ...base, level: 0 }).success).toBe(false);
    expect(levelProgressSchema.safeParse({ ...base, xp: -1 }).success).toBe(false);
    expect(levelProgressSchema.safeParse({ ...base, progress: 1.2 }).success).toBe(false);
    expect(levelProgressSchema.safeParse({ ...base, progress: -0.1 }).success).toBe(false);
    expect(levelProgressSchema.safeParse({ ...base, xpForNextLevel: 0 }).success).toBe(false);
  });

  it('o progresso por área exige o id da área; o geral traz total e áreas', () => {
    const area = { ...levelProgress(30), areaId: id(3) };
    expect(areaProgressSchema.safeParse(area).success).toBe(true);
    expect(areaProgressSchema.safeParse({ ...area, areaId: 'x' }).success).toBe(false);
    const streak = { current: 2, best: 5, lastFulfilledDate: '2026-10-07', joker };
    expect(
      progressSchema.safeParse({ total: levelProgress(30), areas: [area], streak }).success,
    ).toBe(true);
    expect(progressSchema.safeParse({ total: levelProgress(30), areas: [area] }).success).toBe(
      false,
    );
    expect(progressSchema.safeParse({ total: levelProgress(30), streak }).success).toBe(false);
  });
});

const joker = { weekStart: '2026-10-05', used: false, usedOn: null };

describe('jokerSchema', () => {
  it('aceita disponível e usado (com o dia perdoado)', () => {
    expect(jokerSchema.safeParse(joker).success).toBe(true);
    expect(jokerSchema.safeParse({ ...joker, used: true, usedOn: '2026-10-06' }).success).toBe(
      true,
    );
  });

  it('exige que "usado" e o dia perdoado concordem', () => {
    expect(jokerSchema.safeParse({ ...joker, used: true }).success).toBe(false);
    expect(jokerSchema.safeParse({ ...joker, usedOn: '2026-10-06' }).success).toBe(false);
  });

  it('a semana começa numa segunda-feira válida', () => {
    expect(jokerSchema.safeParse({ ...joker, weekStart: '2026-10-06' }).success).toBe(false);
    expect(jokerSchema.safeParse({ ...joker, weekStart: '2026-02-30' }).success).toBe(false);
  });
});

describe('streakSchema', () => {
  it('aceita streak zerado (sem dia cumprido) e com dia cumprido', () => {
    expect(
      streakSchema.safeParse({ current: 0, best: 0, lastFulfilledDate: null, joker }).success,
    ).toBe(true);
    expect(
      streakSchema.safeParse({ current: 3, best: 3, lastFulfilledDate: '2026-10-07', joker })
        .success,
    ).toBe(true);
    expect(streakSchema.safeParse({ current: 3, best: 3, lastFulfilledDate: null }).success).toBe(
      false,
    );
  });

  it('rejeita negativos, fracionados e data inválida', () => {
    const ok = { current: 1, best: 1, lastFulfilledDate: '2026-10-07', joker };
    expect(streakSchema.safeParse({ ...ok, current: -1 }).success).toBe(false);
    expect(streakSchema.safeParse({ ...ok, best: 1.5 }).success).toBe(false);
    expect(streakSchema.safeParse({ ...ok, lastFulfilledDate: '2026-02-30' }).success).toBe(false);
  });
});

describe('completionSchema', () => {
  it('aceita uma conclusão válida', () => {
    expect(completionSchema.safeParse(completion).success).toBe(true);
  });

  it('rejeita data inválida, instante sem formato ISO e XP negativo', () => {
    expect(
      completionSchema.safeParse({ ...completion, occurrenceDate: '2026-02-30' }).success,
    ).toBe(false);
    expect(completionSchema.safeParse({ ...completion, completedAt: 'ontem' }).success).toBe(false);
    expect(completionSchema.safeParse({ ...completion, xpAmount: -5 }).success).toBe(false);
    expect(completionSchema.safeParse({ ...completion, xpAmount: 1.5 }).success).toBe(false);
  });
});

describe('completionResultSchema / undoResultSchema', () => {
  const result = {
    completion,
    alreadyCompleted: false,
    xpAwarded: 60,
    levelBefore: 1,
    levelAfter: 1,
    total: levelProgress(60),
    area: { ...levelProgress(60), areaId: id(3) },
  };

  it('aceita o resultado de uma conclusão', () => {
    expect(completionResultSchema.safeParse(result).success).toBe(true);
    expect(
      completionResultSchema.safeParse({ ...result, alreadyCompleted: true, xpAwarded: 0 }).success,
    ).toBe(true);
  });

  it('o bônus da quest é opcional na entrada (padrão 0) e nunca negativo', () => {
    expect(completionResultSchema.parse(result).questBonusXp).toBe(0);
    expect(completionResultSchema.parse({ ...result, questBonusXp: 120 }).questBonusXp).toBe(120);
    expect(completionResultSchema.safeParse({ ...result, questBonusXp: -1 }).success).toBe(false);
    expect(completionResultSchema.safeParse({ ...result, questBonusXp: 1.5 }).success).toBe(false);
    const undo = { xpReverted: 60, total: levelProgress(0), area: null };
    expect(undoResultSchema.parse(undo).questBonusReverted).toBe(0);
    expect(undoResultSchema.parse({ ...undo, questBonusReverted: 120 }).questBonusReverted).toBe(
      120,
    );
    expect(undoResultSchema.safeParse({ ...undo, questBonusReverted: -5 }).success).toBe(false);
  });

  it('rejeita resultado sem os campos que a tela usa para comemorar o nível', () => {
    const { levelAfter: _ignored, ...withoutLevelAfter } = result;
    void _ignored;
    expect(completionResultSchema.safeParse(withoutLevelAfter).success).toBe(false);
    expect(completionResultSchema.safeParse({ ...result, xpAwarded: -1 }).success).toBe(false);
  });

  it('o estorno devolve XP positivo e a área pode ser nula', () => {
    const undo = { xpReverted: 60, total: levelProgress(0), area: null };
    expect(undoResultSchema.safeParse(undo).success).toBe(true);
    expect(undoResultSchema.safeParse({ ...undo, xpReverted: -60 }).success).toBe(false);
  });
});

describe('estado da ocorrência e tela Hoje', () => {
  const item = {
    ...occurrence,
    status: 'open' as const,
    opensAt: '2026-10-07T12:00:00.000Z',
    closesAt: '2026-10-09T02:59:59.000Z',
    xpPreview: 60,
    completion: null,
  };

  it('conhece os cinco estados', () => {
    for (const status of ['upcoming', 'open', 'completed', 'closed', 'skipped']) {
      expect(occurrenceStatusSchema.safeParse(status).success).toBe(true);
    }
    expect(occurrenceStatusSchema.safeParse('late').success).toBe(false);
  });

  it('um item de hoje aceita conclusão nula ou preenchida', () => {
    expect(todayItemSchema.safeParse(item).success).toBe(true);
    expect(todayItemSchema.safeParse({ ...item, status: 'completed', completion }).success).toBe(
      true,
    );
    expect(todayItemSchema.safeParse({ ...item, status: 'atrasado' }).success).toBe(false);
    expect(todayItemSchema.safeParse({ ...item, xpPreview: -1 }).success).toBe(false);
  });

  it('a resposta de hoje traz a data, os itens, o XP do dia e o nível', () => {
    const response = { date: '2026-10-07', items: [item], xpToday: 60, total: levelProgress(60) };
    expect(todayResponseSchema.safeParse(response).success).toBe(true);
    expect(todayResponseSchema.safeParse({ ...response, date: 'hoje' }).success).toBe(false);
    expect(todayResponseSchema.safeParse({ ...response, xpToday: 1.5 }).success).toBe(false);
  });

  it('o XP do dia pode ser negativo (um estorno de conclusão feita ontem)', () => {
    const response = { date: '2026-10-07', items: [], xpToday: -40, total: levelProgress(20) };
    expect(todayResponseSchema.safeParse(response).success).toBe(true);
  });
});

describe('weekResponseSchema com conclusões', () => {
  const week = { weekStart: '2026-10-05', weekEnd: '2026-10-11', occurrences: [occurrence] };

  it('continua aceitando respostas sem `completions` (padrão: lista vazia)', () => {
    const parsed = weekResponseSchema.parse(week);
    expect(parsed.completions).toEqual([]);
  });

  it('traz as conclusões quando existem e rejeita as inválidas', () => {
    expect(
      weekResponseSchema.parse({ ...week, completions: [completion] }).completions,
    ).toHaveLength(1);
    expect(
      weekResponseSchema.safeParse({ ...week, completions: [{ ...completion, xpAmount: -1 }] })
        .success,
    ).toBe(false);
  });
});
