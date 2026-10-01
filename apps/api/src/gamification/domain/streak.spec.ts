import type { Occurrence } from '@lifexp/shared';
import { describe, expect, it } from 'vitest';
import { buildStreakDays, computeStreak, type StreakDay } from './streak.js';

const day = (date: string, planned: number, completed: number): StreakDay => ({
  date,
  planned,
  completed,
});

// Hoje = quinta 2026-10-08. Fechados (janela encerrada): até terça 2026-10-06.
const TODAY = '2026-10-08';

describe('computeStreak', () => {
  it('sem dias planejados é 0, recorde 0 e nenhum dia cumprido', () => {
    expect(computeStreak([], TODAY)).toEqual({ current: 0, best: 0, lastFulfilledDate: null });
  });

  it('conta dias planejados seguidos em que algo foi cumprido', () => {
    const days = [day('2026-10-04', 2, 1), day('2026-10-05', 1, 1), day('2026-10-06', 3, 3)];
    expect(computeStreak(days, TODAY)).toEqual({
      current: 3,
      best: 3,
      lastFulfilledDate: '2026-10-06',
    });
  });

  it('um único bloco cumprido basta, mesmo que os outros do dia não tenham sido', () => {
    expect(computeStreak([day('2026-10-06', 5, 1)], TODAY).current).toBe(1);
  });

  it('dias sem bloco planejado são neutros: não avançam nem quebram (RN13)', () => {
    // sem nada planejado na terça e na quarta
    const days = [day('2026-10-05', 1, 1), day('2026-10-08', 1, 1)];
    expect(computeStreak(days, TODAY).current).toBe(2);
  });

  it('dia planejado perdido, já com a janela fechada, quebra a sequência', () => {
    const days = [day('2026-10-03', 1, 1), day('2026-10-04', 1, 1), day('2026-10-05', 1, 0)];
    expect(computeStreak(days, TODAY)).toEqual({
      current: 0,
      best: 2,
      lastFulfilledDate: '2026-10-04',
    });
  });

  it('depois de quebrar, recomeça do 1 e o recorde é preservado', () => {
    const days = [
      day('2026-09-28', 1, 1),
      day('2026-09-29', 1, 1),
      day('2026-09-30', 1, 1),
      day('2026-10-01', 1, 0), // perdido
      day('2026-10-02', 1, 1),
      day('2026-10-03', 1, 1),
    ];
    expect(computeStreak(days, TODAY)).toEqual({
      current: 2,
      best: 3,
      lastFulfilledDate: '2026-10-03',
    });
  });

  it('a janela fecha à meia-noite do dia seguinte: terça perdida quebra, quarta ainda não', () => {
    const base = [day('2026-10-05', 1, 1)];
    // terça (06) é o último dia já fechado em quinta (08): perdida quebra
    expect(computeStreak([...base, day('2026-10-06', 1, 0)], TODAY).current).toBe(0);
    // quarta (07) ainda dá para concluir até 23:59 de hoje: não quebra
    expect(computeStreak([...base, day('2026-10-07', 1, 0)], TODAY).current).toBe(1);
  });

  it('hoje ainda sem conclusão não quebra a sequência', () => {
    const days = [day('2026-10-06', 1, 1), day('2026-10-07', 1, 1), day('2026-10-08', 2, 0)];
    expect(computeStreak(days, TODAY)).toEqual({
      current: 2,
      best: 2,
      lastFulfilledDate: '2026-10-07',
    });
  });

  it('cumprir hoje avança na hora', () => {
    const days = [day('2026-10-07', 1, 1), day('2026-10-08', 2, 1)];
    expect(computeStreak(days, TODAY).current).toBe(2);
  });

  it('ontem em aberto não quebra, e hoje cumprido soma por cima', () => {
    const days = [day('2026-10-06', 1, 1), day('2026-10-07', 1, 0), day('2026-10-08', 1, 1)];
    expect(computeStreak(days, TODAY).current).toBe(2);
  });

  it('ignora dias futuros e dias sem planejamento', () => {
    const days = [day('2026-10-07', 1, 1), day('2026-10-09', 3, 0), day('2026-10-08', 0, 0)];
    expect(computeStreak(days, TODAY)).toEqual({
      current: 1,
      best: 1,
      lastFulfilledDate: '2026-10-07',
    });
  });

  it('um dia já fechado com 0 planejados (neutro) não quebra a sequência', () => {
    const days = [day('2026-10-04', 1, 1), day('2026-10-05', 0, 0), day('2026-10-06', 1, 1)];
    expect(computeStreak(days, TODAY).current).toBe(2);
  });

  it('não depende da ordem em que os dias chegam', () => {
    const days = [day('2026-10-05', 1, 1), day('2026-10-03', 1, 1), day('2026-10-04', 1, 0)];
    expect(computeStreak(days, TODAY)).toEqual(computeStreak([...days].reverse(), TODAY));
    expect(computeStreak(days, TODAY).current).toBe(1);
  });

  it('o recorde nunca é menor que a sequência atual', () => {
    const days = Array.from({ length: 5 }, (_, i) => day(`2026-10-0${i + 1}`, 1, 1));
    const result = computeStreak(days, TODAY);
    expect(result.best).toBeGreaterThanOrEqual(result.current);
  });
});

const occurrence = (overrides: Partial<Occurrence>): Occurrence => ({
  blockId: 'b1',
  occurrenceDate: '2026-10-05',
  date: '2026-10-05',
  startTime: '09:00',
  durationMin: 60,
  activityId: 'a1',
  areaId: 'r1',
  recurrence: 'weekly',
  skipped: false,
  modified: false,
  ...overrides,
});

describe('buildStreakDays', () => {
  it('conta planejados e concluídos por dia', () => {
    const days = buildStreakDays(
      [
        occurrence({ blockId: 'b1' }),
        occurrence({ blockId: 'b2' }),
        occurrence({ blockId: 'b3', occurrenceDate: '2026-10-06', date: '2026-10-06' }),
      ],
      new Set(['b1|2026-10-05']),
    );
    expect(days).toEqual([
      { date: '2026-10-05', planned: 2, completed: 1 },
      { date: '2026-10-06', planned: 1, completed: 0 },
    ]);
  });

  it('pulados não contam como planejados (um dia só com pulados é neutro)', () => {
    const days = buildStreakDays([occurrence({ skipped: true })], new Set());
    expect(days).toEqual([]);
  });

  it('duas ocorrências movidas para o mesmo dia somam no mesmo dia efetivo', () => {
    const days = buildStreakDays(
      [
        occurrence({ blockId: 'b1', occurrenceDate: '2026-10-05', date: '2026-10-07' }),
        occurrence({ blockId: 'b2', occurrenceDate: '2026-10-06', date: '2026-10-07' }),
      ],
      new Set(),
    );
    expect(days).toEqual([{ date: '2026-10-07', planned: 2, completed: 0 }]);
  });

  it('a ocorrência movida conta no dia efetivo, mas a conclusão vem pela data original', () => {
    const days = buildStreakDays(
      [occurrence({ occurrenceDate: '2026-10-05', date: '2026-10-07', modified: true })],
      new Set(['b1|2026-10-05']),
    );
    expect(days).toEqual([{ date: '2026-10-07', planned: 1, completed: 1 }]);
  });
});
