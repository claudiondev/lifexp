import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  ACHIEVEMENT_CATALOG,
  addDays,
  todayIn,
  weekStartOf,
  type AchievementKey,
  type AreaColor,
  type AreaIcon,
  type CivilDate,
  type WeeklyReport,
} from '@lifexp/shared';
import { CLOCK, type Clock } from '../clock/clock.js';
import { buildStreakDays, computeStreak } from '../gamification/domain/streak.js';
import { OccurrenceHistoryService } from '../gamification/occurrence-history.service.js';
import { QuestService } from '../gamification/quest.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { summarizeXp, tallyWeek, toReportAreas, toReportBlocks } from './domain/weekly-report.js';
import { isFutureWeek, weekRangeUtc } from './domain/week-summary.js';

const FUTURE_WEEK = 'Essa semana ainda não começou: só há relatório da atual e das passadas';

/**
 * Relatório semanal (RF47), gerado na hora a partir do que a pessoa planejou e cumpriu: nada é gravado, então
 * editar um bloco ou desfazer uma conclusão dentro do prazo se reflete na próxima leitura. A aderência segue as
 * regras do radar e do streak (conta blocos, pular não pune, o que ainda dá tempo fica "em aberto").
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: OccurrenceHistoryService,
    private readonly quests: QuestService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async weekly(userId: string, requested?: CivilDate): Promise<WeeklyReport> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    const today = todayIn(user.timezone, this.clock.now());
    const currentWeek = weekStartOf(today);
    const weekStart = requested ?? currentWeek;
    if (isFutureWeek(weekStart, currentWeek)) throw new BadRequestException(FUTURE_WEEK);

    const weekEnd = addDays(weekStart, 6);
    // O streak é medido no fim da semana pedida (ou hoje, se ela ainda não acabou). Já "o que fechou e o que está em
    // aberto" depende do hoje de verdade: uma semana passada pode ter o domingo ainda dentro do prazo.
    const asOf = today < weekEnd ? today : weekEnd;
    const range = weekRangeUtc(weekStart, user.timezone);

    const [areaRows, history, ledger, unlocked, milestones, goals, quest] = await Promise.all([
      this.prisma.area.findMany({
        where: { userId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
      this.history.load(userId, asOf),
      this.prisma.xpTransaction.findMany({
        where: { userId, createdAt: { gte: range.from, lt: range.to } },
        select: { amount: true, areaId: true },
      }),
      this.prisma.achievement.findMany({
        where: { userId, unlockedAt: { gte: range.from, lt: range.to } },
        orderBy: [{ unlockedAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.milestone.findMany({
        where: { goal: { userId }, done: true, doneAt: { gte: range.from, lt: range.to } },
        include: { goal: { select: { id: true, title: true } } },
        orderBy: [{ doneAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.goal.findMany({
        where: { userId, status: 'COMPLETED', completedAt: { gte: range.from, lt: range.to } },
        select: { id: true, title: true, completedAt: true },
        orderBy: [{ completedAt: 'asc' }, { id: 'asc' }],
      }),
      this.quests.view(userId, weekStart),
    ]);

    const areas = areaRows.map((area) => ({
      id: area.id,
      name: area.name,
      color: area.color as AreaColor,
      icon: area.icon as AreaIcon,
      archived: area.archivedAt !== null,
    }));
    const { total, byArea, bestDay } = tallyWeek(
      history.occurrences,
      history.completedKeys,
      weekStart,
      today,
    );

    return {
      weekStart,
      weekEnd,
      blocks: toReportBlocks(total),
      minutes: total.minutes,
      xp: summarizeXp(ledger, areas),
      areas: toReportAreas(areas, byArea),
      quest,
      achievements: unlocked.map((row) => ({
        key: row.key as AchievementKey,
        title: ACHIEVEMENT_CATALOG[row.key as AchievementKey].title,
        unlockedAt: row.unlockedAt.toISOString(),
      })),
      goals: {
        milestones: milestones.map((row) => ({
          goalId: row.goal.id,
          goalTitle: row.goal.title,
          title: row.title,
          doneAt: row.doneAt!.toISOString(),
        })),
        completed: goals.map((row) => ({
          id: row.id,
          title: row.title,
          completedAt: row.completedAt!.toISOString(),
        })),
      },
      streak: computeStreak(buildStreakDays(history.occurrences, history.completedKeys), asOf),
      bestDay,
    };
  }
}
