import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEFAULT_PREFERENCES, type NotificationPreferences } from './domain/notification-plan.js';

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sem linha gravada, valem os padrões (a linha só nasce na primeira alteração). */
  async get(userId: string): Promise<NotificationPreferences> {
    const row = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    if (!row) return { ...DEFAULT_PREFERENCES };
    return {
      blockRemindersEnabled: row.blockRemindersEnabled,
      blockLeadMin: row.blockLeadMin,
      eventRemindersEnabled: row.eventRemindersEnabled,
      digestEnabled: row.digestEnabled,
      digestTime: row.digestTime,
      digestEmailEnabled: row.digestEmailEnabled,
    };
  }
}
