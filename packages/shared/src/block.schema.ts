import { z } from 'zod';
import { endsSameDay, isWeekStart, type CivilDate } from './civil-date.js';
import { completionSchema } from './completion.schema.js';
import {
  civilDateSchema,
  durationMinSchema,
  timeOfDaySchema,
  weekdaySchema,
} from './primitives.js';

export {
  BLOCK_DURATION_MAX,
  BLOCK_DURATION_MIN,
  BLOCK_DURATION_STEP,
  civilDateSchema,
  durationMinSchema,
  timeOfDaySchema,
  weekdaySchema,
} from './primitives.js';

const SAME_DAY_MESSAGE = 'O bloco não pode atravessar a meia-noite';
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
});

const weeklyBlockSchema = z
  .strictObject({
    recurrence: z.literal('weekly'),
    activityId: z.uuid(),
    goalId: z.uuid().nullish(),
    weekday: weekdaySchema,
    startTime: timeOfDaySchema,
    durationMin: durationMinSchema,
    // A primeira ocorrência é o primeiro `weekday` em ou depois desta data.
    validFrom: civilDateSchema,
  })
  .refine((block) => endsSameDay(block.startTime, block.durationMin), {
    message: SAME_DAY_MESSAGE,
    path: ['durationMin'],
  });

const onceBlockSchema = z
  .strictObject({
    recurrence: z.literal('once'),
    activityId: z.uuid(),
    goalId: z.uuid().nullish(),
    date: civilDateSchema,
    startTime: timeOfDaySchema,
    durationMin: durationMinSchema,
  })
  .refine((block) => endsSameDay(block.startTime, block.durationMin), {
    message: SAME_DAY_MESSAGE,
    path: ['durationMin'],
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
  weekStart: civilDateSchema.refine(isWeekStart, 'A semana começa na segunda-feira'),
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
export type UpdateBlockInput = z.infer<typeof updateBlockSchema>;
export type PutExceptionInput = z.infer<typeof putExceptionSchema>;
export type BlockException = z.infer<typeof blockExceptionSchema>;
export type Occurrence = z.infer<typeof occurrenceSchema>;
export type WeekResponse = z.infer<typeof weekResponseSchema>;
export type { CivilDate };
