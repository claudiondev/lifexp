import { z } from 'zod';
import {
  endsSameDay,
  isValidCivilDate,
  isValidTimeOfDay,
  isWeekStart,
  type CivilDate,
} from './civil-date.js';

export const BLOCK_DURATION_MIN = 15;
export const BLOCK_DURATION_MAX = 720;
export const BLOCK_DURATION_STEP = 5;

export const civilDateSchema = z
  .string()
  .refine(isValidCivilDate, 'Data inválida (use AAAA-MM-DD)');
export const timeOfDaySchema = z.string().refine(isValidTimeOfDay, 'Horário inválido (use HH:mm)');
export const weekdaySchema = z.number().int().min(1).max(7);
export const durationMinSchema = z
  .number()
  .int()
  .min(BLOCK_DURATION_MIN, `A duração mínima é ${BLOCK_DURATION_MIN} minutos`)
  .max(BLOCK_DURATION_MAX, `A duração máxima é ${BLOCK_DURATION_MAX / 60} horas`)
  .multipleOf(BLOCK_DURATION_STEP, `A duração deve ser múltipla de ${BLOCK_DURATION_STEP} minutos`);

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
});

const weeklyBlockSchema = z
  .strictObject({
    recurrence: z.literal('weekly'),
    activityId: z.uuid(),
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
});

export type Block = z.infer<typeof blockSchema>;
export type CreateBlockInput = z.infer<typeof createBlockSchema>;
export type UpdateBlockInput = z.infer<typeof updateBlockSchema>;
export type PutExceptionInput = z.infer<typeof putExceptionSchema>;
export type BlockException = z.infer<typeof blockExceptionSchema>;
export type Occurrence = z.infer<typeof occurrenceSchema>;
export type WeekResponse = z.infer<typeof weekResponseSchema>;
export type { CivilDate };
