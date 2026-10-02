import { Injectable, Logger } from '@nestjs/common';
import { addDays, todayIn, weekStartOf, type CivilDate } from '@lifexp/shared';
import { BlocksService } from '../blocks/blocks.service.js';
import { fromCivil, toCivil } from '../blocks/blocks.mapper.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  planNotifications,
  planWeeklyReport,
  reportNotificationText,
  scanWindow,
  type NotificationCandidate,
  type PlannedEvent,
  type PlannedOccurrence,
} from './domain/notification-plan.js';
import { ReportsService } from '../reviews/reports.service.js';
import { NotificationPreferencesService } from './notification-preferences.service.js';

export interface ScanSummary {
  users: number;
  created: number;
  failures: number;
}

@Injectable()
export class NotificationGenerator {
  private readonly logger = new Logger(NotificationGenerator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
    private readonly preferences: NotificationPreferencesService,
    private readonly reports: ReportsService,
  ) {}

  /** Varre todas as pessoas que têm blocos ou eventos. Uma que falhe não impede as outras. */
  async scanAll(now: Date): Promise<ScanSummary> {
    const users = await this.prisma.user.findMany({
      where: { OR: [{ blocks: { some: {} } }, { events: { some: {} } }] },
      select: { id: true },
    });
    const summary: ScanSummary = { users: users.length, created: 0, failures: 0 };
    for (const { id } of users) {
      try {
        summary.created += await this.scanUser(id, now);
      } catch (error) {
        // Conta excluída no meio da varredura (RS15): não há mais para quem avisar, e isso não é falha.
        const stillExists = await this.prisma.user.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!stillExists) continue;
        summary.failures += 1;
        this.logger.error(`Falha ao gerar notificações da pessoa ${id}`, error);
      }
    }
    return summary;
  }

  /**
   * Gera os avisos que venceram na janela desta varredura (RF37). Idempotente (RF55, RN25): a chave
   * lógica é única por pessoa, então repetir a varredura, ou duas instâncias ao mesmo tempo, nunca
   * duplica. Devolve quantos avisos novos foram criados.
   */
  async scanUser(userId: string, now: Date): Promise<number> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    const prefs = await this.preferences.get(userId);
    const window = scanWindow(now);

    // Dias locais que a janela pode tocar: blocos até amanhã (lembrete logo depois da meia-noite) e
    // eventos até daqui a 2 dias (lembrete mais distante, 2 dias antes).
    const first = todayIn(user.timezone, window.from);
    const last = todayIn(user.timezone, window.to);
    const occurrences = await this.occurrences(userId, first, addDays(last, 1));
    const events = await this.events(userId, first, addDays(last, 2));

    const candidates = planNotifications({
      window,
      timezone: user.timezone,
      prefs,
      occurrences,
      events,
    });
    const report = await this.reportCandidate(userId, window, user.timezone, prefs);
    const all = report ? [...candidates, report] : candidates;
    if (all.length === 0) return 0;

    const result = await this.prisma.notification.createMany({
      data: all.map((candidate) => ({
        userId,
        kind: candidate.kind,
        title: candidate.title,
        body: candidate.body,
        scheduledFor: candidate.scheduledFor,
        dedupeKey: candidate.dedupeKey,
        blockId: candidate.blockId ?? null,
        occurrenceDate: candidate.occurrenceDate ? fromCivil(candidate.occurrenceDate) : null,
        eventId: candidate.eventId ?? null,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }

  /**
   * O aviso "seu relatório da semana está pronto" (RF47), na segunda-feira, na hora do resumo. O relatório é caro de
   * montar, e a janela da varredura cobre uma hora de varreduras por minuto: confere primeiro se o aviso desta semana
   * já existe para montar uma vez só por pessoa.
   */
  private async reportCandidate(
    userId: string,
    window: ReturnType<typeof scanWindow>,
    timezone: string,
    prefs: Awaited<ReturnType<NotificationPreferencesService['get']>>,
  ): Promise<NotificationCandidate | null> {
    const plan = planWeeklyReport({ window, timezone, prefs });
    if (!plan) return null;
    const dedupeKey = `report:${plan.weekStart}`;
    const existing = await this.prisma.notification.findUnique({
      where: { userId_dedupeKey: { userId, dedupeKey } },
      select: { id: true },
    });
    if (existing) return null;

    const text = reportNotificationText(
      await this.reports.weekly(userId, plan.weekStart, window.to),
    );
    if (!text) return null;
    return { kind: 'REPORT', dedupeKey, ...text, scheduledFor: plan.scheduledFor };
  }

  private async occurrences(
    userId: string,
    from: CivilDate,
    to: CivilDate,
  ): Promise<PlannedOccurrence[]> {
    const weekStarts = new Set<CivilDate>();
    for (let day = from; day <= to; day = addDays(day, 1)) weekStarts.add(weekStartOf(day));
    const weeks = await Promise.all(
      [...weekStarts].map((weekStart) => this.blocks.getWeek(userId, weekStart)),
    );

    const completed = new Set(
      weeks.flatMap((week) =>
        week.completions.map((completion) => `${completion.blockId}|${completion.occurrenceDate}`),
      ),
    );
    const wanted = weeks
      .flatMap((week) => week.occurrences)
      .filter((occurrence) => occurrence.date >= from && occurrence.date <= to);
    if (wanted.length === 0) return [];

    const activities = await this.prisma.activity.findMany({
      where: { userId, id: { in: [...new Set(wanted.map((o) => o.activityId))] } },
      select: { id: true, name: true },
    });
    const nameById = new Map(activities.map((activity) => [activity.id, activity.name]));

    return wanted.map((occurrence) => ({
      blockId: occurrence.blockId,
      occurrenceDate: occurrence.occurrenceDate,
      date: occurrence.date,
      startTime: occurrence.startTime,
      durationMin: occurrence.durationMin,
      activityName: nameById.get(occurrence.activityId) ?? 'Bloco',
      skipped: occurrence.skipped,
      completed: completed.has(`${occurrence.blockId}|${occurrence.occurrenceDate}`),
    }));
  }

  private async events(userId: string, from: CivilDate, to: CivilDate): Promise<PlannedEvent[]> {
    const rows = await this.prisma.calendarEvent.findMany({
      where: { userId, date: { gte: fromCivil(from), lte: fromCivil(to) } },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      date: toCivil(row.date),
      time: row.time,
      remindBeforeMin: row.remindBeforeMin,
    }));
  }
}
