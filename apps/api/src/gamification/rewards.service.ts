import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  MAX_REWARDS,
  levelForXp,
  type AchievementKey,
  type CreateRewardInput,
  type Reward,
  type RewardRef,
  type RewardTrigger,
  type UpdateRewardInput,
} from '@lifexp/shared';
import { CLOCK, type Clock } from '../clock/clock.js';
import type { Reward as RewardEntity } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isRewardReached, type RewardFacts } from './domain/achievements.js';
import { StreakService } from './streak.service.js';
import { XpLedgerService, type Tx } from './xp-ledger.service.js';

const NOT_FOUND = 'Recompensa não encontrada';
const LIMIT_REACHED = `Você já tem ${MAX_REWARDS} recompensas. Exclua alguma para criar outra`;
const NOT_REACHED = 'Esta recompensa ainda não foi desbloqueada';

const TRIGGER_TO_DB = {
  level: 'LEVEL',
  streak: 'STREAK',
  total_xp: 'TOTAL_XP',
  achievement: 'ACHIEVEMENT',
} as const;

/** O gatilho que a linha do banco guarda, no formato da API. */
export function toTrigger(row: RewardEntity): RewardTrigger {
  switch (row.trigger) {
    case 'LEVEL':
      return { type: 'level', threshold: row.threshold! };
    case 'STREAK':
      return { type: 'streak', threshold: row.threshold! };
    case 'TOTAL_XP':
      return { type: 'total_xp', threshold: row.threshold! };
    case 'ACHIEVEMENT':
      return { type: 'achievement', achievementKey: row.achievementKey as AchievementKey };
  }
}

export function toReward(row: RewardEntity): Reward {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    trigger: toTrigger(row),
    status: row.redeemedAt ? 'redeemed' : row.reachedAt ? 'available' : 'locked',
    reachedAt: row.reachedAt?.toISOString() ?? null,
    redeemedAt: row.redeemedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Recompensas reais (RF25): prêmios que a própria pessoa cadastra e se dá ao atingir um gatilho (nível geral,
 * XP total, streak ou uma conquista). O momento em que o gatilho é atingido fica gravado em `reachedAt` e não
 * some se o streak cair depois (recompensar, nunca punir); o resgate é sempre uma decisão manual.
 */
@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: XpLedgerService,
    private readonly streak: StreakService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(userId: string): Promise<Reward[]> {
    const rows = await this.prisma.reward.findMany({ where: { userId }, orderBy: { id: 'desc' } });
    return rows.map(toReward);
  }

  async create(userId: string, input: CreateRewardInput): Promise<Reward> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      // Trava a pessoa: o limite de 50 vale mesmo com pedidos simultâneos.
      await this.ledger.lockUser(tx, userId);
      if ((await tx.reward.count({ where: { userId } })) >= MAX_REWARDS) {
        throw new ConflictException(LIMIT_REACHED);
      }
      const { trigger } = input;
      const created = await tx.reward.create({
        data: {
          userId,
          title: input.title,
          description: input.description ?? null,
          trigger: TRIGGER_TO_DB[trigger.type],
          threshold: trigger.type === 'achievement' ? null : trigger.threshold,
          achievementKey: trigger.type === 'achievement' ? trigger.achievementKey : null,
        },
      });
      // Um gatilho que a pessoa já atingiu nasce desbloqueado.
      await this.refresh(tx, userId, now);
      return toReward(await tx.reward.findUniqueOrThrow({ where: { id: created.id } }));
    });
  }

  async update(userId: string, id: string, input: UpdateRewardInput): Promise<Reward> {
    const found = await this.prisma.reward.findFirst({ where: { id, userId } });
    if (!found) throw new NotFoundException(NOT_FOUND);
    const updated = await this.prisma.reward.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
      },
    });
    return toReward(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.reward.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException(NOT_FOUND);
  }

  /** Resgata uma recompensa já desbloqueada. Idempotente: resgatar de novo devolve o resgate existente. */
  async redeem(userId: string, id: string): Promise<Reward> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      await this.ledger.lockUser(tx, userId);
      const row = await tx.reward.findFirst({ where: { id, userId } });
      if (!row) throw new NotFoundException(NOT_FOUND);
      if (row.redeemedAt) return toReward(row);
      if (!row.reachedAt) throw new ConflictException(NOT_REACHED);
      return toReward(await tx.reward.update({ where: { id }, data: { redeemedAt: now } }));
    });
  }

  /**
   * Marca como atingidas as recompensas pendentes cujo gatilho já vale. Roda na transação de tudo o que pode
   * atingi-los (concluir bloco, marco, meta, quest) e ao criar uma recompensa. `known` evita reler o que quem
   * chama já sabe; o streak só é calculado se alguma recompensa pendente depende dele.
   */
  async refresh(
    tx: Tx,
    userId: string,
    now: Date,
    known: { bestStreak?: number; unlocked?: ReadonlySet<AchievementKey> } = {},
  ): Promise<RewardRef[]> {
    const pending = await tx.reward.findMany({ where: { userId, reachedAt: null } });
    if (pending.length === 0) return [];

    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { cachedTotalXp: true },
    });
    const unlocked =
      known.unlocked ??
      new Set(
        (await tx.achievement.findMany({ where: { userId }, select: { key: true } })).map(
          (row) => row.key as AchievementKey,
        ),
      );
    let bestStreak = known.bestStreak;
    if (bestStreak === undefined && pending.some((row) => row.trigger === 'STREAK')) {
      bestStreak = (await this.streak.getStreak(userId, tx)).best;
    }
    const facts: RewardFacts = {
      level: levelForXp(user.cachedTotalXp),
      totalXp: user.cachedTotalXp,
      bestStreak: bestStreak ?? 0,
      unlocked,
    };

    const reached = pending.filter((row) => isRewardReached(toTrigger(row), facts));
    if (reached.length === 0) return [];
    await tx.reward.updateMany({
      where: { id: { in: reached.map((row) => row.id) }, reachedAt: null },
      data: { reachedAt: now },
    });
    return reached.map((row) => ({ id: row.id, title: row.title }));
  }
}
