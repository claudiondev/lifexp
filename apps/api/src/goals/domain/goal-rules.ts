import type { CivilDate } from '@lifexp/shared';

export type GoalStatus = 'ACTIVE' | 'COMPLETED' | 'PAUSED' | 'ABANDONED';

export interface GoalProgressInput {
  targetValue: number | null;
  currentValue: number | null;
  milestonesDone: number;
  milestonesTotal: number;
}

export interface GoalProgress {
  /** De 0 a 1; nulo quando a meta não tem como ser medida (sem métrica e sem marcos). */
  ratio: number | null;
  source: 'metric' | 'milestones' | null;
}

/**
 * Progresso da meta (RN19): com métrica, valor atual ÷ alvo; sem métrica, marcos concluídos ÷ total.
 * A métrica tem precedência quando as duas existem. Passar do alvo conta como 100% (não há 120%).
 * Sem métrica e sem marcos não há como medir (RN20): o progresso é indefinido, não 0%.
 */
export function goalProgress(input: GoalProgressInput): GoalProgress {
  if (input.targetValue !== null && input.targetValue > 0) {
    const current = Math.max(0, input.currentValue ?? 0);
    return { ratio: Math.min(1, current / input.targetValue), source: 'metric' };
  }
  if (input.milestonesTotal > 0) {
    return { ratio: input.milestonesDone / input.milestonesTotal, source: 'milestones' };
  }
  return { ratio: null, source: null };
}

/**
 * Meta atrasada (RN22): prazo vencido e meta ainda em aberto (ativa ou pausada). É derivado, não
 * gravado: sempre bate com a data de hoje, sem job agendado, e nunca tira XP. O prazo vale até o
 * fim do próprio dia: no dia do prazo a meta ainda não está atrasada.
 */
export function isOverdue(input: {
  status: GoalStatus;
  deadline: CivilDate | null;
  today: CivilDate;
}): boolean {
  if (input.deadline === null) return false;
  if (input.status !== 'ACTIVE' && input.status !== 'PAUSED') return false;
  return input.deadline < input.today;
}

export type StatusXpEffect = 'award' | 'reverse' | 'none';

/**
 * O que a troca de status faz com o XP da meta (RN21): concluir concede o XP da meta; reabrir uma
 * meta concluída (ou abandoná-la/pausá-la) estorna esse XP. Qualquer outra troca não mexe no XP.
 */
export function statusXpEffect(from: GoalStatus, to: GoalStatus): StatusXpEffect {
  if (from === to) return 'none';
  if (to === 'COMPLETED') return 'award';
  if (from === 'COMPLETED') return 'reverse';
  return 'none';
}

/** A meta está pronta para ser concluída pela pessoa (100% medido)? Nunca conclui sozinha. */
export function isReadyToComplete(progress: GoalProgress): boolean {
  return progress.ratio !== null && progress.ratio >= 1;
}
