import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateRewardInput } from '@lifexp/shared';
import * as rewardsApi from './rewardsApi';

export const rewardsKey = ['rewards'] as const;

/**
 * As recompensas reais (RF25). Concluir blocos, marcos e metas pode atingir um gatilho, então essas mutações
 * invalidam esta chave (veja `useCompletionMutations` e `useGoalMutations`).
 */
export function useRewards() {
  return useQuery({ queryKey: rewardsKey, queryFn: rewardsApi.listRewards });
}

export function useRewardMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: rewardsKey });
  return {
    create: useMutation({ mutationFn: rewardsApi.createReward, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateRewardInput }) =>
        rewardsApi.updateReward(id, input),
      onSuccess: refresh,
    }),
    redeem: useMutation({ mutationFn: rewardsApi.redeemReward, onSuccess: refresh }),
    remove: useMutation({ mutationFn: rewardsApi.deleteReward, onSuccess: refresh }),
  };
}
