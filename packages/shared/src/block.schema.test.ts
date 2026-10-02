import { describe, expect, it } from 'vitest';
import { addDays, firstOccurrenceOnOrAfter, weekdayOf } from './civil-date.js';
import {
  MAX_SERIES_WEEKS,
  checkSeriesEnd,
  createBlockSchema,
  createWeeklyBlocksSchema,
  deleteBlockQuerySchema,
  putExceptionSchema,
  updateBlockSchema,
  validUntilForWeeks,
  weekQuerySchema,
} from './block.schema.js';

const activityId = '0192f1a0-7b3c-7000-8000-000000000001';
const weekly = {
  recurrence: 'weekly',
  activityId,
  weekday: 3,
  startTime: '09:00',
  durationMin: 60,
  validFrom: '2026-10-07',
} as const;
const once = {
  recurrence: 'once',
  activityId,
  date: '2026-10-07',
  startTime: '09:00',
  durationMin: 60,
} as const;

describe('createBlockSchema', () => {
  it('aceita bloco semanal e bloco avulso válidos', () => {
    expect(createBlockSchema.safeParse(weekly).success).toBe(true);
    expect(createBlockSchema.safeParse(once).success).toBe(true);
  });

  it('exige os campos do tipo certo: semanal precisa de weekday, avulso de date', () => {
    const without = (block: object, field: string) =>
      Object.fromEntries(Object.entries(block).filter(([key]) => key !== field));
    expect(createBlockSchema.safeParse(without(weekly, 'weekday')).success).toBe(false);
    expect(createBlockSchema.safeParse(without(once, 'date')).success).toBe(false);
  });

  it('rejeita campos do outro tipo e campos extras', () => {
    expect(createBlockSchema.safeParse({ ...weekly, date: '2026-10-07' }).success).toBe(false);
    expect(createBlockSchema.safeParse({ ...once, weekday: 3 }).success).toBe(false);
    expect(createBlockSchema.safeParse({ ...weekly, userId: 'outro' }).success).toBe(false);
  });

  it('valida o dia da semana (1 a 7)', () => {
    expect(createBlockSchema.safeParse({ ...weekly, weekday: 0 }).success).toBe(false);
    expect(createBlockSchema.safeParse({ ...weekly, weekday: 8 }).success).toBe(false);
    expect(createBlockSchema.safeParse({ ...weekly, weekday: 7 }).success).toBe(true);
    expect(createBlockSchema.safeParse({ ...weekly, weekday: 1.5 }).success).toBe(false);
  });

  it('valida a duração: 15 min a 12 h, em passos de 5 minutos', () => {
    const make = (durationMin: number) =>
      createBlockSchema.safeParse({ ...weekly, startTime: '06:00', durationMin }).success;
    expect(make(15)).toBe(true);
    expect(make(720)).toBe(true);
    expect(make(10)).toBe(false);
    expect(make(725)).toBe(false);
    expect(make(17)).toBe(false);
    expect(make(0)).toBe(false);
  });

  it('não deixa o bloco atravessar a meia-noite, mas aceita terminar exatamente nela', () => {
    expect(
      createBlockSchema.safeParse({ ...weekly, startTime: '23:00', durationMin: 60 }).success,
    ).toBe(true);
    const crossing = createBlockSchema.safeParse({
      ...weekly,
      startTime: '23:00',
      durationMin: 65,
    });
    expect(crossing.success).toBe(false);
    expect(
      createBlockSchema.safeParse({ ...once, startTime: '22:00', durationMin: 180 }).success,
    ).toBe(false);
  });

  it('rejeita data e horário inválidos', () => {
    expect(createBlockSchema.safeParse({ ...weekly, validFrom: '2026-02-30' }).success).toBe(false);
    expect(createBlockSchema.safeParse({ ...once, date: '07/10/2026' }).success).toBe(false);
    expect(createBlockSchema.safeParse({ ...weekly, startTime: '25:00' }).success).toBe(false);
  });

  it('rejeita atividade que não é UUID', () => {
    expect(createBlockSchema.safeParse({ ...weekly, activityId: 'abc' }).success).toBe(false);
  });
});

