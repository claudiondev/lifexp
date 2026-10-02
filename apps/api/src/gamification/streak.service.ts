import { Inject, Injectable } from '@nestjs/common';
import { addDays, todayIn, weekStartOf, type CivilDate, type Streak } from '@lifexp/shared';
import { toBlockTemplate, toCivil, toExceptionRule } from '../blocks/blocks.mapper.js';
import { computeWeekOccurrences } from '../blocks/domain/week-occurrences.js';
import { CLOCK, type Clock } from '../clock/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildStreakDays, computeStreak } from './domain/streak.js';

@Injectable()
export class StreakService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Streak (RF21) recalculado do histórico a cada leitura, sem cache: ele muda com o tempo (um dia
   * perdido quebra quando a janela fecha) e com edições (pular um bloco deixa o dia neutro), e não
   * só quando se conclui algo, então um cache ficaria desatualizado por construção. O custo é uma
   * consulta e um cálculo em memória sobre as semanas desde o primeiro bloco.
   */
  async getStreak(userId: string): Promise<Streak> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    const today = todayIn(user.timezone, this.clock.now());

    const blocks = await this.prisma.block.findMany({
      where: { userId },
      include: {
        activity: { select: { areaId: true } },
        exceptions: true,
        completions: { where: { undoneAt: null }, select: { occurrenceDate: true } },
      },
    });
    if (blocks.length === 0) return computeStreak([], today);

    const templates = blocks.map((block) => toBlockTemplate(block, block.activity.areaId));
    const exceptions = blocks.flatMap((block) => block.exceptions.map(toExceptionRule));
    const completedKeys = new Set(
      blocks.flatMap((block) =>
        block.completions.map((completion) => `${block.id}|${toCivil(completion.occurrenceDate)}`),
      ),
    );

    const first = templates
      .map((block) => block.validFrom ?? block.date)
      .filter(isDate)
      .sort()[0];
    if (!first) return computeStreak([], today);

    const occurrences = [];
    for (let week = weekStartOf(first); week <= today; week = addDays(week, 7)) {
      occurrences.push(...computeWeekOccurrences(week, templates, exceptions));
    }
    return computeStreak(buildStreakDays(occurrences, completedKeys), today);
  }
}

const isDate = (value: CivilDate | null): value is CivilDate => value !== null;
