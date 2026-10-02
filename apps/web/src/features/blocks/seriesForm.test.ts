import { describe, expect, it } from 'vitest';
import {
  createdTitle,
  describeWeekdays,
  firstOccurrence,
  resolveEnd,
  toggleWeekday,
  WEEKDAY_PRESETS,
} from './seriesForm';

describe('toggleWeekday', () => {
  it('liga um dia mantendo a ordem de segunda a domingo', () => {
    expect(toggleWeekday([3], 1)).toEqual([1, 3]);
    expect(toggleWeekday([1, 5], 3)).toEqual([1, 3, 5]);
    expect(toggleWeekday([], 7)).toEqual([7]);
  });

  it('desliga um dia que já estava ligado, e pode esvaziar a lista', () => {
    expect(toggleWeekday([1, 3, 5], 3)).toEqual([1, 5]);
    expect(toggleWeekday([3], 3)).toEqual([]);
  });

  it('nunca repete um dia', () => {
    expect(toggleWeekday([1, 1, 3], 5)).toEqual([1, 3, 5]);
  });

  it('não altera a lista recebida', () => {
    const original = [1, 3];
    toggleWeekday(original, 5);
    expect(original).toEqual([1, 3]);
  });
});

describe('WEEKDAY_PRESETS', () => {
  it('dias úteis são segunda a sexta; todos os dias são os sete', () => {
    expect(WEEKDAY_PRESETS.workdays).toEqual([1, 2, 3, 4, 5]);
    expect(WEEKDAY_PRESETS.everyday).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('describeWeekdays', () => {
  it('um dia: "Toda quarta-feira", e no masculino para fim de semana', () => {
    expect(describeWeekdays([1])).toBe('Toda segunda-feira');
    expect(describeWeekdays([3])).toBe('Toda quarta-feira');
    expect(describeWeekdays([5])).toBe('Toda sexta-feira');
    expect(describeWeekdays([6])).toBe('Todo sábado');
    expect(describeWeekdays([7])).toBe('Todo domingo');
  });

  it('três ou mais dias seguidos viram um intervalo', () => {
    expect(describeWeekdays([1, 2, 3, 4, 5])).toBe('De segunda a sexta');
    expect(describeWeekdays([2, 3, 4])).toBe('De terça a quinta');
    expect(describeWeekdays([5, 6, 7])).toBe('De sexta a domingo');
  });

  it('todos os dias', () => {
    expect(describeWeekdays([1, 2, 3, 4, 5, 6, 7])).toBe('Todos os dias');
  });

  it('dois dias, ou dias soltos, são listados', () => {
    expect(describeWeekdays([1, 3])).toBe('Toda semana: segunda e quarta');
    expect(describeWeekdays([6, 7])).toBe('Toda semana: sábado e domingo');
    expect(describeWeekdays([1, 3, 5])).toBe('Toda semana: segunda, quarta e sexta');
    expect(describeWeekdays([1, 2, 4, 5])).toBe('Toda semana: segunda, terça, quinta e sexta');
  });

  it('ignora a ordem e a repetição da entrada', () => {
    expect(describeWeekdays([5, 1, 3, 3])).toBe('Toda semana: segunda, quarta e sexta');
  });

  it('sem dias devolve nulo', () => {
    expect(describeWeekdays([])).toBeNull();
  });
});

describe('firstOccurrence', () => {
  // 2026-10-07 é quarta-feira
  it('é a ocorrência mais cedo entre os dias marcados, em ou depois da data de início', () => {
    expect(firstOccurrence('2026-10-07', [3])).toBe('2026-10-07');
    expect(firstOccurrence('2026-10-07', [5])).toBe('2026-10-09');
    expect(firstOccurrence('2026-10-07', [1])).toBe('2026-10-12');
    expect(firstOccurrence('2026-10-07', [1, 5])).toBe('2026-10-09');
    expect(firstOccurrence('2026-10-07', [1, 3, 5])).toBe('2026-10-07');
  });

  it('atravessa virada de mês e de ano', () => {
    expect(firstOccurrence('2026-12-30', [1])).toBe('2027-01-04');
    expect(firstOccurrence('2026-09-29', [5, 6])).toBe('2026-10-02');
  });

  it('sem dias, ou com data inválida, devolve nulo (sem lançar erro)', () => {
    expect(firstOccurrence('2026-10-07', [])).toBeNull();
    expect(firstOccurrence('', [1])).toBeNull();
    expect(firstOccurrence('2026-02-30', [1])).toBeNull();
  });
});

describe('resolveEnd', () => {
  const never = { mode: 'never', until: '', weeks: NaN } as const;

  it('"Sem fim" não envia nada', () => {
    expect(resolveEnd(never, '2026-10-07')).toEqual({ ok: true, validUntil: undefined });
    expect(resolveEnd({ ...never, until: '2026-11-01', weeks: 4 }, '2026-10-07')).toEqual({
      ok: true,
      validUntil: undefined,
    });
  });

  it('"Até uma data" usa a data digitada, e exige que ela exista', () => {
    expect(resolveEnd({ mode: 'until', until: '2026-11-25', weeks: NaN }, '2026-10-07')).toEqual({
      ok: true,
      validUntil: '2026-11-25',
    });
    for (const until of ['', '2026-02-30', 'amanhã']) {
      expect(resolveEnd({ mode: 'until', until, weeks: 8 }, '2026-10-07')).toEqual({
        ok: false,
        field: 'endDate',
        message: 'Informe a data final',
      });
    }
  });

  it('"Por semanas" converte N semanas em N*7 dias corridos a partir do início', () => {
    const weeks = (n: number, from = '2026-10-07') =>
      resolveEnd({ mode: 'weeks', until: '', weeks: n }, from);
    expect(weeks(1)).toEqual({ ok: true, validUntil: '2026-10-13' });
    expect(weeks(4)).toEqual({ ok: true, validUntil: '2026-11-03' });
    expect(weeks(8, '2026-10-05')).toEqual({ ok: true, validUntil: '2026-11-29' });
    expect(weeks(104)).toEqual({ ok: true, validUntil: '2028-10-03' });
  });

  it('"Por semanas" só aceita inteiros de 1 a 104', () => {
    for (const weeks of [0, -1, 105, 2.5, NaN, Infinity]) {
      expect(resolveEnd({ mode: 'weeks', until: '', weeks }, '2026-10-07')).toEqual({
        ok: false,
        field: 'endWeeks',
        message: 'Informe de 1 a 104 semanas',
      });
    }
  });

  it('"Por semanas" com início inválido não lança: o erro fica no campo da data', () => {
    expect(resolveEnd({ mode: 'weeks', until: '', weeks: 4 }, '')).toEqual({
      ok: true,
      validUntil: undefined,
    });
  });
});

describe('createdTitle', () => {
  it('singular e plural', () => {
    expect(createdTitle(1)).toBe('Bloco criado');
    expect(createdTitle(2)).toBe('2 blocos criados');
    expect(createdTitle(7)).toBe('7 blocos criados');
  });
});
