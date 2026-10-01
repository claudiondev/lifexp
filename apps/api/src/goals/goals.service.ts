import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GOAL_XP,
  MILESTONE_XP,
  levelForXp,
  levelProgress,
  todayIn,
  type CivilDate,
  type CreateGoalInput,
  type Goal,
  type GoalActionResult,
  type GoalStatus,
  type UpdateGoalInput,
} from '@lifexp/shared';
import { fromCivil } from '../blocks/blocks.mapper.js';
import { CLOCK, type Clock } from '../clock/clock.js';
import { XpLedgerService, type LedgerResult, type Tx } from '../gamification/xp-ledger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { statusXpEffect, type GoalStatus as GoalStatusDb } from './domain/goal-rules.js';
import { STATUS_TO_DB, toGoalResponse, type GoalWithMilestones } from './goal.mapper.js';

const NOT_FOUND = 'Meta não encontrada';
const MILESTONE_NOT_FOUND = 'Marco não encontrado';
const AREA_ARCHIVED = 'A área está arquivada. Restaure a área primeiro';
const METRIC_REQUIRED = 'Valor atual e unidade só existem junto com um valor-alvo';

const MILESTONE_CLOSED =
  'A meta está concluída ou abandonada. Reabra a meta antes de mexer nos marcos concluídos';
