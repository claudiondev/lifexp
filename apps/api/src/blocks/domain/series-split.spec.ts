import { addDays, type CivilDate, type Occurrence } from '@lifexp/shared';
import {
  firstOccurrenceOnOrAfter,
  planDelete,
  planEdit,
  type BlockChanges,
} from './series-split.js';
import {
  computeWeekOccurrences,
  type BlockTemplate,
  type ExceptionRule,
} from './week-occurrences.js';

const ACTIVITY = '0192f1a0-7b3c-7000-8000-0000000000a1';
const OTHER_ACTIVITY = '0192f1a0-7b3c-7000-8000-0000000000a2';
const AREA = '0192f1a0-7b3c-7000-8000-0000000000b1';

// Quartas-feiras: 09-02, 09-09, 09-16, 09-23, 09-30, 10-07, 10-14, 10-21, 10-28, 11-04 ...
const series = (overrides: Partial<BlockTemplate> = {}): BlockTemplate => ({
  id: 'block-old',
  activityId: ACTIVITY,
  areaId: AREA,
  recurrence: 'weekly',
  weekday: 3,
  date: null,
  startTime: '09:00',
  durationMin: 60,
  validFrom: '2026-09-02',
  validUntil: null,
  ...overrides,
});

const single = (overrides: Partial<BlockTemplate> = {}): BlockTemplate =>
  series({ recurrence: 'once', weekday: null, date: '2026-10-07', validFrom: null, ...overrides });

const skip = (blockId: string, occurrenceDate: CivilDate): ExceptionRule => ({
  blockId,
  occurrenceDate,
  type: 'skip',
  newDate: null,
  newStartTime: null,
  newDurationMin: null,
});

const override = (
  blockId: string,
  occurrenceDate: CivilDate,
  changes: Partial<ExceptionRule>,
): ExceptionRule => ({
  blockId,
  occurrenceDate,
  type: 'override',
  newDate: null,
  newStartTime: null,
  newDurationMin: null,
  ...changes,
});

interface World {
  blocks: BlockTemplate[];
  exceptions: ExceptionRule[];
}

/** Aplica o plano como o service fará, para verificar o resultado observável (as ocorrências). */
function applyEdit(
  world: World,
  blockId: string,
  from: CivilDate,
  changes: BlockChanges,
  newId = `block-new-${from}`,
): World {
  const block = world.blocks.find((b) => b.id === blockId) as BlockTemplate;
  const own = world.exceptions.filter((e) => e.blockId === blockId);
  const plan = planEdit(block, from, changes, own);
  if (plan.kind === 'invalid') throw new Error(`plano inválido: ${plan.reason}`);

  const dropped = (rule: ExceptionRule) =>
    rule.blockId === blockId &&
    (plan.kind === 'in-place' || plan.kind === 'split') &&
    plan.dropExceptions.includes(rule.occurrenceDate);

  if (plan.kind === 'in-place') {
    return {
      blocks: world.blocks.map((b) => (b.id === blockId ? { ...b, ...plan.update } : b)),
      exceptions: world.exceptions.filter((rule) => !dropped(rule)),
    };
  }
  if (plan.kind !== 'split') throw new Error('esperado split');

  const created: BlockTemplate = { ...plan.newBlock, id: newId, areaId: block.areaId };
  return {
    blocks: [
      ...world.blocks.map((b) =>
        b.id === blockId ? { ...b, validUntil: plan.closeCurrentAt } : b,
      ),
      created,
    ],
    exceptions: world.exceptions
      .filter((rule) => !dropped(rule))
      .map((rule) =>
        rule.blockId === blockId && plan.moveExceptions.includes(rule.occurrenceDate)
          ? { ...rule, blockId: newId }
          : rule,
      ),
  };
}

function applyDelete(world: World, blockId: string, from: CivilDate): World {
  const block = world.blocks.find((b) => b.id === blockId) as BlockTemplate;
  const plan = planDelete(
    block,
    from,
    world.exceptions.filter((e) => e.blockId === blockId),
  );
  if (plan.kind === 'invalid') throw new Error(`plano inválido: ${plan.reason}`);
  if (plan.kind === 'delete-row') {
    return {
      blocks: world.blocks.filter((b) => b.id !== blockId),
      exceptions: world.exceptions.filter((e) => e.blockId !== blockId),
    };
  }
  return {
    blocks: world.blocks.map((b) => (b.id === blockId ? { ...b, validUntil: plan.validUntil } : b)),
    exceptions: world.exceptions.filter(
      (e) => !(e.blockId === blockId && plan.dropExceptions.includes(e.occurrenceDate)),
    ),
  };
}

