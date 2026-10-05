import { z } from 'zod';
import {
  addDays,
  endsSameDay,
  firstOccurrenceOnOrAfter,
  isValidCivilDate,
  type CivilDate,
} from './civil-date.js';
import { completionSchema } from './completion.schema.js';
import {
  blockNoteSchema,
  civilDateSchema,
  durationMinSchema,
  timeOfDaySchema,
  weekStartSchema,
  weekdaySchema,
} from './primitives.js';

export {
  BLOCK_DURATION_MAX,
  BLOCK_DURATION_MIN,
  BLOCK_DURATION_STEP,
  BLOCK_NOTE_MAX,
  blockNoteSchema,
  civilDateSchema,
  durationMinSchema,
  timeOfDaySchema,
  weekdaySchema,
} from './primitives.js';

const SAME_DAY_MESSAGE = 'O bloco não pode atravessar a meia-noite';
const UNTIL_BEFORE_START_MESSAGE = 'O fim não pode ser antes do primeiro dia do bloco';
const UNTIL_MISSES_DAYS_MESSAGE =
  'O período termina antes da primeira ocorrência de algum dia marcado';

/** Teto do "por N semanas" (dois anos): evita um fim absurdo por engano. */
export const MAX_SERIES_WEEKS = 104;
export const WEEKDAYS_PER_WEEK = 7;

/**
 * Último dia de uma série que dura `weeks` semanas a partir de `validFrom`. São `weeks * 7` dias
 * corridos, então CADA dia da semana ocorre exatamente `weeks` vezes, qualquer que seja o dia de
 * início (por isso "por 8 semanas" rende 8 ocorrências de cada dia marcado).
 */
export function validUntilForWeeks(validFrom: CivilDate, weeks: number): CivilDate {
  return addDays(validFrom, weeks * 7 - 1);
}

/**
 * Confere o fim de uma série semanal: não pode ser antes do início, e todo dia da semana marcado
 * precisa ocorrer ao menos uma vez no período (senão nasceria um bloco que nunca aparece).
 * Devolve a mensagem de erro, ou nulo se estiver tudo certo. Datas inválidas ficam para os campos
 * (refinamentos do Zod rodam mesmo com campo inválido, e `addDays` lançaria erro).
 */
export function checkSeriesEnd(
  weekdays: readonly number[],
  validFrom: string,
  validUntil: string | undefined,
): string | null {
  if (validUntil === undefined || !isValidCivilDate(validFrom) || !isValidCivilDate(validUntil)) {
    return null;
  }
  if (validUntil < validFrom) return UNTIL_BEFORE_START_MESSAGE;
  const misses = weekdays.some(
    (weekday) =>
      Number.isInteger(weekday) &&
      weekday >= 1 &&
      weekday <= 7 &&
      firstOccurrenceOnOrAfter(validFrom, weekday) > validUntil,
  );
  return misses ? UNTIL_MISSES_DAYS_MESSAGE : null;
}
const NO_CHANGE_MESSAGE = 'Informe ao menos um campo para alterar';

/** Template de bloco (RN31): a recorrência é uma regra, não uma lista de datas. */
export const blockSchema = z.object({
  id: z.uuid(),
  activityId: z.uuid(),
  recurrence: z.enum(['weekly', 'once']),
  weekday: weekdaySchema.nullable(),
  date: civilDateSchema.nullable(),
  startTime: timeOfDaySchema,
  durationMin: z.number().int(),
  validFrom: civilDateSchema.nullable(),
  validUntil: civilDateSchema.nullable(),
  /** Meta a que o bloco serve (RF19); nulo = sem meta. */
  goalId: z.uuid().nullable(),
  /** Anotação livre (até 500 caracteres); nulo = sem anotação. */
  note: z.string().nullable().default(null),
});

const weeklyBlockSchema = z
  .strictObject({
    recurrence: z.literal('weekly'),
    activityId: z.uuid(),
    goalId: z.uuid().nullish(),
    note: blockNoteSchema.nullish(),
    weekday: weekdaySchema,
    startTime: timeOfDaySchema,
    durationMin: durationMinSchema,
    // A primeira ocorrência é o primeiro `weekday` em ou depois desta data.
    validFrom: civilDateSchema,
    /** Última data em que a regra vale; ausente = sem fim. */
    validUntil: civilDateSchema.optional(),
  })
  .refine((block) => endsSameDay(block.startTime, block.durationMin), {
    message: SAME_DAY_MESSAGE,
    path: ['durationMin'],
  })
  .check((ctx) => {
    const { weekday, validFrom, validUntil } = ctx.value;
    const message = checkSeriesEnd([weekday], validFrom, validUntil);
    if (message) {
      ctx.issues.push({ code: 'custom', message, path: ['validUntil'], input: ctx.value });
    }
  });

const onceBlockSchema = z
  .strictObject({
    recurrence: z.literal('once'),
    activityId: z.uuid(),
    goalId: z.uuid().nullish(),
    note: blockNoteSchema.nullish(),
    date: civilDateSchema,
    startTime: timeOfDaySchema,
    durationMin: durationMinSchema,
  })
  .refine((block) => endsSameDay(block.startTime, block.durationMin), {
    message: SAME_DAY_MESSAGE,
    path: ['durationMin'],
  });

