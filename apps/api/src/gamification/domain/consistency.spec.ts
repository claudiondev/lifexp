import type { Occurrence } from '@lifexp/shared';
import { describe, expect, it } from 'vitest';
import { tallyByArea } from './balance.js';
import { buildConsistencyDays, consistencyStart, tallyByDay } from './consistency.js';

// Hoje = quarta 2026-10-07 (semana de 2026-10-05). Dias fechados (passou a janela): até segunda 2026-10-05.
const TODAY = '2026-10-07';

let seq = 0;
const occ = (date: string, over: Partial<Occurrence> = {}): Occurrence => ({
  blockId: `b${seq++}`,
  occurrenceDate: date,
  date,
  startTime: '09:00',
  durationMin: 60,
  activityId: 'a1',
  areaId: 'area-1',
  goalId: null,
  note: null,
  recurrence: 'once',
  skipped: false,
  modified: false,
  ...over,
});
const done = (...list: Occurrence[]) =>
  new Set(list.map((o) => `${o.blockId}|${o.occurrenceDate}`));

describe('consistencyStart', () => {
  it('é a segunda-feira de (weeks - 1) semanas antes da semana de hoje', () => {
    expect(consistencyStart(TODAY, 1)).toBe('2026-10-05');
    expect(consistencyStart(TODAY, 4)).toBe('2026-09-14');
    expect(consistencyStart(TODAY, 26)).toBe('2026-04-13');
  });

  it('sempre cai numa segunda-feira, em qualquer dia da semana de hoje', () => {
    for (const today of ['2026-10-05', '2026-10-07', '2026-10-11']) {
      expect(consistencyStart(today, 8)).toBe('2026-08-17');
    }
  });

  it('atravessa a virada de ano', () => {
    expect(consistencyStart('2027-01-06', 3)).toBe('2026-12-21');
  });
});

describe('tallyByDay', () => {
  it('conta planejados e concluídos no dia da ocorrência', () => {
    const a = occ('2026-09-30');
    const b = occ('2026-09-30');
    const c = occ('2026-10-01');
    const tally = tallyByDay([a, b, c], done(a), TODAY, '2026-09-14');
    expect(tally.get('2026-09-30')).toEqual({ planned: 2, completed: 1 });
    expect(tally.get('2026-10-01')).toEqual({ planned: 1, completed: 0 });
  });

  it('pular não pune: bloco pulado não conta como planejado', () => {
    const tally = tallyByDay(
      [occ('2026-09-30', { skipped: true })],
      new Set(),
      TODAY,
      '2026-09-14',
    );
    expect(tally.size).toBe(0);
  });

  it('bloco ainda em tempo de ser concluído (hoje e ontem) só entra se foi concluído', () => {
    const open = occ('2026-10-06');
    const finished = occ('2026-10-06');
    const today = occ(TODAY);
    const tally = tallyByDay([open, finished, today], done(finished), TODAY, '2026-09-14');
    expect(tally.get('2026-10-06')).toEqual({ planned: 1, completed: 1 });
    expect(tally.has(TODAY)).toBe(false);
  });

  it('o último dia fechado (segunda) já conta como planejado', () => {
    const tally = tallyByDay([occ('2026-10-05')], new Set(), TODAY, '2026-09-14');
    expect(tally.get('2026-10-05')).toEqual({ planned: 1, completed: 0 });
  });

  it('fora da janela [start, hoje] não conta (nem o futuro nem antes do início)', () => {
    const tally = tallyByDay(
      [occ('2026-09-13'), occ('2026-10-08'), occ('2026-10-20')],
      new Set(),
      TODAY,
      '2026-09-14',
    );
    expect(tally.size).toBe(0);
  });

  it('usa o dia EFETIVO quando a ocorrência foi movida', () => {
    const moved = occ('2026-09-30', { occurrenceDate: '2026-09-29', modified: true });
    const tally = tallyByDay([moved], done(moved), TODAY, '2026-09-14');
    expect(tally.get('2026-09-30')).toEqual({ planned: 1, completed: 1 });
    expect(tally.has('2026-09-29')).toBe(false);
  });

  it('as mesmas regras do radar: o total por dia bate com o total por área', () => {
    const list = [
      occ('2026-09-20'),
      occ('2026-09-21', { areaId: 'area-2' }),
      occ('2026-09-21', { skipped: true }),
      occ('2026-10-06'),
      occ(TODAY),
      occ('2026-10-05', { areaId: 'area-2' }),
    ];
    const completed = done(list[0]!, list[3]!);
    const byDay = [...tallyByDay(list, completed, TODAY, '2026-09-10').values()];
    const byArea = [...tallyByArea(list, completed, TODAY).values()];
    const sum = (rows: { planned: number; completed: number }[], key: 'planned' | 'completed') =>
      rows.reduce((total, row) => total + row[key], 0);
    expect(sum(byDay, 'planned')).toBe(sum(byArea, 'planned'));
    expect(sum(byDay, 'completed')).toBe(sum(byArea, 'completed'));
  });
});

describe('buildConsistencyDays', () => {
  it('um item por dia, de start até hoje, em ordem, com os vazios zerados', () => {
    const days = buildConsistencyDays(
      '2026-10-05',
      TODAY,
      new Map([['2026-10-06', { planned: 2, completed: 1 }]]),
    );
    expect(days).toEqual([
      { date: '2026-10-05', planned: 0, completed: 0 },
      { date: '2026-10-06', planned: 2, completed: 1 },
      { date: '2026-10-07', planned: 0, completed: 0 },
    ]);
  });

  it('atravessa o fim de mês e o ano bissexto', () => {
    const days = buildConsistencyDays('2028-02-27', '2028-03-01', new Map());
    expect(days.map((day) => day.date)).toEqual([
      '2028-02-27',
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
  });
});