/** Todas as ocorrências de 13 semanas (2026-08-31 a 2026-11-29). */
function allOccurrences(world: World): Occurrence[] {
  const weeks = Array.from({ length: 13 }, (_, index) => addDays('2026-08-31', index * 7));
  return weeks.flatMap((week) => computeWeekOccurrences(week, world.blocks, world.exceptions));
}

/** Compara só o que importa para o passado: o que a pessoa vê, não o id interno do bloco. */
const view = (o: Occurrence) =>
  `${o.occurrenceDate}|${o.date}|${o.startTime}|${o.durationMin}|${o.activityId}|${o.skipped}|${o.modified}`;
const before = (occurrences: Occurrence[], from: CivilDate) =>
  occurrences.filter((o) => o.occurrenceDate < from).map(view);
const fromOn = (occurrences: Occurrence[], from: CivilDate) =>
  occurrences.filter((o) => o.occurrenceDate >= from);

describe('firstOccurrenceOnOrAfter', () => {
  it('acha a primeira data no dia da semana pedido, em ou depois da data', () => {
    expect(firstOccurrenceOnOrAfter('2026-10-07', 3)).toBe('2026-10-07'); // já é quarta
    expect(firstOccurrenceOnOrAfter('2026-10-08', 3)).toBe('2026-10-14');
    expect(firstOccurrenceOnOrAfter('2026-10-07', 1)).toBe('2026-10-12'); // próxima segunda
    expect(firstOccurrenceOnOrAfter('2026-10-07', 7)).toBe('2026-10-11');
    expect(firstOccurrenceOnOrAfter('2026-12-30', 5)).toBe('2027-01-01'); // vira o ano
  });
});

