import type { Occurrence } from '@lifexp/shared';
import {
  computeWeekOccurrences,
  resolveOccurrence,
  type BlockTemplate,
  type ExceptionRule,
} from './week-occurrences.js';

const ACTIVITY = '0192f1a0-7b3c-7000-8000-0000000000a1';
const AREA = '0192f1a0-7b3c-7000-8000-0000000000b1';

let counter = 0;
const id = () => `0192f1a0-7b3c-7000-8000-${String(++counter).padStart(12, '0')}`;

const weekly = (overrides: Partial<BlockTemplate> = {}): BlockTemplate => ({
  id: id(),
  activityId: ACTIVITY,
  areaId: AREA,
  recurrence: 'weekly',
  weekday: 3, // quarta
  date: null,
  startTime: '09:00',
  durationMin: 60,
  validFrom: '2026-09-01',
  validUntil: null,
  ...overrides,
});

const once = (overrides: Partial<BlockTemplate> = {}): BlockTemplate => ({
  ...weekly(),
  recurrence: 'once',
  weekday: null,
  date: '2026-10-07',
  validFrom: null,
  validUntil: null,
  ...overrides,
});

const skip = (block: BlockTemplate, occurrenceDate: string): ExceptionRule => ({
  blockId: block.id,
  occurrenceDate,
  type: 'skip',
  newDate: null,
  newStartTime: null,
  newDurationMin: null,
});

const override = (
  block: BlockTemplate,
  occurrenceDate: string,
  changes: Partial<ExceptionRule>,
): ExceptionRule => ({
  blockId: block.id,
  occurrenceDate,
  type: 'override',
  newDate: null,
  newStartTime: null,
  newDurationMin: null,
  ...changes,
});

const dates = (occurrences: Occurrence[]) => occurrences.map((o) => o.date);

// 2026-10-05 é segunda; a quarta dessa semana é 2026-10-07.
const WEEK = '2026-10-05';

describe('computeWeekOccurrences: bloco semanal', () => {
  it('aparece só no dia da semana configurado', () => {
    const result = computeWeekOccurrences(WEEK, [weekly({ weekday: 3 })], []);
    expect(dates(result)).toEqual(['2026-10-07']);
    expect(result[0]).toMatchObject({
      occurrenceDate: '2026-10-07',
      startTime: '09:00',
      durationMin: 60,
      activityId: ACTIVITY,
      areaId: AREA,
      recurrence: 'weekly',
      skipped: false,
      modified: false,
    });
  });

  it('cobre os 7 dias da semana, de segunda (1) a domingo (7)', () => {
    for (let weekday = 1; weekday <= 7; weekday++) {
      const result = computeWeekOccurrences(WEEK, [weekly({ weekday })], []);
      expect(result).toHaveLength(1);
      expect(result[0]?.date).toBe(`2026-10-${String(4 + weekday).padStart(2, '0')}`);
    }
  });

  it('repete toda semana, inclusive muito depois (sem fim)', () => {
    const block = weekly({ weekday: 3, validFrom: '2026-09-01', validUntil: null });
    expect(dates(computeWeekOccurrences('2026-10-12', [block], []))).toEqual(['2026-10-14']);
    expect(dates(computeWeekOccurrences('2030-06-03', [block], []))).toEqual(['2030-06-05']);
  });

  it('não aparece antes de validFrom', () => {
    const block = weekly({ weekday: 3, validFrom: '2026-10-14' });
    expect(computeWeekOccurrences(WEEK, [block], [])).toHaveLength(0); // quarta anterior
    expect(dates(computeWeekOccurrences('2026-10-12', [block], []))).toEqual(['2026-10-14']);
  });

  it('validFrom é inclusivo: a própria data de início já conta', () => {
    const block = weekly({ weekday: 3, validFrom: '2026-10-07' });
    expect(dates(computeWeekOccurrences(WEEK, [block], []))).toEqual(['2026-10-07']);
  });

  it('validFrom no meio da semana corta só os dias anteriores a ele', () => {
    const block = weekly({ weekday: 1, validFrom: '2026-10-07' }); // segunda, mas só vale da quarta
    expect(computeWeekOccurrences(WEEK, [block], [])).toHaveLength(0);
    expect(dates(computeWeekOccurrences('2026-10-12', [block], []))).toEqual(['2026-10-12']);
  });

  it('validUntil é inclusivo: a última data ainda conta, a seguinte não', () => {
    const block = weekly({ weekday: 3, validFrom: '2026-09-01', validUntil: '2026-10-07' });
    expect(dates(computeWeekOccurrences(WEEK, [block], []))).toEqual(['2026-10-07']);
    expect(computeWeekOccurrences('2026-10-12', [block], [])).toHaveLength(0);
  });

  it('série encerrada antes de começar (validUntil = validFrom - 1) nunca aparece', () => {
    const block = weekly({ weekday: 3, validFrom: '2026-10-07', validUntil: '2026-10-06' });
    for (const weekStart of ['2026-09-28', WEEK, '2026-10-12', '2027-01-04']) {
      expect(computeWeekOccurrences(weekStart, [block], [])).toHaveLength(0);
    }
  });

  it('não vaza para semanas vizinhas', () => {
    const block = weekly({ weekday: 7 }); // domingo
    expect(dates(computeWeekOccurrences(WEEK, [block], []))).toEqual(['2026-10-11']);
    expect(dates(computeWeekOccurrences('2026-10-12', [block], []))).toEqual(['2026-10-18']);
  });
});