describe('updateBlockSchema', () => {
  it('exige `from` e ao menos uma mudança além dele', () => {
    expect(updateBlockSchema.safeParse({ from: '2026-10-07' }).success).toBe(false);
    expect(updateBlockSchema.safeParse({ startTime: '10:00' }).success).toBe(false);
    expect(updateBlockSchema.safeParse({ from: '2026-10-07', startTime: '10:00' }).success).toBe(
      true,
    );
  });

  it('aceita qualquer combinação dos campos editáveis', () => {
    const result = updateBlockSchema.safeParse({
      from: '2026-10-07',
      weekday: 5,
      startTime: '18:30',
      durationMin: 45,
      activityId,
    });
    expect(result.success).toBe(true);
  });

  it('rejeita campos extras (recorrência não muda por aqui)', () => {
    expect(
      updateBlockSchema.safeParse({ from: '2026-10-07', startTime: '10:00', recurrence: 'once' })
        .success,
    ).toBe(false);
  });
});

describe('putExceptionSchema', () => {
  it('aceita pular e rejeita campos de alteração junto com o skip', () => {
    expect(putExceptionSchema.safeParse({ type: 'skip' }).success).toBe(true);
    expect(putExceptionSchema.safeParse({ type: 'skip', newDate: '2026-10-08' }).success).toBe(
      false,
    );
  });

  it('override exige ao menos uma alteração', () => {
    expect(putExceptionSchema.safeParse({ type: 'override' }).success).toBe(false);
    expect(putExceptionSchema.safeParse({ type: 'override', newDate: '2026-10-08' }).success).toBe(
      true,
    );
    expect(putExceptionSchema.safeParse({ type: 'override', newStartTime: '10:00' }).success).toBe(
      true,
    );
    expect(putExceptionSchema.safeParse({ type: 'override', newDurationMin: 30 }).success).toBe(
      true,
    );
  });

  it('valida os valores novos', () => {
    expect(putExceptionSchema.safeParse({ type: 'override', newStartTime: '99:00' }).success).toBe(
      false,
    );
    expect(putExceptionSchema.safeParse({ type: 'override', newDurationMin: 7 }).success).toBe(
      false,
    );
  });

  it('rejeita tipo desconhecido', () => {
    expect(putExceptionSchema.safeParse({ type: 'delete' }).success).toBe(false);
  });
});

describe('consultas', () => {
  it('weekStart precisa ser uma segunda-feira (RN36)', () => {
    expect(weekQuerySchema.safeParse({ weekStart: '2026-09-28' }).success).toBe(true);
    expect(weekQuerySchema.safeParse({ weekStart: '2026-09-29' }).success).toBe(false);
    expect(weekQuerySchema.safeParse({ weekStart: '2026-10-04' }).success).toBe(false);
    expect(weekQuerySchema.safeParse({}).success).toBe(false);
  });

  it('weekStart com data inexistente é recusado SEM lançar erro', () => {
    for (const weekStart of ['2026-02-30', '2026-13-01', 'hoje', '', '2026-1-5']) {
      expect(() => weekQuerySchema.safeParse({ weekStart })).not.toThrow();
      expect(weekQuerySchema.safeParse({ weekStart }).success).toBe(false);
    }
  });

  it('delete exige `from` válido', () => {
    expect(deleteBlockQuerySchema.safeParse({ from: '2026-10-07' }).success).toBe(true);
    expect(deleteBlockQuerySchema.safeParse({}).success).toBe(false);
    expect(deleteBlockQuerySchema.safeParse({ from: 'hoje' }).success).toBe(false);
  });
});

