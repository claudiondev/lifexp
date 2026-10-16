import type { Completion, Occurrence } from '@lifexp/shared';
import { describe, expect, it } from 'vitest';
import { toOccurrenceDisplays } from './occurrenceDisplays';

const occurrence = (over: Partial<Occurrence> = {}): Occurrence => ({
  blockId: 'block-1',
  occurrenceDate: '2026-10-07',
  date: '2026-10-07',
  startTime: '09:00',
  durationMin: 60,
  activityId: 'act-1',
  areaId: 'area-1',
  goalId: null,
  note: null,
  recurrence: 'once',
  skipped: false,
  modified: false,
  ...over,
});
const completion = (over: Partial<Completion> = {}) =>
  ({ blockId: 'block-1', occurrenceDate: '2026-10-07', xpAmount: 60, ...over }) as Completion;

const activities = [{ id: 'act-1', name: 'Estudar' }];
const areas = [{ id: 'area-1', name: 'Estudo', color: 'violet', icon: 'book-open' }] as const;

describe('toOccurrenceDisplays', () => {
  it('liga nome da atividade, nome, cor e ícone da área', () => {
    const [item] = toOccurrenceDisplays(
      { occurrences: [occurrence()], completions: [] },
      activities,
      areas,
    );
    expect(item).toMatchObject({
      activityName: 'Estudar',
      areaName: 'Estudo',
      areaColor: 'violet',
      areaIcon: 'book-open',
    });
    expect(item!.completion).toBeUndefined();
  });

  it('liga a conclusão pela data ORIGINAL, mesmo se o bloco foi movido de dia', () => {
    const moved = occurrence({ occurrenceDate: '2026-10-07', date: '2026-10-08', modified: true });
    const [item] = toOccurrenceDisplays(
      { occurrences: [moved], completions: [completion({ occurrenceDate: '2026-10-07' })] },
      activities,
      areas,
    );
    expect(item!.completion?.xpAmount).toBe(60);
  });

  it('conclusão de outro bloco ou de outra data não gruda', () => {
    const [item] = toOccurrenceDisplays(
      {
        occurrences: [occurrence()],
        completions: [
          completion({ blockId: 'outro' }),
          completion({ occurrenceDate: '2026-10-14' }),
        ],
      },
      activities,
      areas,
    );
    expect(item!.completion).toBeUndefined();
  });

  it('atividade ou área que sumiram da lista viram valores neutros, sem esconder o bloco', () => {
    const [item] = toOccurrenceDisplays({ occurrences: [occurrence()], completions: [] }, [], []);
    expect(item).toMatchObject({
      activityName: 'Atividade',
      areaName: 'Área',
      areaColor: 'slate',
      areaIcon: 'star',
    });
  });

  it('sem ocorrências, lista vazia', () => {
    expect(toOccurrenceDisplays({ occurrences: [], completions: [] }, activities, areas)).toEqual(
      [],
    );
  });
});
