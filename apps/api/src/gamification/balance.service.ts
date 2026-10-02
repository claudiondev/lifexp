import { Inject, Injectable } from '@nestjs/common';
import { todayIn, type Balance } from '@lifexp/shared';
import { CLOCK, type Clock } from '../clock/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { balanceScore, balanceWindow, tallyByArea } from './domain/balance.js';
import { OccurrenceHistoryService } from './occurrence-history.service.js';

@Injectable()
export class BalanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: OccurrenceHistoryService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Radar de equilíbrio (RF24): aderência por área nas últimas 4 semanas, em blocos concluídos ÷ planejados
   * (RN41), nunca em XP (RN40) nem em minutos (RN42). Recalculado a cada leitura, como o streak: depende do
   * tempo (a janela de conclusão fecha) e das edições. Só as áreas ativas aparecem; área arquivada sai do radar.
   */
  async get(userId: string): Promise<Balance> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    const today = todayIn(user.timezone, this.clock.now());
    const { start, end } = balanceWindow(today);

    const [areas, { occurrences, completedKeys }] = await Promise.all([
      this.prisma.area.findMany({
        where: { userId, archivedAt: null },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true, color: true, icon: true },
      }),
      this.history.load(userId, today, start),
    ]);
    const tally = tallyByArea(occurrences, completedKeys, today);

    return {
      windowStart: start,
      windowEnd: end,
      areas: areas.map((area) => {
        const { planned, completed } = tally.get(area.id) ?? { planned: 0, completed: 0 };
        return {
          areaId: area.id,
          name: area.name,
          color: area.color as Balance['areas'][number]['color'],
          icon: area.icon as Balance['areas'][number]['icon'],
          planned,
          completed,
          score: balanceScore(planned, completed),
        };
      }),
    };
  }
}
