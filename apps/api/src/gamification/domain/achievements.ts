import {
  addDays,
  BALANCED_AREA_PERCENT,
  CONSTANT_STREAK_DAYS,
  DESERVED_REST_BLOCKS,
  HUNDRED_HOURS_MINUTES,
  UNSHAKEABLE_STREAK_DAYS,
  ACHIEVEMENT_KEYS,
  type AchievementKey,
  type CivilDate,
  type Occurrence,
  type RewardTrigger,
} from '@lifexp/shared';
import { requiredCount } from './quest.js';

/** Os números de que as regras das conquistas precisam. Quem os lê do banco é o serviço; aqui só se decide. */
export interface AchievementFacts {
  /** Conclusões ativas (não desfeitas). */
  completionCount: number;
  /** Quests semanais cumpridas. */
  questCompletedCount: number;
  /** O maior streak da história (derivado do histórico). */
  bestStreak: number;
  /** Minutos cumpridos na área em que a pessoa mais acumulou. */
  maxAreaMinutes: number;
  /** Blocos cumpridos em áreas de descanso. */
  restCount: number;
  completedGoalCount: number;
  /** Alguma semana em que todas as áreas ativas cumpriram a parte mínima do que planejaram. */
  balancedWeekReached: boolean;
}

const RULES: Record<AchievementKey, (facts: AchievementFacts) => boolean> = {
  first_step: (f) => f.completionCount >= 1,
  full_week: (f) => f.questCompletedCount >= 1,
  constant: (f) => f.bestStreak >= CONSTANT_STREAK_DAYS,
  unshakeable: (f) => f.bestStreak >= UNSHAKEABLE_STREAK_DAYS,
  balanced: (f) => f.balancedWeekReached,
  hundred_hours: (f) => f.maxAreaMinutes >= HUNDRED_HOURS_MINUTES,
  dream_realized: (f) => f.completedGoalCount >= 1,
  deserved_rest: (f) => f.restCount >= DESERVED_REST_BLOCKS,
};

/** As conquistas que os fatos já merecem e a pessoa ainda não tem, na ordem do catálogo. */
export function newlyUnlocked(
  facts: AchievementFacts,
  unlocked: ReadonlySet<AchievementKey>,
): AchievementKey[] {
  return ACHIEVEMENT_KEYS.filter((key) => !unlocked.has(key) && RULES[key](facts));
}

/** Barra de progresso das conquistas medidas em números; as demais não têm (nulo). */
export function achievementProgress(
  key: AchievementKey,
  facts: AchievementFacts,
): { current: number; target: number } | null {
  const bar = (value: number, target: number) => ({ current: Math.min(value, target), target });
  switch (key) {
    case 'constant':
      return bar(facts.bestStreak, CONSTANT_STREAK_DAYS);
    case 'unshakeable':
      return bar(facts.bestStreak, UNSHAKEABLE_STREAK_DAYS);
    case 'hundred_hours':
      return bar(facts.maxAreaMinutes, HUNDRED_HOURS_MINUTES);
    case 'deserved_rest':
      return bar(facts.restCount, DESERVED_REST_BLOCKS);
    default:
      return null;
  }
}

/**
 * "Descanso" não é um tipo de área no banco: é a área padrão com esse nome. Compara sem diferença de
 * maiúsculas ou espaços nas pontas, mas renomear a área tira dela esse papel (limitação documentada).
 */
export const isRestArea = (name: string): boolean => name.trim().toLowerCase() === 'descanso';

/** Menos de 2 áreas ativas não forma um "equilíbrio": o desbloqueio seria trivial. */
const MIN_AREAS_FOR_BALANCE = 2;

/**
 * "Equilibrado": na semana de `weekStart`, TODAS as áreas ativas tiveram bloco planejado e cada uma cumpriu
 * ao menos 80% dos seus blocos (a mesma conta da quest, por área). Pulado não conta como planejado (RN11).
 * `completedKeys` usa `blockId|occurrenceDate` (RN32).
 */
export function isBalancedWeek(
  occurrences: readonly Occurrence[],
  completedKeys: ReadonlySet<string>,
  activeAreaIds: readonly string[],
  weekStart: CivilDate,
): boolean {
  if (activeAreaIds.length < MIN_AREAS_FOR_BALANCE) return false;
  const weekEnd = addDays(weekStart, 6);
  const tally = new Map<string, { planned: number; completed: number }>();
  for (const occurrence of occurrences) {
    if (occurrence.skipped || occurrence.date < weekStart || occurrence.date > weekEnd) continue;
    const entry = tally.get(occurrence.areaId) ?? { planned: 0, completed: 0 };
    entry.planned += 1;
    if (completedKeys.has(`${occurrence.blockId}|${occurrence.occurrenceDate}`))
      entry.completed += 1;
    tally.set(occurrence.areaId, entry);
  }
  return activeAreaIds.every((areaId) => {
    const entry = tally.get(areaId);
    return (
      entry !== undefined &&
      entry.planned > 0 &&
      entry.completed >= requiredCount(entry.planned, BALANCED_AREA_PERCENT)
    );
  });
}

/** O que o gatilho de uma recompensa consulta. */
export interface RewardFacts {
  level: number;
  totalXp: number;
  bestStreak: number;
  unlocked: ReadonlySet<AchievementKey>;
}

/** O gatilho foi atingido? Nível, XP e streak são "pelo menos"; conquista é "tem". */
export function isRewardReached(trigger: RewardTrigger, facts: RewardFacts): boolean {
  switch (trigger.type) {
    case 'level':
      return facts.level >= trigger.threshold;
    case 'total_xp':
      return facts.totalXp >= trigger.threshold;
    case 'streak':
      return facts.bestStreak >= trigger.threshold;
    case 'achievement':
      return facts.unlocked.has(trigger.achievementKey);
  }
}
