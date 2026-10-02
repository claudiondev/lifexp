import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AppNotification, CivilDate, NotificationPage } from '@lifexp/shared';
import { toCivil } from '../blocks/blocks.mapper.js';
import { CLOCK, type Clock } from '../clock/clock.js';
import type { Notification as NotificationEntity } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const NOT_FOUND = 'Notificação não encontrada';

const KIND_TO_API = { BLOCK: 'block', EVENT: 'event', DIGEST: 'digest' } as const;

export function toNotificationResponse(row: NotificationEntity): AppNotification {
  return {
    id: row.id,
    kind: KIND_TO_API[row.kind],
    title: row.title,
    body: row.body,
    scheduledFor: row.scheduledFor.toISOString(),
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    blockId: row.blockId,
    occurrenceDate: row.occurrenceDate ? (toCivil(row.occurrenceDate) as CivilDate) : null,
    eventId: row.eventId,
  };
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Central de avisos (RF38), do mais novo ao mais antigo. O id é UUID v7 (ordenado no tempo), então
   * ele serve de cursor: a próxima página traz os de id menor que o último recebido (RNF08).
   */
  async list(
    userId: string,
    options: { unread: boolean; limit: number; before?: string | undefined },
  ): Promise<NotificationPage> {
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(options.unread && { readAt: null }),
        ...(options.before && { id: { lt: options.before } }),
      },
      orderBy: { id: 'desc' },
      take: options.limit + 1,
    });
    const page = rows.slice(0, options.limit);
    return {
      items: page.map(toNotificationResponse),
      nextCursor: rows.length > options.limit ? page[page.length - 1]!.id : null,
    };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** Idempotente: marcar de novo mantém a data da primeira leitura. */
  async markRead(userId: string, id: string): Promise<AppNotification> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: this.clock.now() },
    });
    // Aviso alheio responde 404, igual a um que não existe (RS06).
    const row = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException(NOT_FOUND);
    return toNotificationResponse(row);
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: this.clock.now() },
    });
    return result.count;
  }
}
