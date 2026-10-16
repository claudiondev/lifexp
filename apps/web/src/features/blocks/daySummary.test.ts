import type { Completion, Occurrence } from '@lifexp/shared';
import { describe, expect, it } from 'vitest';
import type { OccurrenceDisplay } from './OccurrenceCard';
import { summarizeDay } from './daySummary';

const DAY = '2026-03-02';

const item = (
  patch: Partial<Occurrence> = {},
  extra: Partial<OccurrenceDisplay> = {},
): OccurrenceDisplay => ({
  occurrence: {
    blockId: '0190f2f0-0000-7000-8000-000000000001',
    activityId: '0190f2f0-0000-7000-8000-000000000002',
    areaId: '0190f2f0-0000-7000-8000-000000000003',
    goalId: null,
    occurrenceDate: DAY,
    date: DAY,
    startTime: '09:00',
    durationMin: 60,
    recurrence: 'once',
    skipped: false,
    modified: false,
    note: null,
    ...patch,
  },
  activityName: 'X',
  areaName: 'Área',
  areaColor: 'violet',
  areaIcon: 'book-open',
  ...extra,
});

const completion = { xpAmount: 10 } as Completion;

describe('summarizeDay', () => {
  it('dia vazio', () => {
    expect(summarizeDay([], DAY)).toEqual({ planned: 0, done: 0, plannedMinutes: 0, areas: [] });
  });

  it('conta blocos, concluídos e minutos planejados', () => {
    const summary = summarizeDay(
      [item({ durationMin: 60 }, { completion }), item({ durationMin: 90 })],
      DAY,
    );
    expect(summary).toMatchObject({ planned: 2, done: 1, plannedMinutes: 150 });
  });

  it('bloco pulado não entra em nada', () => {
    const summary = summarizeDay([item({ skipped: true }), item({ durationMin: 30 })], DAY);
    expect(summary).toMatchObject({ planned: 1, done: 0, plannedMinutes: 30 });
    expect(summary.areas).toEqual([{ color: 'violet', minutes: 30 }]);
  });

  it('só olha o dia pedido (a data efetiva, não a de origem)', () => {
    const moved = item({ occurrenceDate: '2026-03-03', date: DAY });
    const other = item({ date: '2026-03-04' });
    expect(summarizeDay([moved, other], DAY).planned).toBe(1);
  });

  it('soma minutos por cor e ordena do maior para o menor', () => {
    const summary = summarizeDay(
      [
        item({ durationMin: 30 }, { areaColor: 'gold' }),
        item({ durationMin: 60 }, { areaColor: 'violet' }),
        item({ durationMin: 45 }, { areaColor: 'gold' }),
      ],
      DAY,
    );
    expect(summary.areas).toEqual([
      { color: 'gold', minutes: 75 },
      { color: 'violet', minutes: 60 },
    ]);
  });

  it('empate de minutos desempata pela cor, sempre na mesma ordem', () => {
    const a = summarizeDay(
      [item({}, { areaColor: 'violet' }), item({}, { areaColor: 'gold' })],
      DAY,
    );
    const b = summarizeDay(
      [item({}, { areaColor: 'gold' }), item({}, { areaColor: 'violet' })],
      DAY,
    );
    expect(a.areas).toEqual(b.areas);
  });
});
