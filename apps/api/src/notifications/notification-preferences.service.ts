import { Injectable } from '@nestjs/common';
import type { UpdateNotificationPreferencesInput } from '@lifexp/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DEFAULT_PREFERENCES,
  type BlockLead,
  type NotificationPreferences,
} from './domain/notification-plan.js';

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sem linha gravada, valem os padrões (a linha só nasce na primeira alteração). */
  async get(userId: string): Promise<NotificationPreferences> {
    const row = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    if (!row) return { ...DEFAULT_PREFERENCES };
    return {
      blockRemindersEnabled: row.blockRemindersEnabled,
      // O banco só aceita as opções da lista (CHECK), então o tipo estreito é seguro.
      blockLeadMin: row.blockLeadMin as BlockLead,
      eventRemindersEnabled: row.eventRemindersEnabled,
      digestEnabled: row.digestEnabled,
      digestTime: row.digestTime,
      digestEmailEnabled: row.digestEmailEnabled,
    };
  }

  /** Grava só o que veio (a linha nasce no primeiro uso) e devolve as preferências completas. */
  async update(
    userId: string,
    input: UpdateNotificationPreferencesInput,
  ): Promise<NotificationPreferences> {
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...input },
      update: input,
    });
    return this.get(userId);
  }
}
