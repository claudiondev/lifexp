import type { Goal, GoalStatus } from '@lifexp/shared';
import { formatDuration } from '../blocks/blockOptions';

export const STATUS_LABEL: Record<GoalStatus, string> = {
  active: 'Ativa',
  completed: 'Concluída',
  paused: 'Pausada',
  abandoned: 'Abandonada',
};

/** Abas da lista de metas, na ordem em que aparecem. */
export const STATUS_FILTERS: { value: GoalStatus; label: string }[] = [
  { value: 'active', label: 'Ativas' },
  { value: 'paused', label: 'Pausadas' },
  { value: 'completed', label: 'Concluídas' },
  { value: 'abandoned', label: 'Abandonadas' },
];

/** "0 min" a "1 h 30 min": o tempo que os blocos cumpridos somaram para a meta. */
export const formatInvested = (minutes: number): string => formatDuration(minutes);

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
export const formatNumber = (value: number): string => number.format(value);

/** Porcentagem inteira, de 0 a 100; nula quando a meta ainda não tem como ser medida. */
export function progressPercent(goal: Pick<Goal, 'progress'>): number | null {
  return goal.progress.ratio === null ? null : Math.round(goal.progress.ratio * 100);
}

/** A frase curta de progresso que aparece no cartão e no detalhe. */
export function progressText(goal: Goal): string {
  if (goal.progress.source === 'metric') {
    const unit = goal.unit ? ` ${goal.unit}` : '';
    return `${formatNumber(goal.currentValue ?? 0)} de ${formatNumber(goal.targetValue ?? 0)}${unit}`;
  }
  if (goal.progress.source === 'milestones') {
    const done = goal.milestones.filter((milestone) => milestone.done).length;
    return `${done} de ${goal.milestones.length} ${goal.milestones.length === 1 ? 'marco' : 'marcos'}`;
  }
  return 'Adicione marcos ou uma métrica para medir o progresso';
}

export interface StatusAction {
  to: GoalStatus;
  label: string;
  /** O botão principal da tela: concluir a meta. */
  primary?: boolean;
  /** Aviso curto sobre o que isso faz com o XP. */
  hint?: string;
}

/** Ações de status disponíveis em cada estado da meta (RF31). Concluir rende +500 XP; reabrir devolve. */
export function statusActions(status: GoalStatus): StatusAction[] {
  switch (status) {
    case 'active':
      return [
        { to: 'completed', label: 'Concluir meta', primary: true, hint: '+500 XP' },
        { to: 'paused', label: 'Pausar' },
        { to: 'abandoned', label: 'Abandonar' },
      ];
    case 'paused':
      return [
        { to: 'active', label: 'Retomar' },
        { to: 'completed', label: 'Concluir meta', primary: true, hint: '+500 XP' },
        { to: 'abandoned', label: 'Abandonar' },
      ];
    case 'completed':
      return [{ to: 'active', label: 'Reabrir meta', hint: 'Devolve os 500 XP da meta' }];
    case 'abandoned':
      return [{ to: 'active', label: 'Reativar meta' }];
  }
}

/** Só metas em andamento aceitam concluir ou desfazer marcos (a API responde 409 nas outras). */
export const allowsMilestoneToggle = (status: GoalStatus): boolean =>
  status === 'active' || status === 'paused';
