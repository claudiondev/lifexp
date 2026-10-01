import { Inject, Injectable } from '@nestjs/common';
import {
  addDays,
  calculateXp,
  levelProgress,
  todayIn,
  weekStartOf,
  type Occurrence,
  type TodayItem,
  type TodayResponse,
} from '@lifexp/shared';
import { BlocksService } from '../blocks/blocks.service.js';
import { CLOCK, type Clock } from '../clock/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { completionWindow, dayBounds, occurrenceStatus } from './domain/completion-window.js';

@Injectable()
export class TodayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * A tela Hoje (RF50 a RF52): as ocorrências de hoje, mais as de ontem, porque a janela de
   * conclusão vai até 23:59 do dia seguinte, ou seja, o que ficou de ontem ainda dá para concluir
   * (ou desfazer). "Hoje" é o dia civil no fuso da pessoa (RN28, RN36).
   */
  async getToday(userId: string): Promise<TodayResponse> {
    const now = this.clock.now();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true, cachedTotalXp: true },
    });
    const today = todayIn(user.timezone, now);
    const yesterday = addDays(today, -1);

    // Ontem pode cair na semana anterior (hoje é segunda): busca as semanas necessárias.
    const weekStarts = [...new Set([weekStartOf(yesterday), weekStartOf(today)])];
    const weeks = await Promise.all(
      weekStarts.map((weekStart) => this.blocks.getWeek(userId, weekStart)),
    );
    const completions = new Map(
      weeks
        .flatMap((week) => week.completions)
        .map((c) => [`${c.blockId}|${c.occurrenceDate}`, c] as const),
    );

    const wanted = weeks
      .flatMap((week) => week.occurrences)
      // o dia EFETIVO conta (uma ocorrência movida aparece no dia para onde foi)
      .filter((o) => o.date === today || o.date === yesterday)
      // ontem só interessa o que não foi pulado: pular é uma decisão já resolvida
      .filter((o) => o.date === today || !o.skipped);

    const weights = await this.activityWeights(wanted);
    const items = wanted.map((occurrence): TodayItem => {
      const completion =
        completions.get(`${occurrence.blockId}|${occurrence.occurrenceDate}`) ?? null;
      const window = completionWindow(occurrence.date, occurrence.startTime, user.timezone);
      return {
        ...occurrence,
        status: occurrenceStatus({
          skipped: occurrence.skipped,
          completed: completion !== null,
          now,
          window,
        }),
        opensAt: window.opensAt.toISOString(),
        closesAt: window.closesAt.toISOString(),
        xpPreview:
          completion?.xpAmount ??
          calculateXp({
            durationMin: occurrence.durationMin,
            xpWeight: weights.get(occurrence.activityId) ?? 1,
          }),
        completion,
      };
    });
    items.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.startTime.localeCompare(b.startTime) ||
        a.blockId.localeCompare(b.blockId),
    );

    return {
      date: today,
      items,
      xpToday: await this.xpOfDay(userId, today, user.timezone),
      total: levelProgress(user.cachedTotalXp),
    };
  }

  private async activityWeights(occurrences: readonly Occurrence[]): Promise<Map<string, number>> {
    const ids = [...new Set(occurrences.map((o) => o.activityId))];
    if (ids.length === 0) return new Map();
    const activities = await this.prisma.activity.findMany({
      where: { id: { in: ids } },
      select: { id: true, xpWeight: true },
    });
    return new Map(activities.map((a) => [a.id, a.xpWeight]));
  }

  /** XP líquido do dia: conclusões menos estornos lançados dentro do dia local da pessoa. */
  private async xpOfDay(userId: string, date: string, timezone: string): Promise<number> {
    const { startsAt, endsAt } = dayBounds(date, timezone);
    const result = await this.prisma.xpTransaction.aggregate({
      where: { userId, createdAt: { gte: startsAt, lt: endsAt } },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  }
}