describe('bloco semanal com fim (validUntil)', () => {
  const ok = (input: object) => createBlockSchema.safeParse(input);
  const message = (input: object) => {
    const result = ok(input);
    return result.success ? null : result.error.issues[0]!.message;
  };

  it('o fim é opcional: sem ele a série não termina', () => {
    expect(ok(weekly).success).toBe(true);
    expect(ok({ ...weekly, validUntil: '2026-12-30' }).success).toBe(true);
  });

  it('o fim pode ser o próprio dia da primeira ocorrência (uma única vez)', () => {
    expect(ok({ ...weekly, validUntil: '2026-10-07' }).success).toBe(true);
  });

  it('recusa fim antes do início, e fim antes da primeira ocorrência do dia', () => {
    expect(message({ ...weekly, validUntil: '2026-10-06' })).toBe(
      'O fim não pode ser antes do primeiro dia do bloco',
    );
    // quarta (3) a partir de segunda 05/10 só ocorre em 07/10: terminar em 06/10 deixa a série vazia
    expect(message({ ...weekly, validFrom: '2026-10-05', validUntil: '2026-10-06' })).toBe(
      'O período termina antes da primeira ocorrência de algum dia marcado',
    );
  });

  it('recusa data de fim inválida sem quebrar', () => {
    expect(ok({ ...weekly, validUntil: '2026-02-30' }).success).toBe(false);
    expect(ok({ ...weekly, validUntil: 'amanhã' }).success).toBe(false);
    expect(ok({ ...weekly, validFrom: '2026-13-01', validUntil: '2026-12-01' }).success).toBe(
      false,
    );
  });

  it('bloco avulso não tem fim', () => {
    expect(ok({ ...once, validUntil: '2026-12-30' }).success).toBe(false);
  });
});

describe('createWeeklyBlocksSchema (vários dias de uma vez)', () => {
  const multi = {
    activityId,
    weekdays: [1, 3, 5],
    startTime: '09:00',
    durationMin: 60,
    validFrom: '2026-10-05',
  };
  const parse = (input: object) => createWeeklyBlocksSchema.safeParse(input);
  const firstMessage = (input: object) => {
    const result = parse(input);
    return result.success ? null : result.error.issues[0]!.message;
  };

  it('aceita de 1 a 7 dias e devolve os dias em ordem, de segunda a domingo', () => {
    expect(parse(multi).success).toBe(true);
    expect(parse({ ...multi, weekdays: [3] }).success).toBe(true);
    expect(parse({ ...multi, weekdays: [1, 2, 3, 4, 5, 6, 7] }).success).toBe(true);
    const result = createWeeklyBlocksSchema.parse({ ...multi, weekdays: [5, 1, 3] });
    expect(result.weekdays).toEqual([1, 3, 5]);
  });

  it('exige ao menos um dia, sem repetição e dentro de 1 a 7', () => {
    expect(firstMessage({ ...multi, weekdays: [] })).toBe('Escolha ao menos um dia da semana');
    expect(firstMessage({ ...multi, weekdays: [1, 1] })).toBe('Dias da semana repetidos');
    expect(parse({ ...multi, weekdays: [0] }).success).toBe(false);
    expect(parse({ ...multi, weekdays: [8] }).success).toBe(false);
    expect(parse({ ...multi, weekdays: [1.5] }).success).toBe(false);
    expect(parse({ ...multi, weekdays: [1, 2, 3, 4, 5, 6, 7, 1] }).success).toBe(false);
    expect(parse({ ...multi, weekdays: undefined }).success).toBe(false);
    expect(parse({ ...multi, weekdays: 3 }).success).toBe(false);
  });

  it('usa as mesmas regras de horário e duração do bloco semanal', () => {
    expect(parse({ ...multi, startTime: '23:30', durationMin: 60 }).success).toBe(false);
    expect(parse({ ...multi, startTime: '25:00' }).success).toBe(false);
    expect(parse({ ...multi, durationMin: 10 }).success).toBe(false);
    expect(parse({ ...multi, durationMin: 721 }).success).toBe(false);
    expect(parse({ ...multi, activityId: 'x' }).success).toBe(false);
  });

  it('rejeita campos extras (RS07): weekday no singular, recurrence e userId', () => {
    expect(parse({ ...multi, weekday: 3 }).success).toBe(false);
    expect(parse({ ...multi, recurrence: 'weekly' }).success).toBe(false);
    expect(parse({ ...multi, userId: 'x' }).success).toBe(false);
  });

  it('meta é opcional', () => {
    expect(parse({ ...multi, goalId: activityId }).success).toBe(true);
    expect(parse({ ...multi, goalId: null }).success).toBe(true);
    expect(parse({ ...multi, goalId: 'x' }).success).toBe(false);
  });

  it('fim: valida contra TODOS os dias marcados, não só o primeiro', () => {
    // de segunda 05/10 até quarta 07/10: seg e qua ocorrem; sex (09/10) não
    expect(parse({ ...multi, validUntil: '2026-10-07' }).success).toBe(false);
    expect(firstMessage({ ...multi, validUntil: '2026-10-07' })).toBe(
      'O período termina antes da primeira ocorrência de algum dia marcado',
    );
    expect(parse({ ...multi, validUntil: '2026-10-09' }).success).toBe(true);
    expect(parse({ ...multi, validUntil: '2026-10-04' }).success).toBe(false);
    expect(firstMessage({ ...multi, validUntil: '2026-10-04' })).toBe(
      'O fim não pode ser antes do primeiro dia do bloco',
    );
    expect(parse({ ...multi, validUntil: '2026-02-30' }).success).toBe(false);
  });
});

