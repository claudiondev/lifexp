import { Inject, Injectable } from '@nestjs/common';
import {
  ACHIEVEMENT_CATALOG,
  ACHIEVEMENT_KEYS,
  todayIn,
  type Achievement,
  type AchievementKey,
  type CivilDate,
  type RewardRef,
} from '@lifexp/shared';
import { CLOCK, type Clock } from '../clock/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  achievementProgress,
  isBalancedWeek,
  isRestArea,
  newlyUnlocked,
  type AchievementFacts,
} from './domain/achievements.js';
import { buildStreakDays, computeStreak } from './domain/streak.js';
import { OccurrenceHistoryService } from './occurrence-history.service.js';
import { RewardsService } from './rewards.service.js';
import type { Tx } from './xp-ledger.service.js';

/** O que uma verificação desbloqueou: conquistas novas e recompensas cujo gatilho foi atingido. */
export interface Unlocks {
  achievements: AchievementKey[];
  rewards: RewardRef[];
}
export const NO_UNLOCKS: Unlocks = { achievements: [], rewards: [] };

const NEUTRAL: AchievementFacts = {
  completionCount: 0,
  questCompletedCount: 0,
  bestStreak: 0,
  maxAreaMinutes: 0,
  restCount: 0,
  completedGoalCount: 0,
  balancedWeekReached: false,
};

/**
 * Conquistas (RF23). O catálogo é fixo; aqui se decide, na transação de cada coisa que pode merecer uma conquista
 * (concluir bloco, meta ou quest), quais foram desbloqueadas. Conquistas são permanentes: desfazer depois não
 * retira nenhuma (recompensar, nunca punir). Só os fatos das conquistas que ainda faltam são lidos do banco.
 */
