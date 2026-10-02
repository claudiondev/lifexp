import { ACHIEVEMENT_CATALOG, type AchievementKey, type RewardRef } from '@lifexp/shared';
import { toast } from 'sonner';

interface Unlocks {
  achievementsUnlocked: AchievementKey[];
  rewardsReached: RewardRef[];
}

/**
 * Avisa o que a ação acabou de desbloquear (RF23, RF25): uma mensagem por conquista e por recompensa.
 * Só recompensa: nada aqui é mostrado quando uma ação é desfeita.
 */
export function announceUnlocks({ achievementsUnlocked, rewardsReached }: Unlocks): void {
  for (const key of achievementsUnlocked) {
    const info = ACHIEVEMENT_CATALOG[key];
    toast.success(`Conquista desbloqueada: ${info.title}`, { description: info.description });
  }
  for (const reward of rewardsReached) {
    toast.success(`Recompensa desbloqueada: ${reward.title}`, {
      description: 'Você pode resgatá-la em Recompensas.',
    });
  }
}
