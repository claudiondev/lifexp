import {
  eventSchema,
  type CalendarEvent,
  type CivilDate,
  type CreateEventInput,
  type UpdateEventInput,
} from '@lifexp/shared';
import { z } from 'zod';
import { apiFetch, apiJson } from '../../lib/apiClient';

const eventListSchema = z.array(eventSchema);

/** Eventos do período (datas civis, inclusive; a API aceita até 93 dias). */
export const listEvents = (from: CivilDate, to: CivilDate): Promise<CalendarEvent[]> =>
  apiJson(`/events?from=${from}&to=${to}`, eventListSchema);

export const createEvent = (input: CreateEventInput): Promise<CalendarEvent> =>
  apiJson('/events', eventSchema, { method: 'POST', json: input });

export const updateEvent = (id: string, input: UpdateEventInput): Promise<CalendarEvent> =>
  apiJson(`/events/${id}`, eventSchema, { method: 'PATCH', json: input });

/** Idempotente. */
export async function deleteEvent(id: string): Promise<void> {
  await apiFetch(`/events/${id}`, { method: 'DELETE' });
}
