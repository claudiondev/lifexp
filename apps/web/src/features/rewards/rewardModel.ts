import {
  ACHIEVEMENT_CATALOG,
  type Reward,
  type RewardStatus,
  type RewardTrigger,
} from '@lifexp/shared';

/** Frase do gatilho, no tom de quem se dá um prêmio ("Ao chegar ao nível 5"). */
export function describeTrigger(trigger: RewardTrigger): string {
  switch (trigger.type) {
    case 'level':
      return `Ao chegar ao nível ${trigger.threshold}`;
    case 'streak':
      return `Ao alcançar ${trigger.threshold} ${trigger.threshold === 1 ? 'dia' : 'dias'} de streak`;
    case 'total_xp':
      return `Ao somar ${trigger.threshold} XP`;
    case 'achievement':
      return `Ao desbloquear a conquista “${ACHIEVEMENT_CATALOG[trigger.achievementKey].title}”`;
  }
}

export const STATUS_ORDER: readonly RewardStatus[] = ['available', 'locked', 'redeemed'];

export const STATUS_HEADING: Record<RewardStatus, string> = {
  available: 'Prontas para resgatar',
  locked: 'Em andamento',
  redeemed: 'Já resgatadas',
};

/** Agrupa por situação, na ordem das seções; seção sem recompensas não aparece. */
export function groupByStatus(rewards: readonly Reward[]) {
  return STATUS_ORDER.map((status) => ({
    status,
    heading: STATUS_HEADING[status],
    rewards: rewards.filter((reward) => reward.status === status),
  })).filter((group) => group.rewards.length > 0);
}

export type TriggerType = RewardTrigger['type'];

export const TRIGGER_TYPES: readonly { type: TriggerType; label: string; unit: string }[] = [
  { type: 'level', label: 'Nível geral', unit: 'Nível' },
  { type: 'streak', label: 'Dias de streak', unit: 'Dias' },
  { type: 'total_xp', label: 'XP total', unit: 'XP' },
  { type: 'achievement', label: 'Uma conquista', unit: '' },
];
