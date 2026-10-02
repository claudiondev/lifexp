import { createZodDto } from 'nestjs-zod';
import {
  createEventSchema,
  eventSchema,
  listEventsQuerySchema,
  updateEventSchema,
} from '@lifexp/shared';

export class EventDto extends createZodDto(eventSchema) {}
export class CreateEventDto extends createZodDto(createEventSchema) {}
export class UpdateEventDto extends createZodDto(updateEventSchema) {}
export class ListEventsQueryDto extends createZodDto(listEventsQuerySchema) {}