const WITH_MILESTONES = { milestones: true } as const;

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ledger: XpLedgerService,
  ) {}

  async list(userId: string, status?: GoalStatus): Promise<Goal[]> {
    const goals = await this.prisma.goal.findMany({
      where: { userId, ...(status && { status: STATUS_TO_DB[status] }) },
      include: WITH_MILESTONES,
      orderBy: [{ createdAt: 'asc' }],
    });
    return this.present(userId, goals);
  }

  async get(userId: string, id: string): Promise<Goal> {
    const goal = await this.findOwnedOrThrow(userId, id);
    return (await this.present(userId, [goal]))[0]!;
  }

  async create(userId: string, input: CreateGoalInput): Promise<Goal> {
    if (input.areaId) await this.assertAreaUsable(userId, input.areaId);
    const goal = await this.prisma.goal.create({
      data: {
        userId,
        title: input.title,
        description: input.description ?? null,
        areaId: input.areaId ?? null,
        deadline: input.deadline ? fromCivil(input.deadline) : null,
        targetValue: input.targetValue ?? null,
        currentValue: input.targetValue != null ? (input.currentValue ?? 0) : null,
        unit: input.targetValue != null ? (input.unit ?? null) : null,
      },
      include: WITH_MILESTONES,
    });
    return (await this.present(userId, [goal]))[0]!;
  }

  async update(userId: string, id: string, input: UpdateGoalInput): Promise<Goal> {
    const current = await this.findOwnedOrThrow(userId, id);
    if (input.areaId && input.areaId !== current.areaId) {
      await this.assertAreaUsable(userId, input.areaId);
    }

    // A métrica é um conjunto (alvo + atual + unidade): sem alvo, o resto não existe.
    const targetValue = input.targetValue !== undefined ? input.targetValue : current.targetValue;
    const metric =
      targetValue === null
        ? { targetValue: null, currentValue: null, unit: null }
        : {
            targetValue,
            // Ao criar a métrica numa meta que não tinha, o valor atual começa em 0.
            currentValue: input.currentValue ?? current.currentValue ?? 0,
            unit: input.unit !== undefined ? input.unit : current.unit,
          };
    if (targetValue === null && (input.currentValue != null || input.unit != null)) {
      throw new BadRequestException(METRIC_REQUIRED);
    }

    const goal = await this.prisma.goal.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.areaId !== undefined && { areaId: input.areaId }),
        ...(input.deadline !== undefined && {
          deadline: input.deadline ? fromCivil(input.deadline) : null,
        }),
        ...metric,
      },
      include: WITH_MILESTONES,
    });
    return (await this.present(userId, [goal]))[0]!;
  }

  /**
   * Exclui a meta e seus marcos. O XP que ela e os marcos renderam volta (estornos no livro-caixa):
   * senão criar e concluir metas para depois apagá-las seria XP de graça. Idempotente.
   */
  async remove(userId: string, id: string): Promise<void> {
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await this.ledger.lockUser(tx, userId);
      const goal = await tx.goal.findFirst({ where: { id, userId }, include: WITH_MILESTONES });
      if (!goal) return;

      // Mesma ordem de trava da edição de bloco (bloco primeiro, depois a meta): sem deadlock com
      // um bloco sendo vinculado a esta meta no mesmo instante.
      await tx.$queryRaw`SELECT "id" FROM "Block" WHERE "goalId" = ${id} FOR UPDATE`;

      const entries = await tx.xpTransaction.findMany({
        where: {
          userId,
          type: { in: ['MILESTONE', 'GOAL'] },
          sourceId: { in: [goal.id, ...goal.milestones.map((m) => m.id)] },
          reversal: null,
        },
      });
      for (const entry of entries) await this.ledger.reverse(tx, entry, now);
      await tx.goal.delete({ where: { id } });
    });
  }

  async addMilestone(userId: string, goalId: string, title: string): Promise<Goal> {
    await this.findOwnedOrThrow(userId, goalId);
    const last = await this.prisma.milestone.aggregate({
      where: { goalId },
      _max: { position: true },
    });
    await this.prisma.milestone.create({
      data: { goalId, title, position: (last._max.position ?? -1) + 1 },
    });
    return this.get(userId, goalId);
  }

  async renameMilestone(
    userId: string,
    goalId: string,
    milestoneId: string,
    title: string,
  ): Promise<Goal> {
    await this.findMilestoneOrThrow(this.prisma, userId, goalId, milestoneId);
    await this.prisma.milestone.update({ where: { id: milestoneId }, data: { title } });
    return this.get(userId, goalId);
  }

  async removeMilestone(userId: string, goalId: string, milestoneId: string): Promise<Goal> {
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await this.ledger.lockUser(tx, userId);
      const milestone = await this.findMilestoneOrThrow(tx, userId, goalId, milestoneId);
      if (milestone.done) {
        // Um marco concluído apagado leva o XP dele junto.
        const entry = await this.ledger.findActiveEntry(tx, milestone.id, 'MILESTONE');
        if (entry) await this.ledger.reverse(tx, entry, now);
      }
      await tx.milestone.delete({ where: { id: milestoneId } });
    });
    return this.get(userId, goalId);
  }

  /** Conclui um marco (+100 XP, RN21). Idempotente: concluir de novo não dá XP de novo. */
  async completeMilestone(
    userId: string,
    goalId: string,
    milestoneId: string,
  ): Promise<GoalActionResult> {
    const now = this.clock.now();
    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.ledger.lockUser(tx, userId);
      const milestone = await this.findMilestoneOrThrow(tx, userId, goalId, milestoneId);
      if (milestone.done) return null;
      this.assertMilestonesOpen(milestone.goal.status);

      await tx.milestone.update({ where: { id: milestone.id }, data: { done: true, doneAt: now } });
      return this.ledger.credit(tx, {
        userId,
        areaId: milestone.goal.areaId,
        amount: MILESTONE_XP,
        type: 'MILESTONE',
        sourceId: milestone.id,
        createdAt: now,
      });
    });
    return this.respond(userId, goalId, outcome, MILESTONE_XP);
  }

  /** Desfaz a conclusão de um marco: estorna os 100 XP. Idempotente. */
  async undoMilestone(
    userId: string,
    goalId: string,
    milestoneId: string,
  ): Promise<GoalActionResult> {
    const now = this.clock.now();
    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.ledger.lockUser(tx, userId);
      const milestone = await this.findMilestoneOrThrow(tx, userId, goalId, milestoneId);
      if (!milestone.done) return null;
      this.assertMilestonesOpen(milestone.goal.status);

      const entry = await this.ledger.findActiveEntry(tx, milestone.id, 'MILESTONE');
      await tx.milestone.update({
        where: { id: milestone.id },
        data: { done: false, doneAt: null },
      });
      return entry ? this.ledger.reverse(tx, entry, now) : null;
    });
    return this.respond(userId, goalId, outcome, -MILESTONE_XP);
  }

  /**
   * Muda o status (RF31). Concluir concede o XP da meta (+500, RN21) e reabrir uma meta concluída
   * estorna esse XP. A meta nunca conclui sozinha: é sempre uma decisão da pessoa.
   */
  async setStatus(userId: string, id: string, to: GoalStatus): Promise<GoalActionResult> {
    const now = this.clock.now();
    const target = STATUS_TO_DB[to];
    let delta = 0;
    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.ledger.lockUser(tx, userId);
      const goal = await tx.goal.findFirst({ where: { id, userId } });
      if (!goal) throw new NotFoundException(NOT_FOUND);

      const effect = statusXpEffect(goal.status as GoalStatusDb, target as GoalStatusDb);
      if (goal.status === target) return null;

      await tx.goal.update({
        where: { id },
        data: { status: target, completedAt: target === 'COMPLETED' ? now : null },
      });
      if (effect === 'award') {
        delta = GOAL_XP;
        return this.ledger.credit(tx, {
          userId,
          areaId: goal.areaId,
          amount: GOAL_XP,
          type: 'GOAL',
          sourceId: goal.id,
          createdAt: now,
        });
      }
      if (effect === 'reverse') {
        const entry = await this.ledger.findActiveEntry(tx, goal.id, 'GOAL');
        if (!entry) return null;
        delta = -entry.amount;
        return this.ledger.reverse(tx, entry, now);
      }
      return null;
    });
    return this.respond(userId, id, outcome, delta);
  }

  /** Toda leitura/escrita filtra pelo dono (RS06): meta alheia responde 404, como uma inexistente. */
  private async findOwnedOrThrow(userId: string, id: string): Promise<GoalWithMilestones> {
    const goal = await this.prisma.goal.findFirst({
      where: { id, userId },
      include: WITH_MILESTONES,
    });
    if (!goal) throw new NotFoundException(NOT_FOUND);
    return goal;
  }

  private async findMilestoneOrThrow(tx: Tx, userId: string, goalId: string, milestoneId: string) {
    const milestone = await tx.milestone.findFirst({
      where: { id: milestoneId, goalId, goal: { userId } },
      include: { goal: true },
    });
    if (!milestone) throw new NotFoundException(MILESTONE_NOT_FOUND);
    return milestone;
  }

  /** Concluir ou desfazer marco só vale numa meta em andamento (ativa ou pausada). */
  private assertMilestonesOpen(status: string): void {
    if (status === 'COMPLETED' || status === 'ABANDONED') {
      throw new ConflictException(MILESTONE_CLOSED);
    }
  }

  /** A meta atualizada e o XP do momento; sem lançamento novo (ação repetida), delta 0. */
  private async respond(
    userId: string,
    goalId: string,
    outcome: LedgerResult | null,
    appliedDelta: number,
  ): Promise<GoalActionResult> {
    const goal = await this.get(userId, goalId);
    if (outcome) {
      return {
        goal,
        xpDelta: appliedDelta,
        levelBefore: outcome.change.levelBefore,
        levelAfter: outcome.change.levelAfter,
        total: outcome.total,
      };
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { cachedTotalXp: true },
    });
    const level = levelForXp(user.cachedTotalXp);
    return {
      goal,
      xpDelta: 0,
      levelBefore: level,
      levelAfter: level,
      total: levelProgress(user.cachedTotalXp),
    };
  }

  private async assertAreaUsable(userId: string, areaId: string): Promise<void> {
    const area = await this.prisma.area.findFirst({ where: { id: areaId, userId } });
    if (!area) throw new NotFoundException('Área não encontrada');
    if (area.archivedAt !== null) throw new ConflictException(AREA_ARCHIVED);
  }

  /** Monta a resposta: minutos investidos (RN35) e o dia de hoje no fuso da pessoa (RN22). */
  private async present(userId: string, goals: GoalWithMilestones[]): Promise<Goal[]> {
    if (goals.length === 0) return [];
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    const today: CivilDate = todayIn(user.timezone, this.clock.now());
    const minutes = await this.investedMinutes(
      userId,
      goals.map((goal) => goal.id),
    );
    return goals.map((goal) => toGoalResponse(goal, minutes.get(goal.id) ?? 0, today));
  }

  /** Soma da duração (a "foto" da conclusão) das conclusões ativas dos blocos ligados a cada meta. */
  private async investedMinutes(userId: string, goalIds: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<{ goalId: string; minutes: bigint }[]>`
      SELECT b."goalId" AS "goalId", SUM(c."durationMin") AS "minutes"
      FROM "Completion" c
      JOIN "Block" b ON b."id" = c."blockId"
      WHERE c."userId" = ${userId}
        AND c."undoneAt" IS NULL
        AND b."goalId" = ANY(${goalIds})
      GROUP BY b."goalId"`;
    return new Map(rows.map((row) => [row.goalId, Number(row.minutes)]));
  }
}
