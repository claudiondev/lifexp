import { Inject, Injectable } from '@nestjs/common';
import { todayIn, weekStartOf, type CivilDate, type Quest } from '@lifexp/shared';
import { fromCivil, toCivil } from '../blocks/blocks.mapper.js';
import { BlocksService } from '../blocks/blocks.service.js';
import { CLOCK, type Clock } from '../clock/clock.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  buildSnapshot,
  evaluateQuest,
  itemKey,
  type QuestEvaluation,
  type QuestItemInput,
} from './domain/quest.js';
import { AchievementsService } from './achievements.service.js';
import { XpLedgerService, type LedgerResult, type Tx } from './xp-ledger.service.js';

type Db = Tx;
type QuestRow = Prisma.WeeklyQuestGetPayload<{ include: { items: true } }>;

/** O que `settle` fez: nada, deu o bônus ou estornou o bônus (com o estado do XP depois disso). */
export interface Settlement {
  awarded: number;
  reversed: number;
  result: LedgerResult | null;
}
export const NO_SETTLEMENT: Settlement = { awarded: 0, reversed: 0, result: null };

const NONE = (weekStart: CivilDate): Quest => ({
  weekStart,
  status: 'none',
  eligible: 0,
  completed: 0,
  target: 0,
  ratio: null,
  bonusXp: 0,
  tiers: [],
  completedAt: null,
});

const toItems = (quest: QuestRow): QuestItemInput[] =>
  quest.items.map((item) => ({
    blockId: item.blockId,
    occurrenceDate: toCivil(item.occurrenceDate),
    xp: item.xp,
  }));

/**
 * Quest semanal (RF22, RN16 a RN18). O snapshot dos blocos planejados fixa a meta da semana; o progresso nunca é
 * gravado (sai das conclusões ativas); só o bônus entra no livro-caixa, quando a quest é cumprida, e sai (por
 * estorno) se desfazer uma conclusão deixa a semana abaixo dos 80%.
 */
