import { Injectable } from '@nestjs/common';
import { levelProgress, type Progress } from '@lifexp/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * XP e nível geral e por área (RF20). Lê os caches (derivados do livro-caixa). O nível sai da
   * função pura a partir do XP, e áreas que ainda não renderam XP aparecem com 0 XP e nível 1.
   */
  async getProgress(userId: string): Promise<Progress> {
    const [user, areas] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { cachedTotalXp: true },
      }),
      this.prisma.area.findMany({
        where: { userId },
        include: { progress: { select: { cachedXp: true } } },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    return {
      total: levelProgress(user.cachedTotalXp),
      areas: areas.map((area) => ({
        areaId: area.id,
        ...levelProgress(area.progress?.cachedXp ?? 0),
      })),
    };
  }
}
