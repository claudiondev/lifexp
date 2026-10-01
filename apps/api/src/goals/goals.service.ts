import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  todayIn,
  type CivilDate,
  type CreateGoalInput,
  type Goal,
  type GoalStatus,
  type UpdateGoalInput,
} from '@lifexp/shared';
import { fromCivil } from '../blocks/blocks.mapper.js';
import { CLOCK, type Clock } from '../clock/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { STATUS_TO_DB, toGoalResponse, type GoalWithMilestones } from './goal.mapper.js';

const NOT_FOUND = 'Meta não encontrada';
const MILESTONE_NOT_FOUND = 'Marco não encontrado';
const AREA_ARCHIVED = 'A área está arquivada. Restaure a área primeiro';
const METRIC_REQUIRED = 'Valor atual e unidade só existem junto com um valor-alvo';

const WITH_MILESTONES = { milestones: true } as const;

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
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

  async remove(userId: string, id: string): Promise<void> {
    // Idempotente: excluir uma meta que não existe mais (ou que não é sua) não é erro.
    await this.prisma.goal.deleteMany({ where: { id, userId } });
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
    await this.findMilestoneOrThrow(userId, goalId, milestoneId);
    await this.prisma.milestone.update({ where: { id: milestoneId }, data: { title } });
    return this.get(userId, goalId);
  }

  async removeMilestone(userId: string, goalId: string, milestoneId: string): Promise<Goal> {
    await this.findMilestoneOrThrow(userId, goalId, milestoneId);
    await this.prisma.milestone.delete({ where: { id: milestoneId } });
    return this.get(userId, goalId);
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

  private async findMilestoneOrThrow(userId: string, goalId: string, milestoneId: string) {
    const milestone = await this.prisma.milestone.findFirst({
      where: { id: milestoneId, goalId, goal: { userId } },
    });
    if (!milestone) throw new NotFoundException(MILESTONE_NOT_FOUND);
    return milestone;
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
