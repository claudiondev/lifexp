import { Inject, Injectable } from '@nestjs/common';
import { todayIn, type Consistency, type ConsistencyQuery } from '@lifexp/shared';
import { CLOCK, type Clock } from '../clock/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildConsistencyDays, consistencyStart, tallyByDay } from './domain/consistency.js';
import { OccurrenceHistoryService } from './occurrence-history.service.js';

@Injectable()
export class ConsistencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: OccurrenceHistoryService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Mapa de constância: por dia, blocos planejados e concluídos nas últimas `weeks` semanas (a de hoje é a última,
   * terminando em hoje). Derivado a cada leitura, como o radar e o streak: depende do tempo (a janela de conclusão
   * fecha) e das edições (pular, mover), então um cache seria sempre suspeito. Usa o mesmo histórico de ocorrências.
   */
  async get(userId: string, query: ConsistencyQuery): Promise<Consistency> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    const today = todayIn(user.timezone, this.clock.now());
    const start = consistencyStart(today, query.weeks);

    const { occurrences, completedKeys } = await this.history.load(userId, today, start);
    const tally = tallyByDay(occurrences, completedKeys, today, start);
    return { start, end: today, days: buildConsistencyDays(start, today, tally) };
  }
}