/**
 * Vários dias da semana de uma vez (mesmo horário e duração): vira um bloco semanal por dia.
 * Os dias ficam sem repetição e em ordem (segunda a domingo).
 */
export const createWeeklyBlocksSchema = z
  .strictObject({
    activityId: z.uuid(),
    goalId: z.uuid().nullish(),
    note: blockNoteSchema.nullish(),
    weekdays: z
      .array(weekdaySchema)
      .min(1, 'Escolha ao menos um dia da semana')
      .max(WEEKDAYS_PER_WEEK)
      .refine((days) => new Set(days).size === days.length, 'Dias da semana repetidos')
      .transform((days) => [...days].sort((a, b) => a - b)),
    startTime: timeOfDaySchema,
    durationMin: durationMinSchema,
    validFrom: civilDateSchema,
    validUntil: civilDateSchema.optional(),
  })
  .refine((block) => endsSameDay(block.startTime, block.durationMin), {
    message: SAME_DAY_MESSAGE,
    path: ['durationMin'],
  })
  .check((ctx) => {
    const { weekdays, validFrom, validUntil } = ctx.value;
    const message = checkSeriesEnd(weekdays, validFrom, validUntil);
    if (message) {
      ctx.issues.push({ code: 'custom', message, path: ['validUntil'], input: ctx.value });
    }
  });

export const createBlockSchema = z.discriminatedUnion('recurrence', [
  weeklyBlockSchema,
  onceBlockSchema,
]);

/**
 * Edição "a partir de `from`": a série antiga termina no dia anterior e uma nova começa em
 * `from` com as mudanças. O passado nunca é reescrito.
 */
export const updateBlockSchema = z
  .strictObject({
    from: civilDateSchema,
    activityId: z.uuid().optional(),
    /** Nulo desvincula o bloco da meta. */
    goalId: z.uuid().nullable().optional(),
    /** Nulo (ou texto vazio) apaga a anotação; ausente mantém a atual. */
    note: blockNoteSchema.nullable().optional(),
    weekday: weekdaySchema.optional(),
    date: civilDateSchema.optional(),
    startTime: timeOfDaySchema.optional(),
    durationMin: durationMinSchema.optional(),
  })
  .refine(
    (value) => Object.entries(value).some(([key, field]) => key !== 'from' && field !== undefined),
    NO_CHANGE_MESSAGE,
  );

export const deleteBlockQuerySchema = z.object({ from: civilDateSchema });

/** skip = pular a ocorrência; override = alterar só ela (mover é override com newDate). */
export const putExceptionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('skip') }),
  z
    .strictObject({
      type: z.literal('override'),
      newDate: civilDateSchema.optional(),
      newStartTime: timeOfDaySchema.optional(),
      newDurationMin: durationMinSchema.optional(),
    })
    .refine(
      (value) =>
        value.newDate !== undefined ||
        value.newStartTime !== undefined ||
        value.newDurationMin !== undefined,
      NO_CHANGE_MESSAGE,
    ),
]);

export const blockExceptionSchema = z.object({
  blockId: z.uuid(),
  occurrenceDate: civilDateSchema,
  type: z.enum(['skip', 'override']),
  newDate: civilDateSchema.nullable(),
  newStartTime: timeOfDaySchema.nullable(),
  newDurationMin: z.number().int().nullable(),
});

export const weekQuerySchema = z.object({
  weekStart: weekStartSchema,
});

/** Uma ocorrência já calculada: identificada por (blockId, occurrenceDate), conforme RN32. */
export const occurrenceSchema = z.object({
  blockId: z.uuid(),
  /** Data original da ocorrência na série (não muda se ela for movida). */
  occurrenceDate: civilDateSchema,
  /** Data efetiva, depois de uma eventual mudança de dia. */
  date: civilDateSchema,
  startTime: timeOfDaySchema,
  durationMin: z.number().int(),
  activityId: z.uuid(),
  areaId: z.uuid(),
  /** Meta a que o bloco serve (RF19); nulo = sem meta. */
  goalId: z.uuid().nullable(),
  /**
   * Anotação do bloco (a mesma em toda a série); nulo = sem anotação. Respostas de uma API anterior ao campo
   * (front novo, API ainda subindo) chegam sem ele e valem nulo, em vez de derrubar a tela.
   */
  note: z.string().nullable().default(null),
  recurrence: z.enum(['weekly', 'once']),
  skipped: z.boolean(),
  modified: z.boolean(),
});

export const weekResponseSchema = z.object({
  weekStart: civilDateSchema,
  weekEnd: civilDateSchema,
  occurrences: z.array(occurrenceSchema),
  /** Conclusões ativas das ocorrências da semana (ligam-se por blockId + occurrenceDate). */
  completions: z.array(completionSchema).default([]),
});

export type Block = z.infer<typeof blockSchema>;
export type CreateBlockInput = z.infer<typeof createBlockSchema>;
export type CreateWeeklyBlocksInput = z.infer<typeof createWeeklyBlocksSchema>;
export type UpdateBlockInput = z.infer<typeof updateBlockSchema>;
export type PutExceptionInput = z.infer<typeof putExceptionSchema>;
export type BlockException = z.infer<typeof blockExceptionSchema>;
export type Occurrence = z.infer<typeof occurrenceSchema>;
export type WeekResponse = z.infer<typeof weekResponseSchema>;
export type { CivilDate };