describe('computeWeekOccurrences: bloco avulso', () => {
  it('aparece só na própria data', () => {
    const block = once({ date: '2026-10-07' });
    expect(dates(computeWeekOccurrences(WEEK, [block], []))).toEqual(['2026-10-07']);
    expect(computeWeekOccurrences('2026-10-12', [block], [])).toHaveLength(0);
    expect(computeWeekOccurrences('2026-09-28', [block], [])).toHaveLength(0);
  });

  it('marca a ocorrência como avulsa', () => {
    const [occurrence] = computeWeekOccurrences(WEEK, [once()], []);
    expect(occurrence?.recurrence).toBe('once');
  });
});

describe('computeWeekOccurrences: exceções (RF17, RF49)', () => {
  it('pular mantém a ocorrência na lista, marcada como pulada, sem afetar as outras semanas', () => {
    const block = weekly({ weekday: 3 });
    const exceptions = [skip(block, '2026-10-07')];

    const [skipped] = computeWeekOccurrences(WEEK, [block], exceptions);
    const [nextWeek] = computeWeekOccurrences('2026-10-12', [block], exceptions);

    expect(skipped).toMatchObject({ date: '2026-10-07', skipped: true, modified: false });
    expect(nextWeek).toMatchObject({ date: '2026-10-14', skipped: false });
  });

  it('alterar só o horário', () => {
    const block = weekly({ weekday: 3, startTime: '09:00', durationMin: 60 });
    const [occ] = computeWeekOccurrences(
      WEEK,
      [block],
      [override(block, '2026-10-07', { newStartTime: '14:30' })],
    );
    expect(occ).toMatchObject({
      date: '2026-10-07',
      startTime: '14:30',
      durationMin: 60,
      modified: true,
      skipped: false,
    });
  });

  it('alterar só a duração', () => {
    const block = weekly({ startTime: '09:00', durationMin: 60 });
    const [occ] = computeWeekOccurrences(
      WEEK,
      [block],
      [override(block, '2026-10-07', { newDurationMin: 90 })],
    );
    expect(occ).toMatchObject({ startTime: '09:00', durationMin: 90, modified: true });
  });

  it('mover para outro dia da semana mantém a data original como identidade (RN32)', () => {
    const block = weekly({ weekday: 3 });
    const [occ] = computeWeekOccurrences(
      WEEK,
      [block],
      [
        override(block, '2026-10-07', { newDate: '2026-10-11' }), // quarta -> domingo
      ],
    );
    expect(occ).toMatchObject({
      occurrenceDate: '2026-10-07',
      date: '2026-10-11',
      modified: true,
    });
  });

  it('combina mudança de dia, horário e duração', () => {
    const block = weekly({ weekday: 3 });
    const [occ] = computeWeekOccurrences(
      WEEK,
      [block],
      [
        override(block, '2026-10-07', {
          newDate: '2026-10-09',
          newStartTime: '18:00',
          newDurationMin: 45,
        }),
      ],
    );
    expect(occ).toMatchObject({
      date: '2026-10-09',
      startTime: '18:00',
      durationMin: 45,
      modified: true,
    });
  });

  it('a exceção vale só para a ocorrência da data dela, não para a série', () => {
    const block = weekly({ weekday: 3 });
    const exceptions = [override(block, '2026-10-07', { newStartTime: '14:30' })];
    const [other] = computeWeekOccurrences('2026-10-12', [block], exceptions);
    expect(other).toMatchObject({ startTime: '09:00', modified: false });
  });

  it('exceção de outro bloco não afeta este', () => {
    const a = weekly({ weekday: 3 });
    const b = weekly({ weekday: 3 });
    const result = computeWeekOccurrences(WEEK, [a, b], [skip(a, '2026-10-07')]);
    expect(result.find((o) => o.blockId === a.id)?.skipped).toBe(true);
    expect(result.find((o) => o.blockId === b.id)?.skipped).toBe(false);
  });

  it('exceção órfã (data sem ocorrência na série) é ignorada', () => {
    const block = weekly({ weekday: 3, validFrom: '2026-10-14' });
    const orphans = [
      skip(block, '2026-10-07'), // antes de validFrom
      skip(block, '2026-10-08'), // quinta: a série é de quartas
    ];
    expect(computeWeekOccurrences(WEEK, [block], orphans)).toHaveLength(0);
  });

  it('exceção em série encerrada é ignorada', () => {
    const block = weekly({ weekday: 3, validUntil: '2026-09-30' });
    expect(computeWeekOccurrences(WEEK, [block], [skip(block, '2026-10-07')])).toHaveLength(0);
  });

  it('pular um bloco avulso também funciona', () => {
    const block = once({ date: '2026-10-07' });
    const [occ] = computeWeekOccurrences(WEEK, [block], [skip(block, '2026-10-07')]);
    expect(occ?.skipped).toBe(true);
  });
});

