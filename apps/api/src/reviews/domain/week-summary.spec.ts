import {
  adherenceOf,
  completionKey,
  computeWeekSummary,
  isFutureWeek,
  previousWeek,
  weekRangeUtc,
  type PlannedOccurrence,
  type SummaryArea,
} from './week-summary.js';

const HEALTH: SummaryArea = { id: 'a-health', name: 'Saúde', color: 'moss', icon: 'heart-pulse' };
const WORK: SummaryArea = { id: 'a-work', name: 'Trabalho', color: 'violet', icon: 'briefcase' };
const REST: SummaryArea = { id: 'a-rest', name: 'Descanso', color: 'sky', icon: 'moon' };

const occ = (
  n: number,
  areaId: string,
  durationMin = 60,
  over: Partial<PlannedOccurrence> = {},
): PlannedOccurrence => ({
  blockId: `b${n}`,
  occurrenceDate: '2026-10-07',
  areaId,
  durationMin,
  skipped: false,
  ...over,
});
const done = (...list: PlannedOccurrence[]) =>
  new Set(list.map((o) => completionKey(o.blockId, o.occurrenceDate)));

const summarize = (
  occurrences: PlannedOccurrence[],
  completed = new Set<string>(),
  areas = [HEALTH, WORK, REST],
  xp = 0,
) => computeWeekSummary({ weekStart: '2026-10-05', occurrences, completed, areas, xp });

describe('adherenceOf', () => {
  it('cumpridos sobre planejados; sem nada planejado é nulo, não 0%', () => {
    expect(adherenceOf(4, 3)).toBe(0.75);
    expect(adherenceOf(4, 4)).toBe(1);
    expect(adherenceOf(4, 0)).toBe(0);
    expect(adherenceOf(0, 0)).toBeNull();
  });
});

describe('computeWeekSummary', () => {
  it('semana vazia: zeros, aderência nula, nenhuma área', () => {
    expect(summarize([])).toEqual({
      weekStart: '2026-10-05',
      weekEnd: '2026-10-11',
      totals: {
        planned: 0,
        completed: 0,
        plannedMin: 0,
        completedMin: 0,
        skipped: 0,
        adherence: null,
        xp: 0,
      },
      areas: [],
    });
  });

  it('conta planejados e cumpridos, no total e por área, com os minutos', () => {
    const a = occ(1, HEALTH.id, 60);
    const b = occ(2, HEALTH.id, 30);
    const c = occ(3, WORK.id, 120);
    const d = occ(4, WORK.id, 45);
    const summary = summarize([a, b, c, d], done(a, c, d), [HEALTH, WORK, REST], 270);

    expect(summary.totals).toEqual({
      planned: 4,
      completed: 3,
      plannedMin: 255,
      completedMin: 225,
      skipped: 0,
      adherence: 0.75,
      xp: 270,
    });
    expect(summary.areas).toEqual([
      {
        areaId: HEALTH.id,
        name: 'Saúde',
        color: 'moss',
        icon: 'heart-pulse',
        planned: 2,
        completed: 1,
        plannedMin: 90,
        completedMin: 60,
        adherence: 0.5,
      },
      {
        areaId: WORK.id,
        name: 'Trabalho',
        color: 'violet',
        icon: 'briefcase',
        planned: 2,
        completed: 2,
        plannedMin: 165,
        completedMin: 165,
        adherence: 1,
      },
    ]);
  });

  it('ocorrência pulada não é planejada: só aparece em "skipped" e não derruba a aderência (RN11)', () => {
    const a = occ(1, HEALTH.id);
    const skippedOne = occ(2, HEALTH.id, 60, { skipped: true });
    const skippedTwo = occ(3, WORK.id, 60, { skipped: true });
    const summary = summarize([a, skippedOne, skippedTwo], done(a));

    expect(summary.totals).toMatchObject({ planned: 1, completed: 1, skipped: 2, adherence: 1 });
    expect(summary.areas.map((x) => x.areaId)).toEqual([HEALTH.id]); // Trabalho só teve pulados
    expect(summary.areas[0]).toMatchObject({ planned: 1, completed: 1, plannedMin: 60 });
  });

  it('uma semana só de pulados tem aderência nula (nada foi planejado)', () => {
    const summary = summarize([occ(1, HEALTH.id, 60, { skipped: true })]);
    expect(summary.totals).toMatchObject({ planned: 0, skipped: 1, adherence: null });
    expect(summary.areas).toEqual([]);
  });

  it('conclusão de uma ocorrência pulada não conta (não deveria existir, mas nunca infla)', () => {
    const p = occ(1, HEALTH.id, 60, { skipped: true });
    const summary = summarize([p], done(p));
    expect(summary.totals).toMatchObject({ planned: 0, completed: 0 });
  });

  it('a conclusão se liga pela data ORIGINAL: outra ocorrência do mesmo bloco não confunde', () => {
    const monday = occ(1, HEALTH.id, 60, { occurrenceDate: '2026-10-05' });
    const wednesday = occ(1, HEALTH.id, 60, { occurrenceDate: '2026-10-07' });
    const summary = summarize([monday, wednesday], done(wednesday));
    expect(summary.totals).toMatchObject({ planned: 2, completed: 1, adherence: 0.5 });
  });

  it('conclusão de uma ocorrência que não está na semana é ignorada', () => {
    const a = occ(1, HEALTH.id);
    const summary = summarize([a], new Set(['outro:2026-10-07']));
    expect(summary.totals.completed).toBe(0);
  });

  it('mantém a ordem das áreas recebidas e omite as sem nada planejado', () => {
    const summary = summarize([occ(1, WORK.id), occ(2, REST.id)], new Set(), [REST, HEALTH, WORK]);
    expect(summary.areas.map((a) => a.areaId)).toEqual([REST.id, WORK.id]);
  });

  it('a aderência em minutos nunca passa de 100%: cumpridos usam a medida da própria ocorrência', () => {
    const a = occ(1, HEALTH.id, 90);
    const summary = summarize([a], done(a));
    expect(summary.totals.completedMin).toBeLessThanOrEqual(summary.totals.plannedMin);
    expect(summary.areas[0]!.completedMin).toBe(summary.areas[0]!.plannedMin);
  });

  it('ocorrência de uma área desconhecida entra no total, mas não inventa uma área', () => {
    const a = occ(1, 'a-sumiu');
    const summary = summarize([a], done(a));
    expect(summary.totals).toMatchObject({ planned: 1, completed: 1 });
    expect(summary.areas).toEqual([]);
  });

  it('o XP líquido é repassado como veio, inclusive negativo', () => {
    expect(summarize([], new Set(), [], -60).totals.xp).toBe(-60);
  });

  it('não altera as listas recebidas', () => {
    const occurrences = [occ(1, HEALTH.id)];
    const areas = [HEALTH];
    summarize(occurrences, new Set(), areas);
    expect(occurrences).toHaveLength(1);
    expect(areas).toEqual([HEALTH]);
  });

  it('o fim da semana é o domingo, também na virada de mês e de ano', () => {
    const at = (weekStart: string) =>
      computeWeekSummary({ weekStart, occurrences: [], completed: new Set(), areas: [], xp: 0 })
        .weekEnd;
    expect(at('2026-10-05')).toBe('2026-10-11');
    expect(at('2026-09-28')).toBe('2026-10-04');
    expect(at('2026-12-28')).toBe('2027-01-03');
    expect(at('2028-02-28')).toBe('2028-03-05'); // ano bissexto
  });
});

