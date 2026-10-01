import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { addDays, type Block, type CreateBlockInput, type WeekResponse } from '@lifexp/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { computeWeekOccurrences } from './domain/week-occurrences.js';
import { fromCivil, toBlockResponse, toBlockTemplate, toExceptionRule } from './blocks.mapper.js';

const ACTIVITY_ARCHIVED = 'A atividade está arquivada. Restaure a atividade e a área primeiro';

@Injectable()
export class BlocksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Uma única consulta traz os blocos que podem tocar a semana, com as exceções da semana e a área
   * da atividade (RNF04). As ocorrências são calculadas em memória pela regra de domínio.
   */
  async getWeek(userId: string, weekStart: string): Promise<WeekResponse> {
    const weekEnd = addDays(weekStart, 6);
    const start = fromCivil(weekStart);
    const end = fromCivil(weekEnd);

    const blocks = await this.prisma.block.findMany({
      // 'join' resolve as relações no próprio SELECT (uma ida ao banco), em vez de uma query por relação.
      relationLoadStrategy: 'join',
      where: {
        userId,
        OR: [
          {
            recurrence: 'WEEKLY',
            validFrom: { lte: end },
            OR: [{ validUntil: null }, { validUntil: { gte: start } }],
          },
          { recurrence: 'ONCE', date: { gte: start, lte: end } },
        ],
      },
      include: {
        activity: { select: { areaId: true } },
        exceptions: { where: { occurrenceDate: { gte: start, lte: end } } },
      },
    });

    const occurrences = computeWeekOccurrences(
      weekStart,
      blocks.map((block) => toBlockTemplate(block, block.activity.areaId)),
      blocks.flatMap((block) => block.exceptions.map(toExceptionRule)),
    );
    return { weekStart, weekEnd, occurrences };
  }

  async create(userId: string, input: CreateBlockInput): Promise<Block> {
    await this.assertActivityUsable(userId, input.activityId);

    const block = await this.prisma.block.create({
      data:
        input.recurrence === 'weekly'
          ? {
              userId,
              activityId: input.activityId,
              recurrence: 'WEEKLY',
              weekday: input.weekday,
              startTime: input.startTime,
              durationMin: input.durationMin,
              validFrom: fromCivil(input.validFrom),
            }
          : {
              userId,
              activityId: input.activityId,
              recurrence: 'ONCE',
              date: fromCivil(input.date),
              startTime: input.startTime,
              durationMin: input.durationMin,
            },
    });
    return toBlockResponse(block);
  }

  /**
   * A atividade precisa ser da pessoa (404 se não for, sem revelar que existe: RS06) e estar
   * ativa, junto com a área dela. Blocos já existentes de atividades arquivadas continuam visíveis.
   */
  private async assertActivityUsable(userId: string, activityId: string): Promise<void> {
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, userId },
      select: { archivedAt: true, area: { select: { archivedAt: true } } },
    });
    if (!activity) throw new NotFoundException('Atividade não encontrada');
    if (activity.archivedAt !== null || activity.area.archivedAt !== null) {
      throw new ConflictException(ACTIVITY_ARCHIVED);
    }
  }
}
