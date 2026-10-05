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
    expect(computeStreak([], TODAY)).toMatchObject({
      current: 0,
      best: 0,
      lastFulfilledDate: null,
    });
  });

  it('conta dias planejados seguidos em que algo foi cumprido', () => {
    const days = [day('2026-10-04', 2, 1), day('2026-10-05', 1, 1), day('2026-10-06', 3, 3)];
    expect(computeStreak(days, TODAY)).toMatchObject({
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

  it('dois dias planejados perdidos na mesma semana, já com a janela fechada, quebram a sequência', () => {
    const days = [
      day('2026-10-03', 1, 1),
      day('2026-10-04', 1, 1),
      day('2026-10-05', 1, 0), // o coringa da semana perdoa este
      day('2026-10-06', 1, 0), // e este quebra
    ];
    expect(computeStreak(days, TODAY)).toMatchObject({
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
      day('2026-10-01', 1, 0), // perdoado pelo coringa
      day('2026-10-02', 1, 0), // quebra
      day('2026-10-03', 1, 1),
      day('2026-10-04', 1, 1),
    ];
    expect(computeStreak(days, TODAY)).toMatchObject({
      current: 2,
      best: 3,
      lastFulfilledDate: '2026-10-04',
    });
  });

  it('a janela fecha à meia-noite do dia seguinte: só a terça (já fechada) gasta o coringa, a quarta não', () => {
    const base = [day('2026-10-05', 1, 1)];
    // terça (06) é o último dia já fechado em quinta (08): perdida, gasta o coringa
    expect(computeStreak([...base, day('2026-10-06', 1, 0)], TODAY).joker.usedOn).toBe(
      '2026-10-06',
    );
    // quarta (07) ainda dá para concluir até 23:59 de hoje: nada foi gasto
    const open = computeStreak([...base, day('2026-10-07', 1, 0)], TODAY);
    expect(open.joker.used).toBe(false);
    expect(open.current).toBe(1);
  });

  it('hoje ainda sem conclusão não quebra a sequência', () => {
    const days = [day('2026-10-06', 1, 1), day('2026-10-07', 1, 1), day('2026-10-08', 2, 0)];
    expect(computeStreak(days, TODAY)).toMatchObject({
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
    expect(computeStreak(days, TODAY)).toMatchObject({
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
    // o domingo (04) perdido é perdoado pelo coringa: 03 e 05 ficam ligados
    expect(computeStreak(days, TODAY).current).toBe(2);
  });

  it('o recorde nunca é menor que a sequência atual', () => {
    const days = Array.from({ length: 5 }, (_, i) => day(`2026-10-0${i + 1}`, 1, 1));
    const result = computeStreak(days, TODAY);
    expect(result.best).toBeGreaterThanOrEqual(result.current);
  });
});

describe('coringa semanal (RN14)', () => {
  const MON = '2026-10-05';
  const jokerOf = (days: StreakDay[], today = TODAY) => computeStreak(days, today).joker;

  it('perdoa o primeiro dia perdido da semana: a sequência segue, sem avançar', () => {
    const days = [day('2026-10-05', 1, 1), day('2026-10-06', 1, 0), day('2026-10-07', 1, 1)];
    expect(computeStreak(days, TODAY)).toEqual({
      current: 2,
      best: 2,
      lastFulfilledDate: '2026-10-07',
      joker: { weekStart: MON, used: true, usedOn: '2026-10-06' },
    });
  });

  it('só um por semana: o segundo dia perdido da mesma semana quebra', () => {
    const days = [
      day('2026-10-05', 1, 1),
      day('2026-10-06', 1, 0),
      day('2026-10-07', 1, 0),
      day('2026-10-08', 1, 1),
    ];
    // quinta é hoje; quarta (07) ainda está aberta, então nada quebra ainda
    expect(computeStreak(days, TODAY).current).toBe(2);
    // sexta: a quarta fechou sem cumprir e o coringa já foi usado na terça
    expect(computeStreak(days, '2026-10-09')).toMatchObject({ current: 1, best: 1 });
  });

  it('a semana seguinte ganha outro coringa (não acumula, mas renova)', () => {
    const days = [
      day('2026-10-05', 1, 1),
      day('2026-10-06', 1, 0), // coringa da semana de 05/10
      day('2026-10-07', 1, 1),
      day('2026-10-12', 1, 0), // coringa da semana de 12/10
      day('2026-10-13', 1, 1),
    ];
    expect(computeStreak(days, '2026-10-16')).toMatchObject({ current: 3, best: 3 });
  });

  it('semana sem uso não vira dois coringas na seguinte', () => {
    const days = [
      day('2026-10-05', 1, 1),
      day('2026-10-12', 1, 0),
      day('2026-10-13', 1, 0),
      day('2026-10-14', 1, 1),
    ];
    // semana de 05/10 não perdeu nada; na de 12/10 o 1º perdão vale, o 2º quebra
    expect(computeStreak(days, '2026-10-17')).toMatchObject({ current: 1, best: 1 });
  });

  it('só gasta com sequência a proteger: perda com streak zerado não queima o coringa', () => {
    const days = [day('2026-10-05', 1, 0), day('2026-10-06', 1, 1), day('2026-10-07', 1, 0)];
    const result = computeStreak(days, '2026-10-09');
    // segunda perdida sem nada a proteger (quebra "nada"); quarta perdida é perdoada
    expect(result).toMatchObject({ current: 1, best: 1 });
    expect(result.joker.usedOn).toBe('2026-10-07');
  });

  it('domingo e segunda são semanas diferentes', () => {
    const days = [
      day('2026-10-04', 1, 1),
      day('2026-10-05', 1, 1),
      day('2026-10-03', 1, 1),
      day('2026-10-11', 1, 0), // domingo da semana de 05/10
    ];
    expect(computeStreak(days, '2026-10-14')).toMatchObject({ current: 3 });
    const two = [
      day('2026-10-03', 1, 1),
      day('2026-10-04', 1, 0), // domingo da semana de 28/09: coringa dela
      day('2026-10-05', 1, 0), // segunda: coringa da semana de 05/10
      day('2026-10-06', 1, 1),
    ];
    expect(computeStreak(two, '2026-10-09')).toMatchObject({ current: 2 });
  });

  it('o estado é o da semana de hoje: perdão de semana passada não aparece como usado', () => {
    const days = [day('2026-10-05', 1, 1), day('2026-10-06', 1, 0), day('2026-10-07', 1, 1)];
    expect(jokerOf(days, '2026-10-14')).toEqual({
      weekStart: '2026-10-12',
      used: false,
      usedOn: null,
    });
  });

  it('sem nada planejado, o coringa está disponível', () => {
    expect(jokerOf([])).toEqual({ weekStart: MON, used: false, usedOn: null });
  });

  it('dia perdoado não conta como cumprido: o último dia cumprido não muda', () => {
    const days = [day('2026-10-05', 1, 1), day('2026-10-06', 1, 0)];
    expect(computeStreak(days, TODAY).lastFulfilledDate).toBe('2026-10-05');
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
  goalId: null,
  note: null,
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
