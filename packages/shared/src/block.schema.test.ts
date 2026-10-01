import { describe, expect, it } from 'vitest';
import {
  createBlockSchema,
  deleteBlockQuerySchema,
  putExceptionSchema,
  updateBlockSchema,
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

  it('delete exige `from` válido', () => {
    expect(deleteBlockQuerySchema.safeParse({ from: '2026-10-07' }).success).toBe(true);
    expect(deleteBlockQuerySchema.safeParse({}).success).toBe(false);
    expect(deleteBlockQuerySchema.safeParse({ from: 'hoje' }).success).toBe(false);
  });
});
