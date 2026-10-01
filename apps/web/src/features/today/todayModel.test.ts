import type { TodayItem } from '@lifexp/shared';
import { describe, expect, it } from 'vitest';
import { dayProgress, findNext, itemKey, splitByDay } from './todayModel';

let counter = 0;
function item(overrides: Partial<TodayItem> = {}): TodayItem {
  counter += 1;
  return {
    blockId: `0192f1a0-7b3c-7000-8000-00000000${String(counter).padStart(4, '0')}`,
    occurrenceDate: '2026-10-07',
    date: '2026-10-07',
    startTime: '09:00',
    durationMin: 60,
    activityId: '0192f1a0-7b3c-7000-8000-0000000000a1',
    areaId: '0192f1a0-7b3c-7000-8000-0000000000b1',
    recurrence: 'weekly',
    skipped: false,
    modified: false,
    status: 'open',
    opensAt: '2026-10-07T12:00:00.000Z',
    closesAt: '2026-10-09T02:59:59.999Z',
    xpPreview: 60,
    completion: null,
    ...overrides,
  };
}

describe('splitByDay', () => {
  it('separa os de ontem dos de hoje, cada grupo em ordem cronológica', () => {
    const late = item({ startTime: '18:00' });
    const early = item({ startTime: '07:00' });
    const yesterdayLate = item({
      date: '2026-10-06',
      occurrenceDate: '2026-10-06',
      startTime: '20:00',
    });
    const yesterdayEarly = item({
      date: '2026-10-06',
      occurrenceDate: '2026-10-06',
      startTime: '08:00',
    });

    const result = splitByDay([late, yesterdayLate, early, yesterdayEarly], '2026-10-07');

    expect(result.today).toEqual([early, late]);
    expect(result.carryover).toEqual([yesterdayEarly, yesterdayLate]);
  });

  it('usa a data efetiva (um bloco movido de dia fica no dia novo)', () => {
    const moved = item({ occurrenceDate: '2026-10-05', date: '2026-10-07' });
    expect(splitByDay([moved], '2026-10-07').today).toEqual([moved]);
  });

  it('não altera a lista recebida', () => {
    const items = [item({ startTime: '18:00' }), item({ startTime: '07:00' })];
    const copy = [...items];
    splitByDay(items, '2026-10-07');
    expect(items).toEqual(copy);
  });
});

describe('findNext', () => {
  it('é o primeiro bloco aberto ou que ainda vai começar, pulando os resolvidos', () => {
    const done = item({ status: 'completed', startTime: '07:00' });
    const skipped = item({ status: 'skipped', startTime: '08:00' });
    const closed = item({ status: 'closed', startTime: '08:30' });
    const open = item({ status: 'open', startTime: '09:00' });
    const upcoming = item({ status: 'upcoming', startTime: '15:00' });

    expect(findNext([done, skipped, closed, open, upcoming])).toBe(open);
    expect(findNext([done, skipped, closed, upcoming])).toBe(upcoming);
  });

  it('não existe quando tudo já foi resolvido', () => {
    expect(findNext([item({ status: 'completed' }), item({ status: 'skipped' })])).toBeUndefined();
    expect(findNext([])).toBeUndefined();
  });
});

describe('dayProgress', () => {
  it('conta concluídos sobre o total, sem os pulados (RN11)', () => {
    const items = [
      item({ status: 'completed' }),
      item({ status: 'open' }),
      item({ status: 'closed' }),
      item({ status: 'skipped' }),
    ];
    expect(dayProgress(items)).toEqual({ done: 1, total: 3 });
  });

  it('dia vazio é 0 de 0', () => {
    expect(dayProgress([])).toEqual({ done: 0, total: 0 });
  });
});

describe('itemKey', () => {
  it('identifica pela data ORIGINAL, não pela efetiva', () => {
    const moved = item({ occurrenceDate: '2026-10-05', date: '2026-10-07' });
    expect(itemKey(moved)).toBe(`${moved.blockId}:2026-10-05`);
  });
});
