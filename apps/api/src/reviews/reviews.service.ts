import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  todayIn,
  weekStartOf,
  type AreaColor,
  type AreaIcon,
  type CivilDate,
  type ReviewDetail,
  type ReviewPage,
  type UpdateReviewInput,
  type WeeklyReview,
} from '@lifexp/shared';
import { BlocksService } from '../blocks/blocks.service.js';
import { fromCivil, toCivil } from '../blocks/blocks.mapper.js';
import { CLOCK, type Clock } from '../clock/clock.js';
import type { WeeklyReview as ReviewRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  completionKey,
  computeWeekSummary,
  isFutureWeek,
  previousWeek,
  weekRangeUtc,
} from './domain/week-summary.js';

const FUTURE_WEEK = 'Essa semana ainda não começou: só dá para revisar a atual e as passadas';

export function toReviewResponse(row: ReviewRow): WeeklyReview {
  return {
    weekStart: toCivil(row.weekStart),
    wins: row.wins,
    blockers: row.blockers,
    nextPriority: row.nextPriority,
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Fuso da pessoa (as semanas e o "agora" são dela) e a segunda-feira da semana atual. */
  private async currentWeek(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    return {
      timezone: user.timezone,
      currentWeekStart: weekStartOf(todayIn(user.timezone, this.clock.now())),
    };
  }

  private assertReviewable(weekStart: CivilDate, currentWeekStart: CivilDate): void {
    if (isFutureWeek(weekStart, currentWeekStart)) throw new BadRequestException(FUTURE_WEEK);
  }

  /**
   * A tela da revisão (RF46): o resumo de aderência da semana (calculado na hora, nunca gravado), a
   * reflexão já escrita e a prioridade que a pessoa definiu na semana anterior para esta.
   */
  async getDetail(userId: string, weekStart: CivilDate): Promise<ReviewDetail> {
    const { timezone, currentWeekStart } = await this.currentWeek(userId);
    this.assertReviewable(weekStart, currentWeekStart);
    const range = weekRangeUtc(weekStart, timezone);

    const [week, areas, xp, review, previous] = await Promise.all([
      this.blocks.getWeek(userId, weekStart),
      this.prisma.area.findMany({
        where: { userId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, color: true, icon: true },
      }),
      this.prisma.xpTransaction.aggregate({
        where: { userId, createdAt: { gte: range.from, lt: range.to } },
        _sum: { amount: true },
      }),
      this.prisma.weeklyReview.findUnique({
        where: { userId_weekStart: { userId, weekStart: fromCivil(weekStart) } },
      }),
      this.prisma.weeklyReview.findUnique({
        where: { userId_weekStart: { userId, weekStart: fromCivil(previousWeek(weekStart)) } },
        select: { nextPriority: true },
      }),
    ]);

    return {
      summary: computeWeekSummary({
        weekStart,
        occurrences: week.occurrences,
        completed: new Set(
          week.completions.map((completion) =>
            completionKey(completion.blockId, completion.occurrenceDate),
          ),
        ),
        // cor e ícone são CHAVES de listas fixas (validadas ao salvar a área), como no mapper das áreas
        areas: areas.map((area) => ({
          id: area.id,
          name: area.name,
          color: area.color as AreaColor,
          icon: area.icon as AreaIcon,
        })),
        xp: xp._sum.amount ?? 0,
      }),
      review: review ? toReviewResponse(review) : null,
      previousPriority: previous?.nextPriority ? previous.nextPriority : null,
    };
  }

  /** Salva a reflexão da semana (substitui a anterior). Idempotente: repetir o mesmo corpo dá o mesmo resultado. */
  async save(
    userId: string,
    weekStart: CivilDate,
    input: UpdateReviewInput,
  ): Promise<WeeklyReview> {
    const { currentWeekStart } = await this.currentWeek(userId);
    this.assertReviewable(weekStart, currentWeekStart);
    const now = this.clock.now();
    const row = await this.prisma.weeklyReview.upsert({
      where: { userId_weekStart: { userId, weekStart: fromCivil(weekStart) } },
      create: { userId, weekStart: fromCivil(weekStart), ...input, createdAt: now, updatedAt: now },
      update: { ...input, updatedAt: now },
    });
    return toReviewResponse(row);
  }

  /**
   * Revisões já escritas, da mais recente à mais antiga (RNF08). A semana (segunda-feira) é única por
   * pessoa, então serve de cursor. Revisão sem nenhum texto não aparece: é como se não existisse.
   */
  async list(
    userId: string,
    options: { limit: number; before?: CivilDate | undefined },
  ): Promise<ReviewPage> {
    const rows = await this.prisma.weeklyReview.findMany({
      where: {
        userId,
        OR: [{ wins: { not: '' } }, { blockers: { not: '' } }, { nextPriority: { not: '' } }],
        ...(options.before && { weekStart: { lt: fromCivil(options.before) } }),
      },
      orderBy: { weekStart: 'desc' },
      take: options.limit + 1,
    });
    const page = rows.slice(0, options.limit);
    return {
      items: page.map((row) => ({
        weekStart: toCivil(row.weekStart),
        nextPriority: row.nextPriority,
        updatedAt: row.updatedAt.toISOString(),
      })),
      nextCursor: rows.length > options.limit ? toCivil(page[page.length - 1]!.weekStart) : null,
    };
  }
}
