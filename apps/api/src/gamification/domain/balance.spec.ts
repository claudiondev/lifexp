import type { Occurrence } from '@lifexp/shared';
import { describe, expect, it } from 'vitest';
import { balanceScore, balanceWindow, tallyByArea } from './balance.js';

// Hoje = quarta 2026-10-07. Janela: 2026-09-10 a 2026-10-07. Dias fechados: até segunda 2026-10-05.
const TODAY = '2026-10-07';
const SAUDE = 'area-saude';
const LEITURA = 'area-leitura';

let seq = 0;
const occ = (date: string, over: Partial<Occurrence> = {}): Occurrence => ({
  blockId: `b${seq++}`,
  occurrenceDate: date,
  date,
  startTime: '09:00',
  durationMin: 60,
  activityId: 'a1',
  areaId: SAUDE,
  goalId: null,
  note: null,
  recurrence: 'once',
  skipped: false,
  modified: false,
  ...over,
});
const done = (...list: Occurrence[]) =>
  new Set(list.map((o) => `${o.blockId}|${o.occurrenceDate}`));

describe('balanceWindow', () => {
  it('são 28 dias corridos terminando hoje', () => {
    expect(balanceWindow(TODAY)).toEqual({ start: '2026-09-10', end: '2026-10-07' });
  });

  it('atravessa a virada de ano e o ano bissexto', () => {
    expect(balanceWindow('2028-03-01')).toEqual({ start: '2028-02-03', end: '2028-03-01' });
    expect(balanceWindow('2027-01-10')).toEqual({ start: '2026-12-14', end: '2027-01-10' });
  });
});

describe('balanceScore', () => {
  it('arredonda para o inteiro mais próximo e usa nulo sem planejado', () => {
    expect(balanceScore(0, 0)).toBeNull();
    expect(balanceScore(3, 2)).toBe(67);
    expect(balanceScore(3, 1)).toBe(33);
    expect(balanceScore(8, 1)).toBe(13); // 12,5 sobe
    expect(balanceScore(5, 0)).toBe(0);
    expect(balanceScore(5, 5)).toBe(100);
  });
});

describe('tallyByArea', () => {
  it('conta planejados e concluídos por área, em blocos', () => {
    const a = occ('2026-10-01');
    const b = occ('2026-10-02');
    const c = occ('2026-10-03', { areaId: LEITURA });
    const tally = tallyByArea([a, b, c], done(a, c), TODAY);
    expect(tally.get(SAUDE)).toEqual({ planned: 2, completed: 1 });
    expect(tally.get(LEITURA)).toEqual({ planned: 1, completed: 1 });
  });

  it('não olha minutos: um bloco de 15 min vale o mesmo que um de 10 horas (RN42)', () => {
    const curto = occ('2026-10-01', { durationMin: 15, areaId: LEITURA });
    const longo = occ('2026-10-01', { durationMin: 600 });
    const tally = tallyByArea([curto, longo], done(curto, longo), TODAY);
    expect(tally.get(LEITURA)).toEqual({ planned: 1, completed: 1 });
    expect(tally.get(SAUDE)).toEqual({ planned: 1, completed: 1 });
  });

  it('o que foi pulado sai da conta (RN11)', () => {
    const tally = tallyByArea(
      [occ('2026-10-01', { skipped: true }), occ('2026-10-02')],
      done(),
      TODAY,
    );
    expect(tally.get(SAUDE)).toEqual({ planned: 1, completed: 0 });
  });

  it('a janela vai de hoje até 27 dias atrás, inclusive', () => {
    const inside = occ('2026-09-10');
    const outside = occ('2026-09-09');
    const tally = tallyByArea([inside, outside], done(), TODAY);
    expect(tally.get(SAUDE)).toEqual({ planned: 1, completed: 0 });
  });

  it('o que ainda dá tempo de concluir (hoje e ontem) não conta como planejado, a menos que já esteja concluído', () => {
    const ontem = occ('2026-10-06');
    const hoje = occ('2026-10-07');
    expect(tallyByArea([ontem, hoje], done(), TODAY).size).toBe(0);
    const tally = tallyByArea([ontem, hoje], done(ontem, hoje), TODAY);
    expect(tally.get(SAUDE)).toEqual({ planned: 2, completed: 2 });
  });

  it('segunda (a janela já fechou) conta como planejada e perdida', () => {
    expect(tallyByArea([occ('2026-10-05')], done(), TODAY).get(SAUDE)).toEqual({
      planned: 1,
      completed: 0,
    });
  });

  it('dias futuros ficam de fora, mesmo que apareçam como concluídos', () => {
    const future = occ('2026-10-08');
    expect(tallyByArea([future], done(), TODAY).size).toBe(0);
    expect(tallyByArea([future], done(future), TODAY).size).toBe(0);
  });

  it('uma ocorrência movida conta no dia para onde foi', () => {
    // era de 2026-09-05 (fora da janela), foi movida para 2026-09-20 (dentro)
    const moved = occ('2026-09-20', { occurrenceDate: '2026-09-05', modified: true });
    expect(tallyByArea([moved], done(moved), TODAY).get(SAUDE)).toEqual({
      planned: 1,
      completed: 1,
    });
  });

  it('sem ocorrências, nada a contar', () => {
    expect(tallyByArea([], done(), TODAY).size).toBe(0);
  });
});