describe('planEdit: esta e as próximas (série com passado)', () => {
  const world: World = { blocks: [series()], exceptions: [] };
  const FROM = '2026-10-07';

  it('divide: encerra a série no dia anterior e cria a nova a partir da data', () => {
    const plan = planEdit(series(), FROM, { startTime: '18:00' }, []);
    expect(plan).toMatchObject({
      kind: 'split',
      closeCurrentAt: '2026-10-06',
      newBlock: {
        recurrence: 'weekly',
        weekday: 3,
        startTime: '18:00',
        durationMin: 60,
        validFrom: FROM,
        validUntil: null,
        date: null,
      },
    });
  });

  it('O PASSADO NUNCA MUDA: ocorrências antes da data ficam idênticas', () => {
    const original = allOccurrences(world);
    const edited = allOccurrences(applyEdit(world, 'block-old', FROM, { startTime: '18:00' }));

    expect(before(edited, FROM)).toEqual(before(original, FROM));
    expect(before(edited, FROM).length).toBeGreaterThanOrEqual(5);
  });

  it('a partir da data, todas as ocorrências refletem a mudança, sem perder nem duplicar nenhuma', () => {
    const original = allOccurrences(world);
    const edited = allOccurrences(applyEdit(world, 'block-old', FROM, { startTime: '18:00' }));

    expect(edited).toHaveLength(original.length);
    expect(fromOn(edited, FROM).every((o) => o.startTime === '18:00')).toBe(true);
    expect(fromOn(original, FROM).every((o) => o.startTime === '09:00')).toBe(true);
    expect(fromOn(edited, FROM).map((o) => o.occurrenceDate)).toEqual(
      fromOn(original, FROM).map((o) => o.occurrenceDate),
    );
  });

  it('troca de atividade e de duração também só vale dali em diante', () => {
    const edited = allOccurrences(
      applyEdit(world, 'block-old', FROM, { activityId: OTHER_ACTIVITY, durationMin: 90 }),
    );
    expect(
      fromOn(edited, FROM).every((o) => o.activityId === OTHER_ACTIVITY && o.durationMin === 90),
    ).toBe(true);
    expect(
      edited
        .filter((o) => o.occurrenceDate < FROM)
        .every((o) => o.activityId === ACTIVITY && o.durationMin === 60),
    ).toBe(true);
  });

  it('data de corte que não é o dia da série vale para as próximas ocorrências', () => {
    // 2026-10-08 é quinta: a quarta 10-07 fica como era; muda da 10-14 em diante.
    const edited = allOccurrences(
      applyEdit(world, 'block-old', '2026-10-08', { startTime: '18:00' }),
    );
    expect(edited.find((o) => o.occurrenceDate === '2026-10-07')?.startTime).toBe('09:00');
    expect(edited.find((o) => o.occurrenceDate === '2026-10-14')?.startTime).toBe('18:00');
  });

  it('herda o fim da série; a data de corte pode ser a última ocorrência', () => {
    const bounded = series({ validUntil: '2026-10-28' });
    const plan = planEdit(bounded, '2026-10-28', { startTime: '18:00' }, []);
    expect(plan).toMatchObject({
      kind: 'split',
      newBlock: { validFrom: '2026-10-28', validUntil: '2026-10-28' },
    });

    const edited = allOccurrences(
      applyEdit({ blocks: [bounded], exceptions: [] }, 'block-old', '2026-10-21', {
        startTime: '18:00',
      }),
    );
    expect(edited.filter((o) => o.startTime === '18:00').map((o) => o.occurrenceDate)).toEqual([
      '2026-10-21',
      '2026-10-28',
    ]);
    expect(edited.find((o) => o.occurrenceDate === '2026-11-04')).toBeUndefined();
  });

  it('data de corte depois do fim da série é inválida', () => {
    const bounded = series({ validUntil: '2026-10-28' });
    expect(planEdit(bounded, '2026-11-04', { startTime: '18:00' }, [])).toEqual({
      kind: 'invalid',
      reason: 'FROM_AFTER_END',
    });
  });

  it('mudar o dia da semana: a nova série começa no primeiro novo dia em ou depois da data', () => {
    const edited = allOccurrences(applyEdit(world, 'block-old', FROM, { weekday: 1 })); // segunda
    expect(before(edited, FROM)).toEqual(before(allOccurrences(world), FROM));
    expect(
      fromOn(edited, FROM)
        .map((o) => o.occurrenceDate)
        .slice(0, 3),
    ).toEqual(['2026-10-12', '2026-10-19', '2026-10-26']);
    expect(edited.find((o) => o.occurrenceDate === '2026-10-07')).toBeUndefined();
  });

  it('edições encadeadas preservam cada trecho do histórico', () => {
    let current = world;
    current = applyEdit(current, 'block-old', '2026-10-07', { startTime: '18:00' }, 'block-b');
    current = applyEdit(current, 'block-b', '2026-11-04', { startTime: '07:00' }, 'block-c');
    const occurrences = allOccurrences(current);

    const timeOf = (date: string) => occurrences.find((o) => o.occurrenceDate === date)?.startTime;
    expect(timeOf('2026-09-30')).toBe('09:00');
    expect(timeOf('2026-10-07')).toBe('18:00');
    expect(timeOf('2026-10-28')).toBe('18:00');
    expect(timeOf('2026-11-04')).toBe('07:00');
    expect(timeOf('2026-11-25')).toBe('07:00');
  });
});

describe('planEdit: série sem passado (edita no lugar)', () => {
  it('editar a partir da primeira ocorrência altera a série inteira', () => {
    const world: World = { blocks: [series()], exceptions: [] };
    const plan = planEdit(series(), '2026-09-02', { startTime: '18:00' }, []);
    expect(plan).toMatchObject({
      kind: 'in-place',
      update: { startTime: '18:00', validFrom: '2026-09-02' },
    });

    const edited = allOccurrences(
      applyEdit(world, 'block-old', '2026-09-02', { startTime: '18:00' }),
    );
    expect(edited.every((o) => o.startTime === '18:00')).toBe(true);
    expect(edited[0]?.occurrenceDate).toBe('2026-09-02');
  });

  it('data de corte anterior ao início mantém o início original', () => {
    const plan = planEdit(series(), '2026-08-01', { startTime: '18:00' }, []);
    expect(plan).toMatchObject({ kind: 'in-place', update: { validFrom: '2026-09-02' } });
  });

  it('avança validFrom até a data de corte, para o novo dia da semana não gerar ocorrência anterior a ela', () => {
    // série de quartas que começa numa segunda (08-31): a 1ª ocorrência é 09-02.
    // Editando a partir de 09-02 para segunda, NÃO pode surgir a segunda 08-31 (antes do corte).
    const world: World = { blocks: [series({ validFrom: '2026-08-31' })], exceptions: [] };

    const plan = planEdit(world.blocks[0] as BlockTemplate, '2026-09-02', { weekday: 1 }, []);
    expect(plan).toMatchObject({ kind: 'in-place', update: { validFrom: '2026-09-02' } });

    const edited = allOccurrences(applyEdit(world, 'block-old', '2026-09-02', { weekday: 1 }));
    expect(edited.find((o) => o.occurrenceDate === '2026-08-31')).toBeUndefined();
    expect(edited[0]?.occurrenceDate).toBe('2026-09-07'); // primeira segunda em ou depois de 09-02
  });

  it('no lugar com mudança de dia da semana descarta todas as exceções (perderam o sentido)', () => {
    const exceptions = [skip('block-old', '2026-09-16'), skip('block-old', '2026-10-14')];
    const plan = planEdit(series(), '2026-09-02', { weekday: 1 }, exceptions);
    expect(plan).toMatchObject({ kind: 'in-place', dropExceptions: ['2026-09-16', '2026-10-14'] });
  });

  it('no lugar sem mudar o dia mantém as exceções', () => {
    const exceptions = [skip('block-old', '2026-10-14')];
    const plan = planEdit(series(), '2026-09-02', { startTime: '18:00' }, exceptions);
    expect(plan).toMatchObject({ kind: 'in-place', dropExceptions: [] });
  });
});

