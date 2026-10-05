import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  MAX_OPEN_TASKS,
  MAX_TASK_ITEMS,
  TASK_DAILY_XP_CAP,
  creditableTaskXp,
  levelProgress,
  todayIn,
  type AreaProgress,
  type CreateTaskInput,
  type CreateTaskItemInput,
  type LevelProgressDto,
  type Task,
  type TaskCompletionResult,
  type TaskList,
  type TaskUndoResult,
  type UpdateTaskInput,
  type UpdateTaskItemInput,
} from '@lifexp/shared';
import { fromCivil } from '../blocks/blocks.mapper.js';
import { CLOCK, type Clock } from '../clock/clock.js';
import { dayBounds } from '../gamification/domain/completion-window.js';
import { XpLedgerService, type Tx } from '../gamification/xp-ledger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { belongsToInbox, belongsToToday, sortTasks } from './domain/task-lists.js';
import { fromPriority, toTaskDto, toTaskFacts, type TaskWithItems } from './tasks.mapper.js';

const NOT_FOUND = 'Tarefa não encontrada';
const ITEM_NOT_FOUND = 'Passo não encontrado';
const GOAL_CLOSED = 'A meta está concluída ou abandonada. Reabra a meta para vincular tarefas';
const TOO_MANY_OPEN = `Você já tem ${MAX_OPEN_TASKS} tarefas em aberto. Conclua ou arquive algumas antes de criar outra`;
const TOO_MANY_ITEMS = `Uma tarefa pode ter no máximo ${MAX_TASK_ITEMS} passos`;

