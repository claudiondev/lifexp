import { Inject, Injectable } from '@nestjs/common';
import {
  todayIn,
  weekStartOf,
  type AreaColor,
  type XpEvolution,
  type XpEvolutionQuery,
} from '@lifexp/shared';
import { CLOCK, type Clock } from '../clock/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { weekRangeUtc } from '../reviews/domain/week-summary.js';
import { buildEvolution, evolutionWeekStarts } from './domain/xp-evolution.js';

@Injectable()
export class XpEvolutionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Evolução do XP: líquido por semana e por área nas últimas `weeks` semanas (a atual é a última). É DERIVADA do
   * livro-caixa (imutável) a cada leitura, sem tabela nem cache: o livro já é a fonte da verdade (RN29) e a consulta
   * é uma faixa de datas coberta pelo índice (userId, createdAt). As semanas são as do fuso da pessoa, de segunda a
   * segunda, como na revisão semanal.
   */
  async get(userId: string, query: XpEvolutionQuery): Promise<XpEvolution> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    const today = todayIn(user.timezone, this.clock.now());
    const ranges = evolutionWeekStarts(weekStartOf(today), query.weeks).map((weekStart) => ({
      weekStart,
      ...weekRangeUtc(weekStart, user.timezone),
    }));

    const [rows, areas] = await Promise.all([
      this.prisma.xpTransaction.findMany({
        where: { userId, createdAt: { gte: ranges[0]!.from, lt: ranges.at(-1)!.to } },
        select: { areaId: true, amount: true, createdAt: true },
      }),
      // Inclui áreas arquivadas: o XP antigo continua com o nome e a cor dela.
      this.prisma.area.findMany({
        where: { userId },
        select: { id: true, name: true, color: true },
      }),
    ]);

    return {
      weeks: buildEvolution(
        rows,
        ranges,
        areas.map((area) => ({ ...area, color: area.color as AreaColor })),
      ),
      today,
    };
  }
}
