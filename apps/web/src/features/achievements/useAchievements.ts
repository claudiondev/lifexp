import { useQuery } from '@tanstack/react-query';
import { listAchievements } from './achievementsApi';

export const achievementsKey = ['achievements'] as const;

/**
 * As conquistas (RF23). Concluir blocos, marcos e metas e cumprir a quest podem desbloquear algo, então
 * essas mutações invalidam esta chave (veja `useCompletionMutations` e `useGoalMutations`).
 */
export function useAchievements() {
  return useQuery({ queryKey: achievementsKey, queryFn: listAchievements });
}