describe('computeWeekOccurrences: vários blocos', () => {
  it('blocos sobrepostos aparecem todos (sobreposição é permitida)', () => {
    const a = weekly({ weekday: 3, startTime: '09:00', durationMin: 120 });
    const b = weekly({ weekday: 3, startTime: '10:00', durationMin: 60 });
    expect(computeWeekOccurrences(WEEK, [a, b], [])).toHaveLength(2);
  });

  it('ordena por data, depois horário, depois id, de forma determinística', () => {
    const late = weekly({ weekday: 3, startTime: '15:00' });
    const early = weekly({ weekday: 3, startTime: '08:00' });
    const monday = weekly({ weekday: 1, startTime: '20:00' });
    const result = computeWeekOccurrences(WEEK, [late, early, monday], []);
    expect(result.map((o) => o.blockId)).toEqual([monday.id, early.id, late.id]);

    const reversed = computeWeekOccurrences(WEEK, [monday, early, late], []);
    expect(reversed).toEqual(result);
  });

  it('mesmo horário: desempata pelo id do bloco', () => {
    const a = weekly({ weekday: 3, startTime: '09:00' });
    const b = weekly({ weekday: 3, startTime: '09:00' });
    const ids = computeWeekOccurrences(WEEK, [b, a], []).map((o) => o.blockId);
    expect(ids).toEqual([a.id, b.id].sort());
  });

  it('mistura semanal e avulso na mesma semana', () => {
    const result = computeWeekOccurrences(
      WEEK,
      [weekly({ weekday: 1 }), once({ date: '2026-10-09' })],
      [],
    );
    expect(result.map((o) => o.recurrence)).toEqual(['weekly', 'once']);
  });

  it('sem blocos, devolve lista vazia', () => {
    expect(computeWeekOccurrences(WEEK, [], [])).toEqual([]);
  });
});