describe('weekRangeUtc', () => {
  it('vai da meia-noite local de segunda à da segunda seguinte, no fuso da pessoa', () => {
    expect(weekRangeUtc('2026-10-05', 'UTC')).toEqual({
      from: new Date('2026-10-05T00:00:00.000Z'),
      to: new Date('2026-10-12T00:00:00.000Z'),
    });
    expect(weekRangeUtc('2026-10-05', 'America/Sao_Paulo')).toEqual({
      from: new Date('2026-10-05T03:00:00.000Z'),
      to: new Date('2026-10-12T03:00:00.000Z'),
    });
  });

  it('fusos extremos: o início em UTC fica no dia anterior ou no mesmo, conforme o fuso', () => {
    expect(weekRangeUtc('2026-10-05', 'Pacific/Kiritimati').from).toEqual(
      new Date('2026-10-04T10:00:00.000Z'),
    );
    expect(weekRangeUtc('2026-10-05', 'America/Los_Angeles').from).toEqual(
      new Date('2026-10-05T07:00:00.000Z'),
    );
  });

  it('a semana do horário de verão tem 167 ou 169 horas, não 168', () => {
    // Los Angeles: o relógio atrasa em 01/11/2026 (semana de 26/10 tem 169 h)
    const fall = weekRangeUtc('2026-10-26', 'America/Los_Angeles');
    expect((fall.to.getTime() - fall.from.getTime()) / 3_600_000).toBe(169);
    // ...e adianta em 08/03/2026 (semana de 02/03 tem 167 h)
    const spring = weekRangeUtc('2026-03-02', 'America/Los_Angeles');
    expect((spring.to.getTime() - spring.from.getTime()) / 3_600_000).toBe(167);
  });

  it('semanas consecutivas se encostam: o fim de uma é o início da outra, sem buraco nem sobreposição', () => {
    const tz = 'America/Los_Angeles';
    expect(weekRangeUtc('2026-10-26', tz).to).toEqual(weekRangeUtc('2026-11-02', tz).from);
  });
});

describe('semanas', () => {
  it('previousWeek volta 7 dias, também na virada de ano', () => {
    expect(previousWeek('2026-10-12')).toBe('2026-10-05');
    expect(previousWeek('2027-01-04')).toBe('2026-12-28');
  });

  it('só a semana atual e as passadas podem ser revisadas', () => {
    expect(isFutureWeek('2026-10-12', '2026-10-05')).toBe(true);
    expect(isFutureWeek('2026-10-05', '2026-10-05')).toBe(false);
    expect(isFutureWeek('2026-09-28', '2026-10-05')).toBe(false);
  });
});