describe('planEdit: exceções acompanham a série (split)', () => {
  const exceptions = [
    skip('block-old', '2026-09-16'), // passado
    skip('block-old', '2026-10-14'), // futuro
    override('block-old', '2026-10-21', { newStartTime: '15:00' }), // futuro
  ];
  const world: World = { blocks: [series()], exceptions };

  it('exceções a partir da data vão para a série nova; as anteriores ficam', () => {
    const plan = planEdit(series(), '2026-10-07', { startTime: '18:00' }, exceptions);
    expect(plan).toMatchObject({
      kind: 'split',
      moveExceptions: ['2026-10-14', '2026-10-21'],
      dropExceptions: [],
    });
  });

  it('o que foi pulado no futuro continua pulado, e o override pontual continua valendo', () => {
    const edited = allOccurrences(
      applyEdit(world, 'block-old', '2026-10-07', { startTime: '18:00' }),
    );
    const at = (date: string) => edited.find((o) => o.occurrenceDate === date);

    expect(at('2026-10-14')?.skipped).toBe(true);
    expect(at('2026-10-21')).toMatchObject({ startTime: '15:00', modified: true });
    expect(at('2026-10-28')).toMatchObject({ startTime: '18:00', skipped: false });
  });

  it('o que foi pulado no passado continua pulado', () => {
    const edited = allOccurrences(
      applyEdit(world, 'block-old', '2026-10-07', { startTime: '18:00' }),
    );
    expect(edited.find((o) => o.occurrenceDate === '2026-09-16')?.skipped).toBe(true);
  });

  it('mudar o dia da semana descarta as exceções futuras e preserva as do passado', () => {
    const plan = planEdit(series(), '2026-10-07', { weekday: 1 }, exceptions);
    expect(plan).toMatchObject({
      kind: 'split',
      moveExceptions: [],
      dropExceptions: ['2026-10-14', '2026-10-21'],
    });

    const edited = allOccurrences(applyEdit(world, 'block-old', '2026-10-07', { weekday: 1 }));
    expect(edited.find((o) => o.occurrenceDate === '2026-09-16')?.skipped).toBe(true);
    expect(edited.some((o) => o.skipped && o.occurrenceDate >= '2026-10-07')).toBe(false);
  });
});

describe('planEdit: validações', () => {
  it('rejeita edição sem nenhuma mudança', () => {
    expect(planEdit(series(), '2026-10-07', {}, [])).toEqual({
      kind: 'invalid',
      reason: 'NO_CHANGES',
    });
  });

  it('rejeita o resultado que atravessaria a meia-noite, considerando valores herdados', () => {
    // muda só o horário para 23:30; a duração herdada (60 min) ultrapassaria a meia-noite
    expect(planEdit(series(), '2026-10-07', { startTime: '23:30' }, [])).toEqual({
      kind: 'invalid',
      reason: 'CROSSES_MIDNIGHT',
    });
    // muda só a duração; o horário herdado (09:00) + 14 h passaria de 24:00
    expect(
      planEdit(series({ startTime: '15:00' }), '2026-10-07', { durationMin: 720 }, []),
    ).toEqual({
      kind: 'invalid',
      reason: 'CROSSES_MIDNIGHT',
    });
  });

  it('aceita terminar exatamente à meia-noite', () => {
    expect(planEdit(series(), '2026-10-07', { startTime: '23:00' }, []).kind).toBe('split');
    expect(planEdit(series(), '2026-10-07', { durationMin: 720 }, []).kind).toBe('split'); // 09:00 + 12 h = 21:00
  });
});

