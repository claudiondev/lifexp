import type { CalendarEvent, EventCategory } from '@lifexp/shared';

type Reminder = CalendarEvent['remindBeforeMin'];
import { toCivil } from '../blocks/blocks.mapper.js';
import type { CalendarEvent as EventEntity } from '../generated/prisma/client.js';

export function toEventResponse(event: EventEntity): CalendarEvent {
  return {
    id: event.id,
    areaId: event.areaId,
    title: event.title,
    notes: event.notes,
    date: toCivil(event.date),
    time: event.time,
    // O banco só recebe valores validados pelo schema compartilhado (e pela CHECK).
    category: event.category as EventCategory,
    remindBeforeMin: event.remindBeforeMin as Reminder,
  };
}
