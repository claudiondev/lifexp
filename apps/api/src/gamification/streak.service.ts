import { Inject, Injectable } from '@nestjs/common';
import { todayIn, type Streak } from '@lifexp/shared';
import { CLOCK, type Clock } from '../clock/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildStreakDays, computeStreak } from './domain/streak.js';
import { OccurrenceHistoryService } from './occurrence-history.service.js';

@Injectable()
export class StreakService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: OccurrenceHistoryService,
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
    const { occurrences, completedKeys } = await this.history.load(userId, today);
    return computeStreak(buildStreakDays(occurrences, completedKeys), today);
  }
}
