import type { Occurrence } from '@lifexp/shared';
import { describe, expect, it } from 'vitest';
import {
  adherence,
  summarizeXp,
  tallyWeek,
  toReportAreas,
  toReportBlocks,
} from './weekly-report.js';

// Semana de 2026-10-05 (segunda) a 2026-10-11. Hoje = quarta 2026-10-07: fechados até segunda (05).
const WEEK = '2026-10-05';
const TODAY = '2026-10-07';
let seq = 0;
const occ = (date: string, over: Partial<Occurrence> = {}): Occurrence => ({
  blockId: `b${seq++}`,
  occurrenceDate: date,
  date,
  startTime: '09:00',
  durationMin: 60,
  activityId: 'a',
  areaId: 'A',
  goalId: null,
  note: null,
  recurrence: 'once',
  skipped: false,
  modified: false,
  ...over,
});
const done = (...list: Occurrence[]) =>
  new Set(list.map((o) => `${o.blockId}|${o.occurrenceDate}`));

describe('adherence', () => {
  it('arredonda para o inteiro mais próximo e é nula sem blocos', () => {
    expect(adherence(3, 2)).toBe(67);
    expect(adherence(3, 1)).toBe(33);
    expect(adherence(8, 1)).toBe(13);
    expect(adherence(0, 0)).toBeNull();
    expect(adherence(4, 4)).toBe(100);
  });
});

describe('tallyWeek', () => {
  it('conta planejados (fechados), concluídos, pulados e em aberto', () => {
    const closedDone = occ('2026-10-05');
    const closedMissed = occ('2026-10-05');
    const skipped = occ('2026-10-05', { skipped: true });
    const openYesterday = occ('2026-10-06');
    const openToday = occ('2026-10-07');
    const future = occ('2026-10-09');
    const { total } = tallyWeek(
      [closedDone, closedMissed, skipped, openYesterday, openToday, future],
      done(closedDone),
      WEEK,
      TODAY,
    );
    expect(total).toEqual({ planned: 2, completed: 1, skipped: 1, open: 2, minutes: 60 });
    expect(toReportBlocks(total)).toEqual({
      planned: 2,
      completed: 1,
      skipped: 1,
      open: 2,
      adherence: 50,
    });
  });

  it('concluído em aberto já conta como planejado e concluído', () => {
    const today = occ('2026-10-07');
    const { total } = tallyWeek([today], done(today), WEEK, TODAY);
    expect(total).toMatchObject({ planned: 1, completed: 1, open: 0 });
  });

  it('só olha a semana pedida (segunda a domingo)', () => {
    const before = occ('2026-10-04');
    const first = occ('2026-10-05');
    const last = occ('2026-10-11');
    const after = occ('2026-10-12');
    const { total } = tallyWeek(
      [before, first, last, after],
      done(before, first, last, after),
      WEEK,
      '2026-10-20',
    );
    expect(total.completed).toBe(2);
  });

  it('semana inteira no passado: tudo que não foi cumprido fechou', () => {
    const missed = occ('2026-10-11');
    const { total } = tallyWeek([missed], done(), WEEK, '2026-10-20');
    expect(total).toMatchObject({ planned: 1, completed: 0, open: 0 });
  });

  it('soma os minutos só dos blocos cumpridos, por área e no total', () => {
    const a = occ('2026-10-05', { durationMin: 90, areaId: 'A' });
    const b = occ('2026-10-05', { durationMin: 30, areaId: 'B' });
    const missed = occ('2026-10-05', { durationMin: 600, areaId: 'A' });
    const { total, byArea } = tallyWeek([a, b, missed], done(a, b), WEEK, TODAY);
    expect(total.minutes).toBe(120);
    expect(byArea.get('A')).toMatchObject({ minutes: 90, planned: 2, completed: 1 });
    expect(byArea.get('B')).toMatchObject({ minutes: 30, planned: 1, completed: 1 });
  });

  it('a conclusão se liga pela data ORIGINAL, mesmo com a ocorrência movida de dia', () => {
    const moved = occ('2026-10-06', { occurrenceDate: '2026-10-05', modified: true });
    const { total, bestDay } = tallyWeek(
      [moved],
      new Set([`${moved.blockId}|2026-10-05`]),
      WEEK,
      TODAY,
    );
    expect(total.completed).toBe(1);
    expect(bestDay).toEqual({ date: '2026-10-06', completed: 1 });
  });

  it('o melhor dia é o com mais blocos cumpridos; empate fica com o mais cedo; nada cumprido = nulo', () => {
    const a1 = occ('2026-10-06');
    const a2 = occ('2026-10-06');
    const b1 = occ('2026-10-05');
    const b2 = occ('2026-10-05');
    expect(tallyWeek([a1, a2, b1], done(a1, a2, b1), WEEK, TODAY).bestDay).toEqual({
      date: '2026-10-06',
      completed: 2,
    });
    expect(tallyWeek([a1, a2, b1, b2], done(a1, a2, b1, b2), WEEK, TODAY).bestDay).toEqual({
      date: '2026-10-05',
      completed: 2,
    });
    expect(tallyWeek([occ('2026-10-05')], done(), WEEK, TODAY).bestDay).toBeNull();
  });
});