const WITH_ITEMS = { items: true } as const;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ledger: XpLedgerService,
  ) {}

  /**
   * Lista de Hoje (em aberto até hoje, e as concluídas hoje) ou Pendentes (em aberto e sem dia). "Vinda de ontem" é
   * derivado: nada é gravado quando o dia vira. As abertas de uma pessoa são limitadas (MAX_OPEN_TASKS), então a consulta
   * traz todas as abertas e as regras puras de `domain/` decidem o que entra.
   */
  async list(userId: string, scope: 'today' | 'inbox'): Promise<TaskList> {
    const now = this.clock.now();
    const { timezone } = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    const today = todayIn(timezone, now);
    const { startsAt } = dayBounds(today, timezone);

    const rows = await this.prisma.task.findMany({
      where: {
        userId,
        archivedAt: null,
        OR: [
          { completedAt: null },
          ...(scope === 'today' ? [{ completedAt: { gte: startsAt } }] : []),
        ],
      },
      include: WITH_ITEMS,
    });
    const kept = rows.filter((row) => {
      const facts = toTaskFacts(row, timezone);
      return scope === 'today' ? belongsToToday(facts, today) : belongsToInbox(facts);
    });
    const ordered = sortTasks(kept.map((row) => ({ row, ...toTaskFacts(row, timezone) })));
    return {
      tasks: ordered.map(({ row }) => toTaskDto(row, timezone, today)),
      xpToday: await this.xpUsedToday(this.prisma, userId, timezone, now),
      xpCap: TASK_DAILY_XP_CAP,
    };
  }

  async create(userId: string, input: CreateTaskInput): Promise<Task> {
    return this.prisma.$transaction(async (tx) => {
      // Serializa as escritas da pessoa: o limite de tarefas em aberto vale com pedidos simultâneos.
      const timezone = await this.ledger.lockUser(tx, userId);
      if (input.areaId) await this.assertAreaUsable(tx, userId, input.areaId);
      // A meta fica travada (FOR KEY SHARE) até a tarefa ser gravada: excluir a meta no meio não deixa o vínculo
      // apontar para uma meta que sumiu (violação de chave estrangeira, erro 500).
      if (input.goalId) await this.lockGoalForLink(tx, userId, input.goalId);

      const open = await tx.task.count({ where: { userId, archivedAt: null, completedAt: null } });
      if (open >= MAX_OPEN_TASKS) throw new ConflictException(TOO_MANY_OPEN);

      const created = await tx.task.create({
        data: {
          userId,
          title: input.title,
          note: input.note ?? null,
          dueDate: input.dueDate ? fromCivil(input.dueDate) : null,
          priority: fromPriority(input.priority),
          areaId: input.areaId ?? null,
          goalId: input.goalId ?? null,
        },
        include: WITH_ITEMS,
      });
      return toTaskDto(created, timezone, todayIn(timezone, this.clock.now()));
    });
  }

  async update(userId: string, id: string, input: UpdateTaskInput): Promise<Task> {
    return this.prisma.$transaction(async (tx) => {
      const timezone = await this.ledger.lockUser(tx, userId);
      const current = await this.findOwnedOrThrow(tx, userId, id);
      if (input.areaId && input.areaId !== current.areaId) {
        await this.assertAreaUsable(tx, userId, input.areaId);
      }
      if (input.goalId && input.goalId !== current.goalId) {
        await this.lockGoalForLink(tx, userId, input.goalId);
      }

      const updated = await tx.task.update({
        where: { id },
        data: {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.note !== undefined && { note: input.note }),
          ...(input.dueDate !== undefined && {
            dueDate: input.dueDate === null ? null : fromCivil(input.dueDate),
          }),
          ...(input.priority !== undefined && { priority: fromPriority(input.priority) }),
          ...(input.areaId !== undefined && { areaId: input.areaId }),
          ...(input.goalId !== undefined && { goalId: input.goalId }),
        },
        include: WITH_ITEMS,
      });
      return toTaskDto(updated, timezone, todayIn(timezone, this.clock.now()));
    });
  }

  /** Arquiva (RN27: nunca excluir). Idempotente: arquivar de novo não é erro. O XP já ganho não é mexido. */
  async archive(userId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.ledger.lockUser(tx, userId);
      const task = await tx.task.findFirst({ where: { id, userId }, select: { archivedAt: true } });
      if (!task) throw new NotFoundException(NOT_FOUND);
      if (task.archivedAt) return;
      await tx.task.update({ where: { id }, data: { archivedAt: this.clock.now() } });
    });
  }

  /**
   * Conclui a tarefa. Idempotente: concluir de novo devolve o estado atual, sem XP novo. XP + lançamento no
   * livro-caixa + caches saem numa única transação (RN30); o teto diário limita o que a conclusão rende.
   */
  async complete(userId: string, id: string): Promise<TaskCompletionResult> {
    const now = this.clock.now(); // lido uma vez: o que validamos é o que gravamos
    return this.prisma.$transaction(async (tx) => {
      const timezone = await this.ledger.lockUser(tx, userId);
      const task = await this.findOwnedOrThrow(tx, userId, id);
      const today = todayIn(timezone, now);

      if (task.completedAt) {
        const snapshot = await this.progressSnapshot(tx, userId, task.areaId);
        return {
          task: toTaskDto(task, timezone, today),
          alreadyCompleted: true,
          xpAwarded: 0,
          capped: false,
          levelBefore: snapshot.total.level,
          levelAfter: snapshot.total.level,
          total: snapshot.total,
          area: snapshot.area,
        };
      }

      const priority = toTaskFacts(task, timezone).priority;
      const used = await this.xpUsedToday(tx, userId, timezone, now);
      const amount = creditableTaskXp(priority, used);
      const fullAmount = creditableTaskXp(priority, 0);

      let levelBefore: number;
      let levelAfter: number;
      let total: LevelProgressDto;
      let area: AreaProgress | null;
      if (amount > 0) {
        const credited = await this.ledger.credit(tx, {
          userId,
          areaId: task.areaId,
          amount,
          type: 'TASK',
          sourceId: task.id,
          createdAt: now,
        });
        ({ total, area } = credited);
        levelBefore = credited.change.levelBefore;
        levelAfter = credited.change.levelAfter;
      } else {
        // Teto do dia atingido: a tarefa conclui normalmente, só não rende XP (nada vai ao livro-caixa).
        const snapshot = await this.progressSnapshot(tx, userId, task.areaId);
        ({ total, area } = snapshot);
        levelBefore = levelAfter = snapshot.total.level;
      }

      const updated = await tx.task.update({
        where: { id },
        data: { completedAt: now, xpAwarded: amount },
        include: WITH_ITEMS,
      });
      return {
        task: toTaskDto(updated, timezone, today),
        alreadyCompleted: false,
        xpAwarded: amount,
        capped: amount < fullAmount,
        levelBefore,
        levelAfter,
        total,
        area,
      };
    });
  }

  /** Desfaz a conclusão e estorna o XP creditado (RN06). Idempotente: desfazer uma tarefa aberta não faz nada. */
  async undo(userId: string, id: string): Promise<TaskUndoResult> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const timezone = await this.ledger.lockUser(tx, userId);
      const task = await this.findOwnedOrThrow(tx, userId, id);
      const today = todayIn(timezone, now);

      if (!task.completedAt) {
        const snapshot = await this.progressSnapshot(tx, userId, task.areaId);
        return {
          task: toTaskDto(task, timezone, today),
          xpReverted: 0,
          total: snapshot.total,
          area: snapshot.area,
        };
      }

      // Conclusão com o teto atingido não lançou nada: não há o que estornar.
      const original = await this.ledger.findActiveEntry(tx, task.id, 'TASK');
      const reverted = original ? await this.ledger.reverse(tx, original, now) : null;
      const snapshot = reverted ?? (await this.progressSnapshot(tx, userId, task.areaId));

      const updated = await tx.task.update({
        where: { id },
        data: { completedAt: null, xpAwarded: 0 },
        include: WITH_ITEMS,
      });
      return {
        task: toTaskDto(updated, timezone, today),
        xpReverted: original?.amount ?? 0,
        total: snapshot.total,
        area: snapshot.area,
      };
    });
  }

  async addItem(userId: string, taskId: string, input: CreateTaskItemInput): Promise<Task> {
    return this.prisma.$transaction(async (tx) => {
      // Mesma trava das demais escritas: o limite de passos vale com pedidos simultâneos.
      const timezone = await this.ledger.lockUser(tx, userId);
      await this.findOwnedOrThrow(tx, userId, taskId);
      const items = await tx.taskItem.findMany({
        where: { taskId },
        select: { position: true },
      });
      if (items.length >= MAX_TASK_ITEMS) throw new ConflictException(TOO_MANY_ITEMS);
      const position = items.reduce((max, item) => Math.max(max, item.position + 1), 0);
      await tx.taskItem.create({ data: { taskId, title: input.title, position } });
      return this.reload(tx, taskId, timezone);
    });
  }

  async updateItem(
    userId: string,
    taskId: string,
    itemId: string,
    input: UpdateTaskItemInput,
  ): Promise<Task> {
    return this.prisma.$transaction(async (tx) => {
      const timezone = await this.ledger.lockUser(tx, userId);
      await this.findOwnedOrThrow(tx, userId, taskId);
      const item = await tx.taskItem.findFirst({ where: { id: itemId, taskId } });
      if (!item) throw new NotFoundException(ITEM_NOT_FOUND);
      await tx.taskItem.update({
        where: { id: itemId },
        data: {
          ...(input.title !== undefined && { title: input.title }),
          // Marcar de novo um passo já marcado mantém o instante original.
          ...(input.done === true && !item.doneAt && { doneAt: this.clock.now() }),
          ...(input.done === false && { doneAt: null }),
        },
      });
      return this.reload(tx, taskId, timezone);
    });
  }

  async removeItem(userId: string, taskId: string, itemId: string): Promise<Task> {
    return this.prisma.$transaction(async (tx) => {
      const timezone = await this.ledger.lockUser(tx, userId);
      await this.findOwnedOrThrow(tx, userId, taskId);
      const removed = await tx.taskItem.deleteMany({ where: { id: itemId, taskId } });
      if (removed.count === 0) throw new NotFoundException(ITEM_NOT_FOUND);
      return this.reload(tx, taskId, timezone);
    });
  }

  private async reload(tx: Tx, taskId: string, timezone: string): Promise<Task> {
    const task = await tx.task.findUniqueOrThrow({ where: { id: taskId }, include: WITH_ITEMS });
    return toTaskDto(task, timezone, todayIn(timezone, this.clock.now()));
  }

  /** Tarefa da própria pessoa e não arquivada; de outra pessoa, arquivada ou inexistente é sempre 404 (RS06). */
  private async findOwnedOrThrow(tx: Tx, userId: string, id: string): Promise<TaskWithItems> {
    const task = await tx.task.findFirst({
      where: { id, userId, archivedAt: null },
      include: WITH_ITEMS,
    });
    if (!task) throw new NotFoundException(NOT_FOUND);
    return task;
  }

  /**
   * XP de tarefas já creditado no dia LOCAL da pessoa: lançamentos TASK de hoje ainda não estornados. Estornar libera
   * espaço no teto.
   */
  private async xpUsedToday(
    db: Tx | PrismaService,
    userId: string,
    timezone: string,
    now: Date,
  ): Promise<number> {
    const { startsAt, endsAt } = dayBounds(todayIn(timezone, now), timezone);
    const result = await db.xpTransaction.aggregate({
      where: {
        userId,
        type: 'TASK',
        reversal: null,
        createdAt: { gte: startsAt, lt: endsAt },
      },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  }

  /** Nível geral e da área (do cache, que bate com o livro-caixa) quando nenhum lançamento foi feito. */
  private async progressSnapshot(
    tx: Tx,
    userId: string,
    areaId: string | null,
  ): Promise<{ total: LevelProgressDto; area: AreaProgress | null }> {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { cachedTotalXp: true },
    });
    const total = levelProgress(user.cachedTotalXp);
    if (areaId === null) return { total, area: null };
    const progress = await tx.areaProgress.findUnique({ where: { areaId } });
    return { total, area: { areaId, ...levelProgress(progress?.cachedXp ?? 0) } };
  }

  private async assertAreaUsable(tx: Tx, userId: string, areaId: string): Promise<void> {
    const area = await tx.area.findFirst({ where: { id: areaId, userId }, select: { id: true } });
    if (!area) throw new NotFoundException('Área não encontrada');
  }

  /** Trava a meta enquanto o vínculo é gravado; meta de outra pessoa é 404, e meta encerrada não recebe tarefas. */
  private async lockGoalForLink(tx: Tx, userId: string, goalId: string): Promise<void> {
    const rows = await tx.$queryRaw<{ status: string }[]>`
      SELECT "status"::text AS "status" FROM "Goal"
      WHERE "id" = ${goalId} AND "userId" = ${userId} FOR KEY SHARE`;
    const goal = rows[0];
    if (!goal) throw new NotFoundException('Meta não encontrada');
    if (goal.status === 'COMPLETED' || goal.status === 'ABANDONED') {
      throw new ConflictException(GOAL_CLOSED);
    }
  }
}
