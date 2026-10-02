import { Injectable } from '@nestjs/common';
import type { XpHistoryPage, XpHistoryQuery } from '@lifexp/shared';
import { toCivil } from '../blocks/blocks.mapper.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  TYPE_TO_LEDGER,
  collectSourceIds,
  cutPage,
  toHistoryEntries,
  type LedgerRow,
} from './domain/xp-history.js';

/** "Quest da semana de 05/10": a segunda-feira que abre a semana, em dia/mês. */
export const questLabel = (weekStart: string): string =>
  `Quest da semana de ${weekStart.slice(8, 10)}/${weekStart.slice(5, 7)}`;

const byId = <T extends { id: string }>(rows: T[], label: (row: T) => string | undefined) => {
  const map = new Map<string, string>();
  for (const row of rows) {
    const text = label(row);
    if (text !== undefined) map.set(row.id, text);
  }
  return map;
};

@Injectable()
export class XpHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Histórico de XP (RF53), do mais novo ao mais antigo. O id é UUID v7 (ordenado no tempo) e serve
   * de cursor (RNF08), como na central de notificações.
   *
   * `sourceId` não tem chave estrangeira (aponta para tabelas diferentes conforme o tipo), então o
   * nome da origem é buscado em lote, uma consulta por tipo: o número de consultas não cresce com
   * o tamanho da página (nada de N+1).
   */
  async list(userId: string, query: XpHistoryQuery): Promise<XpHistoryPage> {
    const found = await this.prisma.xpTransaction.findMany({
      relationLoadStrategy: 'join',
      where: {
        userId,
        ...(query.type && { type: TYPE_TO_LEDGER[query.type] }),
        ...(query.before && { id: { lt: query.before } }),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      include: { area: { select: { name: true } }, reversed: { select: { type: true } } },
    });
    const { page, nextCursor } = cutPage(found, query.limit);
    const rows: LedgerRow[] = page.map((entry) => ({
      id: entry.id,
      type: entry.type,
      amount: entry.amount,
      areaId: entry.areaId,
      areaName: entry.area?.name ?? null,
      sourceId: entry.sourceId,
      createdAt: entry.createdAt,
      reversedType: entry.reversed?.type ?? null,
    }));

    const ids = collectSourceIds(rows);
    // Sempre com o dono no filtro (RS06), mesmo o id vindo do livro-caixa da própria pessoa.
    const [completions, milestones, goals, quests] = await Promise.all([
      ids.completion.length === 0
        ? []
        : this.prisma.completion.findMany({
            where: { id: { in: ids.completion }, userId },
            select: { id: true, activityId: true },
          }),
      ids.milestone.length === 0
        ? []
        : this.prisma.milestone.findMany({
            where: { id: { in: ids.milestone }, goal: { userId } },
            select: { id: true, title: true },
          }),
      ids.goal.length === 0
        ? []
        : this.prisma.goal.findMany({
            where: { id: { in: ids.goal }, userId },
            select: { id: true, title: true },
          }),
      ids.quest.length === 0
        ? []
        : this.prisma.weeklyQuest.findMany({
            where: { id: { in: ids.quest }, userId },
            select: { id: true, weekStart: true },
          }),
    ]);
    // A conclusão guarda a "foto" da atividade: o nome vem dela, não do bloco (que pode ter mudado).
    const activities =
      completions.length === 0
        ? []
        : await this.prisma.activity.findMany({
            where: { id: { in: [...new Set(completions.map((c) => c.activityId))] }, userId },
            select: { id: true, name: true },
          });
    const activityNames = byId(activities, (activity) => activity.name);

    return {
      items: toHistoryEntries(rows, {
        completion: byId(completions, (completion) => activityNames.get(completion.activityId)),
        milestone: byId(milestones, (milestone) => milestone.title),
        goal: byId(goals, (goal) => goal.title),
        quest: byId(quests, (quest) => questLabel(toCivil(quest.weekStart))),
      }),
      nextCursor,
    };
  }
}