describe('toReportAreas', () => {
  const areas = [
    {
      id: 'A',
      name: 'Saúde',
      color: 'moss' as const,
      icon: 'heart-pulse' as const,
      archived: false,
    },
    { id: 'B', name: 'Estudo', color: 'sky' as const, icon: 'book-open' as const, archived: false },
    { id: 'C', name: 'Antiga', color: 'rose' as const, icon: 'users' as const, archived: true },
    {
      id: 'D',
      name: 'Arquivada com dado',
      color: 'gold' as const,
      icon: 'church' as const,
      archived: true,
    },
  ];

  it('áreas ativas sempre aparecem (sem dados = nota nula); arquivadas só com atividade; ordem mantida', () => {
    const a = occ('2026-10-05', { areaId: 'A' });
    const d = occ('2026-10-05', { areaId: 'D' });
    const { byArea } = tallyWeek([a, d], done(a), WEEK, TODAY);
    const report = toReportAreas(areas, byArea);
    expect(report.map((r) => [r.name, r.planned, r.completed, r.score])).toEqual([
      ['Saúde', 1, 1, 100],
      ['Estudo', 0, 0, null],
      ['Arquivada com dado', 1, 0, 0],
    ]);
  });
});

describe('summarizeXp', () => {
  const areas = [
    { id: 'A', name: 'Saúde' },
    { id: 'B', name: 'Estudo' },
  ];

  it('separa ganhos, estornos e líquido, total e por área', () => {
    const xp = summarizeXp(
      [
        { amount: 100, areaId: 'A' },
        { amount: 60, areaId: 'B' },
        { amount: -60, areaId: 'B' },
        { amount: 30, areaId: 'A' },
        { amount: 120, areaId: null },
      ],
      areas,
    );
    expect(xp).toMatchObject({ gained: 310, reverted: 60, net: 250 });
    expect(xp.byArea).toEqual(
      [
        { areaId: null, name: 'Sem área', amount: 120 },
        { areaId: 'A', name: 'Saúde', amount: 130 },
      ].sort((a, b) => b.amount - a.amount),
    );
  });

  it('área que ficou em zero (ganhou e devolveu) não aparece', () => {
    const xp = summarizeXp(
      [
        { amount: 60, areaId: 'B' },
        { amount: -60, areaId: 'B' },
      ],
      areas,
    );
    expect(xp.byArea).toEqual([]);
    expect(xp).toMatchObject({ gained: 60, reverted: 60, net: 0 });
  });

  it('estorno de semana com XP negativo (só devolveu) fica negativo, e área excluída tem nome neutro', () => {
    const xp = summarizeXp([{ amount: -50, areaId: 'Z' }], areas);
    expect(xp).toMatchObject({ gained: 0, reverted: 50, net: -50 });
    expect(xp.byArea).toEqual([{ areaId: 'Z', name: 'Área excluída', amount: -50 }]);
  });

  it('desempata por nome, em ordem de XP', () => {
    const xp = summarizeXp(
      [
        { amount: 10, areaId: 'B' },
        { amount: 10, areaId: 'A' },
        { amount: 50, areaId: null },
      ],
      areas,
    );
    expect(xp.byArea.map((e) => e.name)).toEqual(['Sem área', 'Estudo', 'Saúde']);
  });

  it('sem lançamentos, tudo zerado', () => {
    expect(summarizeXp([], areas)).toEqual({ gained: 0, reverted: 0, net: 0, byArea: [] });
  });
});