describe('planEdit: bloco avulso', () => {
  it('edita no lugar, qualquer que seja a data de corte', () => {
    expect(planEdit(single(), '2026-10-07', { startTime: '18:00' }, [])).toMatchObject({
      kind: 'in-place',
      update: { startTime: '18:00' },
      dropExceptions: [],
    });
  });

  it('mudar a data descarta as exceções (eram da data antiga)', () => {
    const exceptions = [skip('block-old', '2026-10-07')];
    const plan = planEdit(single(), '2026-10-07', { date: '2026-10-09' }, exceptions);
    expect(plan).toMatchObject({
      kind: 'in-place',
      update: { date: '2026-10-09' },
      dropExceptions: ['2026-10-07'],
    });
  });

  it('manter a mesma data mantém as exceções', () => {
    const exceptions = [skip('block-old', '2026-10-07')];
    const plan = planEdit(
      single(),
      '2026-10-07',
      { date: '2026-10-07', startTime: '18:00' },
      exceptions,
    );
    expect(plan).toMatchObject({ kind: 'in-place', dropExceptions: [] });
  });

  it('rejeita campo que não se aplica: weekday em avulso e date em semanal', () => {
    expect(planEdit(single(), '2026-10-07', { weekday: 2 }, [])).toEqual({
      kind: 'invalid',
      reason: 'FIELD_NOT_APPLICABLE',
    });
    expect(planEdit(series(), '2026-10-07', { date: '2026-10-09' }, [])).toEqual({
      kind: 'invalid',
      reason: 'FIELD_NOT_APPLICABLE',
    });
  });
});

describe('planDelete', () => {
  const FROM = '2026-10-07';
  const world: World = { blocks: [series()], exceptions: [] };

  it('encerra a série no dia anterior; o passado fica e dali em diante não há mais ocorrências', () => {
    const plan = planDelete(series(), FROM, []);
    expect(plan).toEqual({ kind: 'end-series', validUntil: '2026-10-06', dropExceptions: [] });

    const original = allOccurrences(world);
    const after = allOccurrences(applyDelete(world, 'block-old', FROM));
    expect(before(after, FROM)).toEqual(before(original, FROM));
    expect(fromOn(after, FROM)).toHaveLength(0);
  });

  it('excluir desde a primeira ocorrência encerra a série sem apagar a linha', () => {
    const plan = planDelete(series(), '2026-09-02', []);
    expect(plan).toEqual({ kind: 'end-series', validUntil: '2026-09-01', dropExceptions: [] });
    const after = applyDelete(world, 'block-old', '2026-09-02');
    expect(after.blocks).toHaveLength(1);
    expect(allOccurrences(after)).toHaveLength(0);
  });

  it('data de corte antes do início não passa do limite permitido (validFrom - 1)', () => {
    const plan = planDelete(series(), '2026-08-01', []);
    expect(plan).toEqual({ kind: 'end-series', validUntil: '2026-09-01', dropExceptions: [] });
  });

  it('descarta as exceções a partir da data e mantém as anteriores', () => {
    const exceptions = [skip('block-old', '2026-09-16'), skip('block-old', '2026-10-14')];
    const plan = planDelete(series(), FROM, exceptions);
    expect(plan).toMatchObject({ kind: 'end-series', dropExceptions: ['2026-10-14'] });
  });

  it('data de corte depois do fim da série é inválida', () => {
    expect(planDelete(series({ validUntil: '2026-10-28' }), '2026-11-04', [])).toEqual({
      kind: 'invalid',
      reason: 'FROM_AFTER_END',
    });
  });

  it('bloco avulso é removido', () => {
    expect(planDelete(single(), '2026-10-07', [])).toEqual({ kind: 'delete-row' });
    const after = applyDelete(
      { blocks: [single()], exceptions: [skip('block-old', '2026-10-07')] },
      'block-old',
      '2026-10-07',
    );
    expect(after).toEqual({ blocks: [], exceptions: [] });
  });
});