describe('computeWeekOccurrences: calendário', () => {
  it('semana que vira o ano (2026-12-28 a 2027-01-03)', () => {
    const result = computeWeekOccurrences(
      '2026-12-28',
      [weekly({ weekday: 4 }), weekly({ weekday: 7 })],
      [],
    );
    expect(dates(result)).toEqual(['2026-12-31', '2027-01-03']);
  });

  it('semana com fevereiro bissexto (2028-02-28 a 2028-03-05)', () => {
    const result = computeWeekOccurrences(
      '2028-02-28',
      [weekly({ weekday: 2, validFrom: '2028-01-01' })],
      [],
    );
    expect(dates(result)).toEqual(['2028-02-29']);
  });

  it('semana com mudança de horário de verão tem sempre os mesmos 7 dias', () => {
    // 2026-03-08 é o dia em que os EUA adiantam o relógio; a lógica só usa datas civis.
    const all = Array.from({ length: 7 }, (_, index) =>
      weekly({ weekday: index + 1, validFrom: '2026-01-01' }),
    );
    const result = computeWeekOccurrences('2026-03-02', all, []);
    expect(dates(result)).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
    ]);
  });

  it('não muta os dados de entrada', () => {
    const block = weekly();
    const exceptions = [skip(block, '2026-10-07')];
    const before = JSON.stringify({ block, exceptions });
    computeWeekOccurrences(WEEK, [block], exceptions);
    expect(JSON.stringify({ block, exceptions })).toBe(before);
  });
});

describe('resolveOccurrence: os valores efetivos de uma ocorrência', () => {
  const block = { startTime: '09:00', durationMin: 60 };
  const date = '2026-10-07';
  const rule = (overrides: Partial<ExceptionRule>): ExceptionRule => ({
    blockId: 'b',
    occurrenceDate: date,
    type: 'override',
    newDate: null,
    newStartTime: null,
    newDurationMin: null,
    ...overrides,
  });

  it('sem exceção, vale o template', () => {
    expect(resolveOccurrence(block, undefined, date)).toEqual({
      date,
      startTime: '09:00',
      durationMin: 60,
      skipped: false,
      modified: false,
    });
  });

  it('pular marca como pulada e não altera os valores', () => {
    expect(resolveOccurrence(block, rule({ type: 'skip' }), date)).toEqual({
      date,
      startTime: '09:00',
      durationMin: 60,
      skipped: true,
      modified: false,
    });
  });

  it('alterar troca só o que foi informado e marca como alterada', () => {
    expect(resolveOccurrence(block, rule({ newStartTime: '14:30' }), date)).toMatchObject({
      date,
      startTime: '14:30',
      durationMin: 60,
      modified: true,
      skipped: false,
    });
    expect(resolveOccurrence(block, rule({ newDurationMin: 30 }), date)).toMatchObject({
      startTime: '09:00',
      durationMin: 30,
    });
    expect(resolveOccurrence(block, rule({ newDate: '2026-10-09' }), date)).toMatchObject({
      date: '2026-10-09',
      startTime: '09:00',
    });
  });

  it('combina dia, horário e duração', () => {
    expect(
      resolveOccurrence(
        block,
        rule({ newDate: '2026-10-09', newStartTime: '18:00', newDurationMin: 45 }),
        date,
      ),
    ).toEqual({
      date: '2026-10-09',
      startTime: '18:00',
      durationMin: 45,
      skipped: false,
      modified: true,
    });
  });
});

describe('computeWeekOccurrences: meta do bloco (RF19)', () => {
  it('cada ocorrência carrega o goalId do seu bloco; bloco sem meta dá nulo', () => {
    const linked = weekly({ goalId: 'goal-1' });
    const plain = weekly({ startTime: '10:00' });

    const result = computeWeekOccurrences('2026-10-05', [linked, plain], []);

    expect(result.map((o) => [o.blockId, o.goalId])).toEqual([
      [linked.id, 'goal-1'],
      [plain.id, null],
    ]);
  });
});