describe('checkSeriesEnd', () => {
  it('sem fim não há o que conferir', () => {
    expect(checkSeriesEnd([1, 3], '2026-10-05', undefined)).toBeNull();
  });

  it('data inválida fica para o campo (não lança)', () => {
    expect(checkSeriesEnd([1], '2026-13-40', '2026-12-01')).toBeNull();
    expect(checkSeriesEnd([1], '2026-10-05', 'lixo')).toBeNull();
  });

  it('ignora dia da semana fora de 1 a 7 (quem recusa é o campo)', () => {
    expect(checkSeriesEnd([0, 9, 1.5], '2026-10-05', '2026-10-06')).toBeNull();
  });

  it('o fim exatamente na primeira ocorrência de cada dia ainda vale', () => {
    // quarta 07/10 a partir de segunda 05/10
    expect(checkSeriesEnd([3], '2026-10-05', '2026-10-07')).toBeNull();
    expect(checkSeriesEnd([3], '2026-10-05', '2026-10-06')).not.toBeNull();
  });
});

describe('validUntilForWeeks ("por N semanas")', () => {
  it('N semanas são N*7 dias corridos, contando o dia de início', () => {
    expect(validUntilForWeeks('2026-10-05', 1)).toBe('2026-10-11');
    expect(validUntilForWeeks('2026-10-05', 8)).toBe('2026-11-29');
    expect(validUntilForWeeks('2026-10-07', 1)).toBe('2026-10-13');
  });

  it('atravessa virada de mês, de ano e ano bissexto', () => {
    expect(validUntilForWeeks('2026-12-28', 2)).toBe('2027-01-10');
    expect(validUntilForWeeks('2028-02-23', 1)).toBe('2028-02-29');
    expect(validUntilForWeeks('2028-02-23', 2)).toBe('2028-03-07');
  });

  it('cada dia da semana ocorre exatamente N vezes, qualquer que seja o dia de início', () => {
    for (let offset = 0; offset < 7; offset += 1) {
      const from = addDays('2026-10-05', offset);
      for (const weeks of [1, 2, 5, 8]) {
        const until = validUntilForWeeks(from, weeks);
        for (let weekday = 1; weekday <= 7; weekday += 1) {
          let count = 0;
          for (
            let day = firstOccurrenceOnOrAfter(from, weekday);
            day <= until;
            day = addDays(day, 7)
          ) {
            expect(weekdayOf(day)).toBe(weekday);
            count += 1;
          }
          expect(count).toBe(weeks);
        }
      }
    }
  });

  it('o resultado de "N semanas" sempre passa na validação do bloco', () => {
    for (let offset = 0; offset < 7; offset += 1) {
      const validFrom = addDays('2026-10-05', offset);
      const input = {
        activityId,
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        startTime: '09:00',
        durationMin: 60,
        validFrom,
        validUntil: validUntilForWeeks(validFrom, 1),
      };
      expect(createWeeklyBlocksSchema.safeParse(input).success).toBe(true);
    }
  });

  it('o teto é de dois anos', () => {
    expect(MAX_SERIES_WEEKS).toBe(104);
  });
});
