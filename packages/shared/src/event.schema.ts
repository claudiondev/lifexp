import { z } from 'zod';
import { addDays, compareCivil, isValidCivilDate, type CivilDate } from './civil-date.js';
import { civilDateSchema, timeOfDaySchema } from './primitives.js';

/** Categorias de evento (RF33). A UI desenha ícone e cor de cada uma. */
export const EVENT_CATEGORIES = [
  'appointment',
  'birthday',
  'medical',
  'trip',
  'deadline',
  'other',
] as const;
export const eventCategorySchema = z.enum(EVENT_CATEGORIES);

/** Antecedência do lembrete (RF36): padrão de 1 dia antes (RN24). Nulo = sem lembrete. */
export const DEFAULT_REMIND_BEFORE_MIN = 1440;
export const REMINDER_MINUTES = [0, 15, 60, 1440, 2880] as const;
/** Evento sem hora ("dia todo") só aceita lembrete em dias: não há horário para antecipar. */
const ALL_DAY_REMINDERS: readonly number[] = [1440, 2880];

export const remindBeforeSchema = z
  .union([z.literal(0), z.literal(15), z.literal(60), z.literal(1440), z.literal(2880)])
  .nullable();

/** O lembrete combina com o evento? (sem hora, só em dias; sem lembrete vale sempre) */
export function isReminderAllowed(time: string | null, remindBeforeMin: number | null): boolean {
  if (remindBeforeMin === null) return true;
  return time !== null || ALL_DAY_REMINDERS.includes(remindBeforeMin);
}

const REMINDER_MESSAGE = 'Evento sem hora só aceita lembrete em dias (1 ou 2 dias antes)';
const titleSchema = z.string().trim().min(1, 'Informe o título do evento').max(120);
const notesSchema = z.string().trim().max(2000);

export const eventSchema = z.object({
  id: z.uuid(),
  areaId: z.uuid().nullable(),
  title: z.string(),
  notes: z.string().nullable(),
  date: civilDateSchema,
  time: timeOfDaySchema.nullable(),
  category: eventCategorySchema,
  remindBeforeMin: remindBeforeSchema,
});

// strictObject: campos desconhecidos viram erro 400 em vez de ignorados (RS07).
export const createEventSchema = z
  .strictObject({
    title: titleSchema,
    notes: notesSchema.nullish(),
    areaId: z.uuid().nullish(),
    date: civilDateSchema,
    time: timeOfDaySchema.nullish(),
    category: eventCategorySchema,
    /** Ausente = padrão (1 dia antes); nulo = sem lembrete. */
    remindBeforeMin: remindBeforeSchema.optional(),
  })
  .refine((value) => isReminderAllowed(value.time ?? null, value.remindBeforeMin ?? null), {
    message: REMINDER_MESSAGE,
    path: ['remindBeforeMin'],
  });

export const updateEventSchema = z
  .strictObject({
    title: titleSchema,
    notes: notesSchema.nullable(),
    areaId: z.uuid().nullable(),
    date: civilDateSchema,
    time: timeOfDaySchema.nullable(),
    category: eventCategorySchema,
    remindBeforeMin: remindBeforeSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para alterar');

const bothValid = (value: { from: string; to: string }) =>
  isValidCivilDate(value.from) && isValidCivilDate(value.to);

/** A visão mensal precisa de um mês inteiro, com folga das semanas vizinhas. */
export const MAX_EVENT_RANGE_DAYS = 93;

export const listEventsQuerySchema = z
  .object({ from: civilDateSchema, to: civilDateSchema })
  // Se uma das datas é inválida o erro dela já foi reportado; as regras de período só valem com as duas.
  .refine((value) => !bothValid(value) || compareCivil(value.from, value.to) <= 0, {
    message: 'O início do período não pode ser depois do fim',
    path: ['to'],
  })
  .refine(
    (value) =>
      !bothValid(value) ||
      compareCivil(value.to, addDays(value.from, MAX_EVENT_RANGE_DAYS - 1)) <= 0,
    {
      message: `O período pode ter no máximo ${MAX_EVENT_RANGE_DAYS} dias`,
      path: ['to'],
    },
  );

export type EventCategory = z.infer<typeof eventCategorySchema>;
export type CalendarEvent = z.infer<typeof eventSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

/**
 * Ordem cronológica: por data; no mesmo dia, "dia todo" primeiro, depois por horário; empate por
 * título (estável entre leituras). Não altera a lista recebida.
 */
export function sortEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (a.date !== b.date) return compareCivil(a.date, b.date);
    if ((a.time === null) !== (b.time === null)) return a.time === null ? -1 : 1;
    return (
      (a.time ?? '').localeCompare(b.time ?? '') ||
      a.title.localeCompare(b.title, 'pt-BR') ||
      a.id.localeCompare(b.id)
    );
  });
}

/** Agrupa os eventos por data civil, cada dia já na ordem de `sortEvents`. */
export function groupEventsByDate(
  events: readonly CalendarEvent[],
): Map<CivilDate, CalendarEvent[]> {
  const groups = new Map<CivilDate, CalendarEvent[]>();
  for (const event of sortEvents(events)) {
    groups.set(event.date, [...(groups.get(event.date) ?? []), event]);
  }
  return groups;
}
