import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DEFAULT_REMIND_BEFORE_MIN,
  isReminderAllowed,
  sortEvents,
  type CalendarEvent,
  type CivilDate,
  type CreateEventInput,
  type UpdateEventInput,
} from '@lifexp/shared';
import { fromCivil } from '../blocks/blocks.mapper.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toEventResponse } from './event.mapper.js';

const NOT_FOUND = 'Evento não encontrado';
const AREA_ARCHIVED = 'A área está arquivada. Restaure a área primeiro';
const REMINDER_NOT_ALLOWED =
  'Evento sem hora só aceita lembrete em dias (1 ou 2 dias antes). Ajuste a hora ou o lembrete';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Eventos do período (datas civis, inclusive), do mais cedo ao mais tarde. */
  async list(userId: string, from: CivilDate, to: CivilDate): Promise<CalendarEvent[]> {
    const events = await this.prisma.calendarEvent.findMany({
      where: { userId, date: { gte: fromCivil(from), lte: fromCivil(to) } },
    });
    return sortEvents(events.map(toEventResponse));
  }

  async get(userId: string, id: string): Promise<CalendarEvent> {
    return toEventResponse(await this.findOwnedOrThrow(userId, id));
  }

  async create(userId: string, input: CreateEventInput): Promise<CalendarEvent> {
    if (input.areaId) await this.assertAreaUsable(userId, input.areaId);
    const event = await this.prisma.calendarEvent.create({
      data: {
        userId,
        title: input.title,
        notes: input.notes ?? null,
        areaId: input.areaId ?? null,
        date: fromCivil(input.date),
        time: input.time ?? null,
        category: input.category,
        // Ausente = padrão (1 dia antes, RN24); nulo = a pessoa não quer lembrete.
        remindBeforeMin:
          input.remindBeforeMin === undefined ? DEFAULT_REMIND_BEFORE_MIN : input.remindBeforeMin,
      },
    });
    return toEventResponse(event);
  }

  async update(userId: string, id: string, input: UpdateEventInput): Promise<CalendarEvent> {
    const current = await this.findOwnedOrThrow(userId, id);
    if (input.areaId && input.areaId !== current.areaId) {
      await this.assertAreaUsable(userId, input.areaId);
    }

    // O lembrete precisa combinar com o evento FINAL (ex.: tirar a hora de um evento com lembrete
    // de 1 h antes não faz sentido): valida o resultado, não só os campos enviados.
    const time = input.time !== undefined ? input.time : current.time;
    const remind =
      input.remindBeforeMin !== undefined ? input.remindBeforeMin : current.remindBeforeMin;
    if (!isReminderAllowed(time, remind)) throw new BadRequestException(REMINDER_NOT_ALLOWED);

    const event = await this.prisma.calendarEvent.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.areaId !== undefined && { areaId: input.areaId }),
        ...(input.date !== undefined && { date: fromCivil(input.date) }),
        ...(input.time !== undefined && { time: input.time }),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.remindBeforeMin !== undefined && { remindBeforeMin: input.remindBeforeMin }),
      },
    });
    return toEventResponse(event);
  }

  /** Idempotente: excluir um evento que não existe (ou que não é seu) não é erro e não toca em nada. */
  async remove(userId: string, id: string): Promise<void> {
    await this.prisma.calendarEvent.deleteMany({ where: { id, userId } });
  }

  /** Toda leitura/escrita filtra pelo dono (RS06): evento alheio responde 404, como um inexistente. */
  private async findOwnedOrThrow(userId: string, id: string) {
    const event = await this.prisma.calendarEvent.findFirst({ where: { id, userId } });
    if (!event) throw new NotFoundException(NOT_FOUND);
    return event;
  }

  private async assertAreaUsable(userId: string, areaId: string): Promise<void> {
    const area = await this.prisma.area.findFirst({ where: { id: areaId, userId } });
    if (!area) throw new NotFoundException('Área não encontrada');
    if (area.archivedAt !== null) throw new ConflictException(AREA_ARCHIVED);
  }
}