@Injectable()
export class AchievementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: OccurrenceHistoryService,
    private readonly rewards: RewardsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Verifica e grava as conquistas que os fatos atuais já merecem e, em seguida, as recompensas pendentes.
   * Chamar DENTRO da transação, depois do que mudou o estado (XP, conclusão, status da meta). `weekStart` é a
   * semana a olhar para "Equilibrado" (a da conclusão que acabou de acontecer).
   */
  async evaluate(
    tx: Tx,
    userId: string,
    now: Date,
    context: { weekStart?: CivilDate } = {},
  ): Promise<Unlocks> {
    const have = new Set(
      (await tx.achievement.findMany({ where: { userId }, select: { key: true } })).map(
        (row) => row.key as AchievementKey,
      ),
    );
    const missing = ACHIEVEMENT_KEYS.filter((key) => !have.has(key));

    const facts = { ...NEUTRAL };
    let bestStreakKnown: number | undefined;
    if (missing.length > 0)
      bestStreakKnown = await this.loadFacts(tx, userId, missing, context, facts);

    const fresh = newlyUnlocked(facts, have);
    if (fresh.length > 0) {
      await tx.achievement.createMany({
        data: fresh.map((key) => ({ userId, key, unlockedAt: now })),
        skipDuplicates: true,
      });
    }
    const rewards = await this.rewards.refresh(tx, userId, now, {
      unlocked: new Set([...have, ...fresh]),
      bestStreak: bestStreakKnown,
    });
    return { achievements: fresh, rewards };
  }

  /** Lê só o necessário para as conquistas que faltam; devolve o melhor streak se chegou a calculá-lo. */
  private async loadFacts(
    tx: Tx,
    userId: string,
    missing: readonly AchievementKey[],
    context: { weekStart?: CivilDate },
    facts: AchievementFacts,
  ): Promise<number | undefined> {
    const needs = (...keys: AchievementKey[]) => keys.some((key) => missing.includes(key));

    if (needs('first_step')) {
      facts.completionCount = await tx.completion.count({ where: { userId, undoneAt: null } });
    }
    if (needs('full_week')) {
      facts.questCompletedCount = await tx.weeklyQuest.count({
        where: { userId, status: 'COMPLETED' },
      });
    }
    if (needs('dream_realized')) {
      facts.completedGoalCount = await tx.goal.count({ where: { userId, status: 'COMPLETED' } });
    }
    if (needs('hundred_hours')) facts.maxAreaMinutes = await this.maxAreaMinutes(tx, userId);
    if (needs('deserved_rest')) facts.restCount = await this.restCount(tx, userId);

    const wantsStreak = needs('constant', 'unshakeable');
    const wantsBalance = needs('balanced') && context.weekStart !== undefined;
    if (!wantsStreak && !wantsBalance) return undefined;

    // Um só carregamento do histórico serve ao streak e à semana equilibrada.
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    const today = todayIn(user.timezone, this.clock.now());
    const { occurrences, completedKeys } = await this.history.load(userId, today, undefined, tx);
    const best = computeStreak(buildStreakDays(occurrences, completedKeys), today).best;
    facts.bestStreak = best;
    if (wantsBalance) {
      const active = await tx.area.findMany({
        where: { userId, archivedAt: null },
        select: { id: true },
      });
      facts.balancedWeekReached = isBalancedWeek(
        occurrences,
        completedKeys,
        active.map((area) => area.id),
        context.weekStart!,
      );
    }
    return best;
  }

  private async maxAreaMinutes(db: Tx, userId: string): Promise<number> {
    const sums = await db.completion.groupBy({
      by: ['areaId'],
      where: { userId, undoneAt: null },
      _sum: { durationMin: true },
    });
    return Math.max(0, ...sums.map((row) => row._sum.durationMin ?? 0));
  }

  private async restCount(db: Tx, userId: string): Promise<number> {
    const areas = await db.area.findMany({ where: { userId }, select: { id: true, name: true } });
    const restIds = areas.filter((area) => isRestArea(area.name)).map((area) => area.id);
    if (restIds.length === 0) return 0;
    return db.completion.count({ where: { userId, undoneAt: null, areaId: { in: restIds } } });
  }

  /**
   * A lista de conquistas (todas as do catálogo): o que já foi desbloqueado, quando, e o progresso das que se
   * medem em números. O status vem da tabela (permanente); só o progresso é recalculado.
   */
  async list(userId: string): Promise<Achievement[]> {
    const rows = await this.prisma.achievement.findMany({ where: { userId } });
    const unlockedAt = new Map(rows.map((row) => [row.key, row.unlockedAt]));

    const facts = { ...NEUTRAL };
    const pending = ACHIEVEMENT_KEYS.filter((key) => !unlockedAt.has(key));
    const numeric = (...keys: AchievementKey[]) => keys.some((key) => pending.includes(key));
    if (numeric('hundred_hours'))
      facts.maxAreaMinutes = await this.maxAreaMinutes(this.prisma, userId);
    if (numeric('deserved_rest')) facts.restCount = await this.restCount(this.prisma, userId);
    if (numeric('constant', 'unshakeable')) {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { timezone: true },
      });
      const today = todayIn(user.timezone, this.clock.now());
      const { occurrences, completedKeys } = await this.history.load(userId, today);
      facts.bestStreak = computeStreak(buildStreakDays(occurrences, completedKeys), today).best;
    }

    return ACHIEVEMENT_KEYS.map((key) => {
      const at = unlockedAt.get(key) ?? null;
      const info = ACHIEVEMENT_CATALOG[key];
      return {
        key,
        title: info.title,
        description: info.description,
        unlocked: at !== null,
        unlockedAt: at?.toISOString() ?? null,
        // Desbloqueada = barra cheia (o progresso não "volta" se, depois, a sequência cair).
        progress: at !== null ? fullBar(key) : achievementProgress(key, facts),
      };
    });
  }
}

/** A barra de uma conquista numérica já desbloqueada: cheia, no alvo. */
function fullBar(key: AchievementKey): { current: number; target: number } | null {
  const bar = achievementProgress(key, {
    ...NEUTRAL,
    bestStreak: Number.MAX_SAFE_INTEGER,
    maxAreaMinutes: Number.MAX_SAFE_INTEGER,
    restCount: Number.MAX_SAFE_INTEGER,
  });
  return bar;
}