@Injectable()
export class QuestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
    private readonly ledger: XpLedgerService,
    private readonly achievements: AchievementsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** O plano e as conclusões da semana. Com o `tx` da quem chama, enxerga o que a transação já gravou. */
  private async readWeek(db: Db, userId: string, weekStart: CivilDate) {
    const week = await this.blocks.getWeek(userId, weekStart, db);
    return {
      occurrences: week.occurrences,
      planned: new Set(
        week.occurrences
          .filter((occurrence) => !occurrence.skipped)
          .map((occurrence) => itemKey(occurrence.blockId, occurrence.occurrenceDate)),
      ),
      completed: new Set(
        week.completions.map((completion) =>
          itemKey(completion.blockId, completion.occurrenceDate),
        ),
      ),
    };
  }

  private async evaluate(db: Db, userId: string, quest: QuestRow): Promise<QuestEvaluation> {
    const { planned, completed } = await this.readWeek(db, userId, toCivil(quest.weekStart));
    return evaluateQuest({ items: toItems(quest), planned, completed });
  }

  /**
   * Tira o snapshot da semana, se ainda não existe (idempotente). Sem nenhum bloco planejado não há quest.
   * Quem chama garante a exclusão entre pedidos (trava da pessoa), então não há corrida de dois snapshots.
   */
  private async ensureQuest(
    db: Db,
    userId: string,
    weekStart: CivilDate,
    now: Date,
  ): Promise<{ quest: QuestRow | null; created: boolean }> {
    const where = { userId_weekStart: { userId, weekStart: fromCivil(weekStart) } };
    const existing = await db.weeklyQuest.findUnique({ where, include: { items: true } });
    if (existing) return { quest: existing, created: false };

    const { occurrences } = await this.readWeek(db, userId, weekStart);
    const activityIds = [...new Set(occurrences.map((occurrence) => occurrence.activityId))];
    const activities =
      activityIds.length === 0
        ? []
        : await db.activity.findMany({
            where: { id: { in: activityIds }, userId },
            select: { id: true, xpWeight: true },
          });
    const items = buildSnapshot(
      occurrences,
      new Map(activities.map((activity) => [activity.id, activity.xpWeight])),
    );
    if (items.length === 0) return { quest: null, created: false };

    const quest = await db.weeklyQuest.create({
      data: {
        userId,
        weekStart: fromCivil(weekStart),
        createdAt: now,
        items: {
          create: items.map((item) => ({
            blockId: item.blockId,
            occurrenceDate: fromCivil(item.occurrenceDate),
            durationMin: item.durationMin,
            xp: item.xp,
          })),
        },
      },
      include: { items: true },
    });
    return { quest, created: true };
  }

  /** Cria o snapshot da semana da pessoa (usado pelo agendador e pela primeira consulta da semana). */
  async ensureForUser(
    userId: string,
    weekStart: CivilDate,
  ): Promise<{ quest: QuestRow | null; created: boolean }> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      await this.ledger.lockUser(tx, userId);
      return this.ensureQuest(tx, userId, weekStart, now);
    });
  }

  /**
   * Liquida o bônus conforme o estado de AGORA (idempotente): cumprida e sem bônus dado, dá o bônus; abaixo dos 80% com
   * bônus dado, estorna. Chamada dentro da transação da conclusão/desfazer (RN30), já com a pessoa travada.
   */
  async settle(tx: Tx, userId: string, weekStart: CivilDate, now: Date): Promise<Settlement> {
    const quest = await tx.weeklyQuest.findUnique({
      where: { userId_weekStart: { userId, weekStart: fromCivil(weekStart) } },
      include: { items: true },
    });
    if (!quest) return NO_SETTLEMENT;

    const evaluation = await this.evaluate(tx, userId, quest);
    const award = await this.ledger.findActiveEntry(tx, quest.id, 'QUEST');

    if (evaluation.met && !award) {
      const result = await this.ledger.credit(tx, {
        userId,
        areaId: null, // a quest atravessa as áreas: o bônus conta só no total
        amount: evaluation.bonusXp,
        type: 'QUEST',
        sourceId: quest.id,
        createdAt: now,
      });
      await tx.weeklyQuest.update({
        where: { id: quest.id },
        data: { status: 'COMPLETED', completedAt: now },
      });
      return { awarded: evaluation.bonusXp, reversed: 0, result };
    }
    if (!evaluation.met && award) {
      const result = await this.ledger.reverse(tx, award, now);
      await tx.weeklyQuest.update({
        where: { id: quest.id },
        data: { status: 'ACTIVE', completedAt: null },
      });
      return { awarded: 0, reversed: award.amount, result };
    }
    return NO_SETTLEMENT;
  }

  private async currentWeek(userId: string): Promise<CivilDate> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    return weekStartOf(todayIn(user.timezone, this.clock.now()));
  }

  /**
   * A quest de uma semana (RF22). A semana atual ganha o snapshot na primeira consulta, se o agendador ainda não
   * o tirou; semanas passadas sem quest e semanas futuras são `none`. Na semana atual, se pular ou restaurar um
   * bloco mudou o que a quest pede, a consulta também liquida o bônus (só nesse caso lê com trava).
   */
  async view(userId: string, requested?: CivilDate): Promise<Quest> {
    const current = await this.currentWeek(userId);
    const weekStart = requested ?? current;
    if (weekStart > current) return NONE(weekStart);

    const where = { userId_weekStart: { userId, weekStart: fromCivil(weekStart) } };
    let quest: QuestRow | null = await this.prisma.weeklyQuest.findUnique({
      where,
      include: { items: true },
    });
    if (!quest && weekStart === current)
      quest = (await this.ensureForUser(userId, weekStart)).quest;
    if (!quest) return NONE(weekStart);

    let evaluation = await this.evaluate(this.prisma, userId, quest);
    if (weekStart === current && evaluation.met !== (quest.status === 'COMPLETED')) {
      const now = this.clock.now();
      await this.prisma.$transaction(async (tx) => {
        await this.ledger.lockUser(tx, userId);
        const settled = await this.settle(tx, userId, weekStart, now);
        // Cumprir a quest aqui (pular um bloco a deixou nos 80%) também merece "Semana completa" e pode atingir recompensas.
        if (settled.awarded > 0) await this.achievements.evaluate(tx, userId, now);
      });
      quest = await this.prisma.weeklyQuest.findUniqueOrThrow({ where, include: { items: true } });
      evaluation = await this.evaluate(this.prisma, userId, quest);
    }

    // Cumprida: o bônus é o que FOI dado (congelado no livro-caixa); ativa: o que será dado.
    const award =
      quest.status === 'COMPLETED'
        ? await this.ledger.findActiveEntry(this.prisma, quest.id, 'QUEST')
        : null;
    return {
      weekStart,
      status: quest.status === 'COMPLETED' ? 'completed' : 'active',
      eligible: evaluation.eligible,
      completed: evaluation.completed,
      target: evaluation.target,
      ratio: evaluation.ratio,
      bonusXp: award?.amount ?? evaluation.bonusXp,
      tiers: evaluation.tiers,
      completedAt: quest.completedAt?.toISOString() ?? null,
    };
  }
}
